-- Admin-editable SMTP port (see lib/email/mailer.ts) — previously
-- hardcoded to 587 (STARTTLS). Null = fall back to GMAIL_SMTP_PORT in
-- .env.local, then 587, same precedence as the other gmail_* settings.
alter table public.email_settings
  add column gmail_smtp_port integer;
