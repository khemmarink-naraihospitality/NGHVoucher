-- New feature: Google sign-ins now land in a 'pending' state and are
-- blocked from the app (gated in every protected page via
-- getCurrentProfile().status, redirecting to /pending) until an admin
-- approves them and assigns properties from Admin -> Users. Approvers are
-- unaffected — they're a separate, login-less entity (approvers table,
-- act only via emailed token links), nothing here touches that flow.
--
-- Two-step ALTER so existing users aren't locked out: backfill everyone
-- currently in the table to 'active' via the column default (applies to
-- existing rows), then flip the default to 'pending' for every signup
-- from now on.
alter table public.profiles add column status text not null default 'active'
  check (status in ('pending', 'active', 'rejected'));
alter table public.profiles alter column status set default 'pending';

-- Tracks whether the "new pending signup" admin-notification email has
-- already fired for this row (src/lib/auth/notifyPendingSignup.ts, called
-- from the OAuth callback) — a pending user retrying login while waiting
-- shouldn't re-email every admin on every attempt. Set once via the
-- service-role client: the new user's own session can read their own row
-- but can't update it (profiles_update is admin-only, see 0008).
alter table public.profiles add column pending_notified_at timestamptz;

-- handle_new_user: drops the "grant every property to every new signup"
-- stopgap (its own original comment already called this out — "Replace
-- with real Admin-driven user_properties assignment once that page
-- ships", which is happening now) and defaults every signup except the
-- very first ever account to 'pending' instead of an immediately-usable
-- issuer with access to everything. The very first signup still
-- bootstraps straight to admin+active — nobody could approve them
-- otherwise, and private.is_admin() doesn't depend on user_properties
-- rows anyway (0001_init.sql), so it doesn't need the stopgap grant either.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_first boolean := not exists (select 1 from public.profiles);
begin
  insert into public.profiles (id, email, full_name, role, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', new.email),
    case when v_is_first then 'admin' else 'issuer' end,
    case when v_is_first then 'active' else 'pending' end
  );

  return new;
end;
$$;
