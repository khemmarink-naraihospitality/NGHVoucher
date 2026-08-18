import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { sendMail } from "@/lib/email/mailer";

// Called once per newly-pending signup, right after OAuth exchange in
// app/auth/callback/route.ts. Uses the service-role client throughout: the
// new user's own session can read their own profiles row but not update it
// (profiles_update is admin-only, 0008_admin_page.sql) and can't read any
// other profiles row at all, including admins' emails (profiles_select is
// self-or-admin only, 0001_init.sql) — there's no session-bound client that
// could do this lookup even with correct RLS.
//
// pending_notified_at (0033) makes this idempotent: a pending user retrying
// login while they wait doesn't re-email every admin on every attempt, and
// once approved (status flips to "active") this is permanently skipped.
export async function notifyAdminsOfPendingSignup(userId: string): Promise<void> {
  const supabase = createServiceRoleClient();
  if (!supabase) return;

  const { data: newProfile } = await supabase
    .from("profiles")
    .select("email, full_name, status, pending_notified_at")
    .eq("id", userId)
    .maybeSingle();

  if (!newProfile || newProfile.status !== "pending" || newProfile.pending_notified_at) return;

  const { data: admins } = await supabase.from("profiles").select("email").eq("role", "admin").eq("status", "active");

  const adminEmails = (admins ?? []).map((a) => a.email).filter((email): email is string => Boolean(email));
  if (adminEmails.length === 0) return;

  const displayName = newProfile.full_name || newProfile.email;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const subject = `New signup awaiting approval: ${displayName}`;
  const text = `${displayName} (${newProfile.email}) just signed in and is waiting for approval.\n\nApprove or reject them in Admin -> Users: ${appUrl}/admin#users`;
  const html = `<p><strong>${displayName}</strong> (${newProfile.email}) just signed in and is waiting for approval.</p><p><a href="${appUrl}/admin#users">Approve or reject them in Admin &rarr; Users</a></p>`;

  await Promise.all(adminEmails.map((to) => sendMail({ to, subject, html, text })));

  await supabase.from("profiles").update({ pending_notified_at: new Date().toISOString() }).eq("id", userId);
}
