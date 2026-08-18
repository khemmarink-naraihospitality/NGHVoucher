import { createClient } from "@/lib/supabase/server";
import { sendMail } from "@/lib/email/mailer";
import { renderIssuerRejectedEmail } from "@/lib/email/issuerNotificationEmail";

// Approver action (PRD §4 step 8): flips status -> rejected and releases
// the running numbers back into the reuse pool (see submit_voucher_batch /
// reject_voucher_batch in supabase/migrations/0003). No login — the
// approval_token is the auth.
export const runtime = "nodejs";

interface VoucherBatchRow {
  running_no: string;
  property_name: string;
  issuer_name: string | null;
  issuer_email: string | null;
}

export async function POST(request: Request) {
  let body: { token?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.token) {
    return Response.json({ error: "token is required." }, { status: 400 });
  }
  if (!body.reason || !body.reason.trim()) {
    return Response.json({ error: "A rejection reason is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reject_voucher_batch", {
    p_token: body.token,
    p_reason: body.reason,
  });

  if (error) {
    console.error("reject_voucher_batch failed:", error.message);
    return Response.json({ error: "Failed to reject." }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return Response.json(
      { error: "This request was already processed or the link has expired." },
      { status: 409 },
    );
  }

  // Best-effort — a failed notification shouldn't make the rejection
  // itself look like it failed (same posture as api/approve's export step).
  const { data: details, error: detailsError } = await supabase.rpc("get_voucher_batch_by_token", {
    p_token: body.token,
  });

  if (detailsError) {
    console.error("get_voucher_batch_by_token failed after reject:", detailsError.message);
  } else {
    const [firstRow] = (details ?? []) as VoucherBatchRow[];
    if (firstRow?.issuer_email) {
      const { subject, html, text } = await renderIssuerRejectedEmail({
        issuerName: firstRow.issuer_name ?? firstRow.issuer_email,
        propertyName: firstRow.property_name,
        runningNumbers: (details as VoucherBatchRow[]).map((row) => row.running_no),
        reason: body.reason,
        historyUrl: `${process.env.NEXT_PUBLIC_APP_URL}/history`,
      });
      await sendMail({ to: firstRow.issuer_email, subject, html, text });
    }
  }

  return Response.json({ rejected: true });
}
