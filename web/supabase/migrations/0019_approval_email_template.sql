-- Optional admin-editable override for the approval-request email's
-- subject/html/text (see lib/email/approvalEmail.ts). Null = use the
-- built-in default template. Stored as {{token}} templates (e.g.
-- {{approverName}}), rendered with real values at send time — not
-- pre-rendered HTML, since the same row is reused for every voucher
-- submission with different approver/property/running-number values.
alter table public.email_settings
  add column approval_subject_template text,
  add column approval_html_template text,
  add column approval_text_template text;
