import { createClient } from "@/lib/supabase/server";

// Daily sweep (PRD §12): flips approved vouchers past validity_end to
// expired. Triggered by Vercel Cron (see vercel.json) — Vercel sends
// `Authorization: Bearer ${CRON_SECRET}` automatically for its own calls
// once that env var is set on the project; this route is the real gate,
// since expire_overdue_vouchers() itself has to be anon-callable (no
// service-role client exists in this codebase — see supabase/migrations/
// 0014_revoke_claim_expiry.sql for why that's an accepted trade-off).
export const runtime = "nodejs";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("expire_overdue_vouchers");

  if (error) {
    console.error("expire_overdue_vouchers failed:", error.message);
    return Response.json({ error: "Failed to expire vouchers." }, { status: 500 });
  }

  return Response.json({ expiredCount: data });
}
