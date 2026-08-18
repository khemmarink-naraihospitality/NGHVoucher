-- Lub d Room Voucher Generator — initial schema
-- Matches PRD §8 (Data Model), with primary-key/index/RLS choices per
-- Supabase Postgres best practices.
--
-- Scope note: this migration creates tables, indexes, and read-only RLS
-- policies. Write policies (issuer insert, approver-token update, the
-- concurrency-safe running-number reservation function from PRD §6.4) are
-- Phase 2 scope and land in a later migration once the approval flow is built.

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- profiles — one row per authenticated user, mirrors auth.users
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'issuer' check (role in ('issuer', 'approver', 'admin')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- properties
-- code = running-number prefix, e.g. LDBS, LDCH — admin-editable per PRD §12
-- ---------------------------------------------------------------------------
create table if not exists public.properties (
  id bigint generated always as identity primary key,
  code text not null unique,
  name text not null,
  template_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- user_properties — admin assigns which users can see which properties
-- ---------------------------------------------------------------------------
create table if not exists public.user_properties (
  user_id uuid not null references public.profiles (id) on delete cascade,
  property_id bigint not null references public.properties (id) on delete cascade,
  primary key (user_id, property_id)
);

create index if not exists user_properties_property_id_idx
  on public.user_properties (property_id);

-- ---------------------------------------------------------------------------
-- room_types — master list, split per property (PRD §5)
-- ---------------------------------------------------------------------------
create table if not exists public.room_types (
  id bigint generated always as identity primary key,
  property_id bigint not null references public.properties (id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists room_types_property_id_idx
  on public.room_types (property_id);

-- ---------------------------------------------------------------------------
-- running_number_counters — one row per (property, year), advanced
-- transactionally when a voucher batch is issued (PRD §6.4)
-- ---------------------------------------------------------------------------
create table if not exists public.running_number_counters (
  property_id bigint not null references public.properties (id) on delete cascade,
  year int not null,
  last_number int not null default 0,
  primary key (property_id, year)
);

-- ---------------------------------------------------------------------------
-- vouchers
-- ---------------------------------------------------------------------------
create table if not exists public.vouchers (
  id uuid primary key default gen_random_uuid(),
  running_no text not null unique,
  item_name text,
  purpose text check (purpose in ('kol', 'partner_compliment', 'staff_party', 'etc_compliment')),
  property_id bigint not null references public.properties (id),
  room_type_ids bigint[] not null default '{}',
  nights int not null check (nights > 0),
  breakfast_included boolean not null,
  blackout_type text not null default 'default' check (blackout_type in ('default', 'custom')),
  blackout_text text,
  validity_start date not null,
  validity_end date not null,
  note text,
  claim_by text,
  issuer_id uuid references public.profiles (id),
  approver_id uuid references public.profiles (id),
  status text not null default 'pending_approval' check (
    status in ('pending_approval', 'approved', 'claimable', 'claimed', 'rejected', 'expired', 'revoked')
  ),
  approval_token text,
  approval_token_expires_at timestamptz,
  approved_at timestamptz,
  rejected_reason text,
  expired_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id),
  revoked_reason text,
  exported_png_url text,
  exported_pdf_url text,
  created_at timestamptz not null default now(),
  constraint vouchers_validity_range check (validity_end >= validity_start)
);

create index if not exists vouchers_property_id_idx on public.vouchers (property_id);
create index if not exists vouchers_issuer_id_idx on public.vouchers (issuer_id);
create index if not exists vouchers_approver_id_idx on public.vouchers (approver_id);
create index if not exists vouchers_revoked_by_idx on public.vouchers (revoked_by);
create index if not exists vouchers_status_idx on public.vouchers (status);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.properties enable row level security;
alter table public.user_properties enable row level security;
alter table public.room_types enable row level security;
alter table public.running_number_counters enable row level security;
alter table public.vouchers enable row level security;

-- Helper: is the calling user an admin? SECURITY DEFINER so it can read
-- profiles regardless of the caller's own RLS visibility into that table.
create or replace function private.is_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke execute on function private.is_admin() from public, anon, authenticated;
grant execute on function private.is_admin() to authenticated;

-- Helper: does the calling user have access to a given property?
create or replace function private.has_property_access(check_property_id bigint)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.user_properties
    where property_id = check_property_id and user_id = (select auth.uid())
  );
$$;

revoke execute on function private.has_property_access(bigint) from public, anon, authenticated;
grant execute on function private.has_property_access(bigint) to authenticated;

-- profiles: read own row, or any row if admin
create policy profiles_select on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id or (select private.is_admin()));

-- properties: read properties you're assigned to, or all if admin
create policy properties_select on public.properties
  for select to authenticated
  using ((select private.has_property_access(id)) or (select private.is_admin()));

-- user_properties: read your own assignments, or all if admin
create policy user_properties_select on public.user_properties
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

-- room_types: read room types for properties you're assigned to, or all if admin
create policy room_types_select on public.room_types
  for select to authenticated
  using ((select private.has_property_access(property_id)) or (select private.is_admin()));

-- vouchers: read vouchers you issued, or any voucher in a property you're
-- assigned to, or all if admin. Approver access goes through the signed
-- token route (server-side, service role) rather than this policy.
create policy vouchers_select on public.vouchers
  for select to authenticated
  using (
    issuer_id = (select auth.uid())
    or (select private.has_property_access(property_id))
    or (select private.is_admin())
  );
