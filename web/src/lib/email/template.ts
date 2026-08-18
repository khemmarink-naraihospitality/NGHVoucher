import { createServiceRoleClient } from "@/lib/supabase/serviceRole";

// Shared {{token}} substitution for outbound email templates — not a
// templating engine, since each email's variable set is small and fixed.
// Unknown {{tokens}} are left as literal text rather than silently
// dropped, so a typo in a template is visible instead of vanishing.
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => (key in vars ? vars[key] : match));
}

export interface EmailTemplateFields {
  subject: string;
  html: string;
  text: string;
}

export interface EmailTemplateColumns {
  subject: string;
  html: string;
  text: string;
}

// Shared by every email_settings-backed template (approval, issuer
// approved, issuer rejected): each is admin-only under RLS (it's the same
// row that holds the SMTP password — see migration 0018), but rendering
// runs on behalf of whoever's action triggers the send (an issuer
// submitting, or an anonymous token-authenticated approver), who can't
// pass that RLS check themselves. The service-role client bypasses it;
// returns null (falling back to the caller's default template) if the
// service role key isn't configured or nothing custom was saved.
export async function getCustomEmailTemplate(
  columns: EmailTemplateColumns,
): Promise<Partial<EmailTemplateFields> | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("email_settings")
    .select(`${columns.subject}, ${columns.html}, ${columns.text}`)
    .eq("id", true)
    .maybeSingle();

  if (error) {
    console.error(`[email] failed to read ${columns.subject.replace(/_subject_template$/, "")} template:`, error.message);
    return null;
  }
  if (!data) return null;

  const row = data as unknown as Record<string, string | null>;
  return {
    subject: row[columns.subject] ?? undefined,
    html: row[columns.html] ?? undefined,
    text: row[columns.text] ?? undefined,
  };
}
