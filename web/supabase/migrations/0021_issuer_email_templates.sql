-- Admin-editable overrides for the two issuer-notification emails
-- (lib/email/issuerNotificationEmail.ts), same pattern as
-- approval_*_template added in 0019. Null = use the built-in default.
alter table public.email_settings
  add column issuer_approved_subject_template text,
  add column issuer_approved_html_template text,
  add column issuer_approved_text_template text,
  add column issuer_rejected_subject_template text,
  add column issuer_rejected_html_template text,
  add column issuer_rejected_text_template text;
