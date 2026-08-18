import { createClient } from "@supabase/supabase-js";

// Server-only client authenticated with the service role key — bypasses
// RLS entirely. Used exclusively by lib/email/mailer.ts to read
// email_settings on behalf of callers who can't pass that table's
// admin-only RLS themselves: an issuer submitting a voucher, or an
// anonymous token-authenticated approver. Returns null (rather than
// throwing) when SUPABASE_SERVICE_ROLE_KEY isn't set, so the mailer can
// fall back to GMAIL_* env vars — same "degrade, don't break" posture as
// the rest of lib/email/mailer.ts.
//
// Never import this outside server-only modules — the service role key
// must not reach a client bundle.
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
