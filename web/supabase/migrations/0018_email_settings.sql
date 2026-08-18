-- Admin-editable SMTP/email settings (Gmail/Workspace App Password auth),
-- previously configurable only via GMAIL_USER/GMAIL_APP_PASSWORD/
-- GMAIL_FROM_NAME in .env.local (see lib/email/mailer.ts). Single row
-- (id = true) since the app sends from exactly one mailbox. DB values take
-- priority over env vars at send time when present, letting an admin
-- rotate credentials without a redeploy.
create table public.email_settings (
  id boolean primary key default true,
  gmail_user text,
  gmail_app_password text,
  gmail_from_name text,
  updated_at timestamptz not null default now(),
  constraint email_settings_singleton check (id)
);

alter table public.email_settings enable row level security;

-- Admin-only in both directions — unlike properties/approvers (world
-- readable to any authenticated user), this table holds a live SMTP
-- password. mailer.ts does NOT read it through this RLS-gated path (it
-- must work for issuers/anonymous approvers too); it reads through the
-- service-role client instead (lib/supabase/serviceRole.ts).
create policy email_settings_select on public.email_settings
  for select to authenticated
  using ((select private.is_admin()));

create policy email_settings_insert on public.email_settings
  for insert to authenticated
  with check ((select private.is_admin()));

create policy email_settings_update on public.email_settings
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
