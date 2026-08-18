import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { sendMail } from "@/lib/email/mailer";
import { renderIssuerApprovedEmail } from "@/lib/email/issuerNotificationEmail";
import { buildTemplateConfig, type TemplateConfigJson } from "@/lib/templates/config";
import { renderVoucherFiles } from "@/lib/voucher/export";
import {
  formatBlackoutText,
  formatRoomTypeNights,
  formatValidityRange,
  formatVoucherDate,
} from "@/lib/voucher/format";

// Approver action (PRD §4 step 7, §7): flips status -> approved via the
// token-gated RPC, then renders + uploads JPEG/PDF per voucher in the batch
// and records the paths. No login — the approval_token *is* the auth.
export const runtime = "nodejs";

interface VoucherBatchRow {
  id: string;
  running_no: string;
  property_code: string;
  property_name: string;
  template_config: TemplateConfigJson;
  room_type_names: string[];
  nights: number;
  breakfast_included: boolean;
  blackout_text: string | null;
  validity_start: string;
  validity_end: string;
  approved_at: string | null;
  approver_position: string | null;
  approver_signature_url: string | null;
  issuer_name: string | null;
  issuer_email: string | null;
}

export async function POST(request: Request) {
  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.token) {
    return Response.json({ error: "token is required." }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: approvedRows, error: approveError } = await supabase.rpc("approve_voucher_batch", {
    p_token: body.token,
  });

  if (approveError) {
    console.error("approve_voucher_batch failed:", approveError.message);
    return Response.json({ error: "Failed to approve." }, { status: 500 });
  }

  if (!approvedRows || approvedRows.length === 0) {
    return Response.json(
      { error: "This request was already processed or the link has expired." },
      { status: 409 },
    );
  }

  const { data: details, error: detailsError } = await supabase.rpc("get_voucher_batch_by_token", {
    p_token: body.token,
  });

  if (detailsError || !details) {
    console.error("get_voucher_batch_by_token failed after approve:", detailsError?.message);
    // The status flip already succeeded — export failure shouldn't look
    // like the approval itself failed.
    return Response.json({ approved: true, exported: false });
  }

  // Storage uploads use the service-role client, not the request-scoped
  // one above — the vouchers bucket has no anon/authenticated grants at
  // all (migration 0025): upload(..., { upsert: true }) compiles to an
  // INSERT ... ON CONFLICT DO UPDATE ... RETURNING, which needs RLS
  // SELECT-visibility to evaluate even for a brand-new row, and granting
  // that to anon/authenticated would let anyone read arbitrary voucher
  // files via the authenticated-download endpoint regardless of the
  // bucket's public flag — the exact hole 0023 closed. Service-role
  // bypasses RLS entirely and never reaches the browser.
  const storageClient = createServiceRoleClient();
  let exportFailed = false;

  for (const row of details as VoucherBatchRow[]) {
    const template = buildTemplateConfig(row.property_code, row.property_code, row.template_config);
    if (!template) {
      // Property has no visual template yet (PRD §12: some properties are
      // pre-created before their template art exists) — approval still
      // stands, just nothing to render.
      continue;
    }

    if (!storageClient) {
      exportFailed = true;
      console.error(`Export failed for ${row.running_no}: SUPABASE_SERVICE_ROLE_KEY not configured.`);
      continue;
    }

    try {
      const { jpeg, pdf } = await renderVoucherFiles(
        template,
        {
          runningNo: row.running_no,
          roomTypeNightsLabel: formatRoomTypeNights(row.room_type_names, row.nights),
          breakfastIncluded: row.breakfast_included,
          validityLabel: formatValidityRange(row.validity_start, row.validity_end),
          blackoutText: formatBlackoutText(row.blackout_text ?? ""),
          approverPosition: row.approver_position ?? undefined,
          approvedDateLabel: row.approved_at ? formatVoucherDate(row.approved_at.slice(0, 10)) : undefined,
        },
        row.approver_signature_url ?? undefined,
      );

      const safeName = row.running_no.replace("/", "-");
      const jpegPath = `${row.property_code}/${safeName}.jpg`;
      const pdfPath = `${row.property_code}/${safeName}.pdf`;

      const [jpegUpload, pdfUpload] = await Promise.all([
        storageClient.storage.from("vouchers").upload(jpegPath, jpeg, { contentType: "image/jpeg", upsert: true }),
        storageClient.storage
          .from("vouchers")
          .upload(pdfPath, pdf, { contentType: "application/pdf", upsert: true }),
      ]);

      if (jpegUpload.error || pdfUpload.error) {
        throw jpegUpload.error ?? pdfUpload.error;
      }

      // Random, not derived from anything guessable (running_no, voucher
      // id) — the vouchers bucket is private now (migration 0023), so this
      // code, not the storage path, is what stands in for auth when a
      // guest with no account opens app/v/[code]. 48 bits of entropy from
      // 6 random bytes, base64url-encoded to 8 URL-safe characters.
      const shareCode = randomBytes(6).toString("base64url");

      await supabase.rpc("set_voucher_export_files", {
        p_voucher_id: row.id,
        p_jpeg_path: jpegPath,
        p_pdf_path: pdfPath,
        p_share_code: shareCode,
      });
    } catch (err) {
      exportFailed = true;
      console.error(`Export failed for ${row.running_no}:`, err instanceof Error ? err.message : err);
    }
  }

  // Best-effort, same posture as export above — a failed notification
  // shouldn't make the approval itself look like it failed.
  const [firstRow] = details as VoucherBatchRow[];
  if (firstRow?.issuer_email) {
    const { subject, html, text } = await renderIssuerApprovedEmail({
      issuerName: firstRow.issuer_name ?? firstRow.issuer_email,
      propertyName: firstRow.property_name,
      runningNumbers: (details as VoucherBatchRow[]).map((row) => row.running_no),
      historyUrl: `${process.env.NEXT_PUBLIC_APP_URL}/history`,
    });
    await sendMail({ to: firstRow.issuer_email, subject, html, text });
  }

  return Response.json({ approved: true, exported: !exportFailed });
}
