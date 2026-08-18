import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";

// Long enough to survive a slow connection between the redirect and the
// browser actually starting the download, short enough that the signed
// URL is useless to anyone who intercepts/logs it afterward. Doesn't
// affect server load either way — this is just the validity window baked
// into the signature, not something the server polls or holds open.
const SIGNED_URL_TTL_SECONDS = 60;

interface VoucherShareFileRow {
  status: string;
  exported_jpeg_path: string | null;
  exported_pdf_path: string | null;
}

// Backs both app/v/[code]/jpg/route.ts and .../pdf/route.ts. The lookup
// itself runs through the normal (possibly anonymous) session-bound
// client — get_voucher_by_share_code is security definer and anon-
// callable, same "possession of the code is the auth" posture as the
// approval_token flow. Only the actual signed-URL creation needs the
// service-role client, since the vouchers bucket is private and an
// anonymous guest has no storage-level grant of their own.
export async function redirectToVoucherFile(code: string, format: "jpg" | "pdf"): Promise<Response> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_voucher_by_share_code", { p_code: code });
  const row = (data as VoucherShareFileRow[] | null)?.[0];

  // share_code itself never expires, but what it unlocks follows the
  // voucher's lifecycle — once claimed/revoked/expired, the file stops
  // being served even though the link still resolves (see app/v/[code]/
  // page.tsx for the matching status message).
  if (row && row.status !== "approved") {
    return new Response("This voucher is no longer available.", { status: 410 });
  }

  const path = format === "jpg" ? row?.exported_jpeg_path : row?.exported_pdf_path;

  if (!path) {
    return new Response("Voucher file not found.", { status: 404 });
  }

  const serviceClient = createServiceRoleClient();
  if (!serviceClient) {
    console.error("[voucher share] SUPABASE_SERVICE_ROLE_KEY not configured — can't sign voucher file URLs.");
    return new Response("File storage isn't configured.", { status: 500 });
  }

  const { data: signed, error } = await serviceClient.storage
    .from("vouchers")
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !signed) {
    console.error("[voucher share] failed to sign URL:", error?.message);
    return new Response("Failed to generate a download link.", { status: 500 });
  }

  return Response.redirect(signed.signedUrl, 302);
}
