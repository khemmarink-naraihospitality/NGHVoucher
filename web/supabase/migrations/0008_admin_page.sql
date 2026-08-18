-- Admin page (PRD §3): manage properties, room types, the approver list,
-- and which users can see which properties. Reads already work today for
-- an admin (every _select RLS policy from 0001 has an `or is_admin()`
-- branch) — this migration only adds the missing *write* policies plus a
-- new approvers table, so CRUD can go straight through supabase-js from
-- Server Actions instead of needing bespoke RPCs for every operation.

-- ---------------------------------------------------------------------------
-- approvers — replaces the hardcoded MOCK_APPROVERS list. Every Issuer
-- needs to read the active list (it populates the "Send for Approval"
-- dropdown); only Admin can write. Approvers still never log in (PRD §3,
-- §7) — this is just contact info, not an account.
-- ---------------------------------------------------------------------------
create table if not exists public.approvers (
  id bigint generated always as identity primary key,
  name text not null,
  email text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.approvers enable row level security;

create policy approvers_select on public.approvers
  for select to authenticated
  using (true);

create policy approvers_insert on public.approvers
  for insert to authenticated
  with check ((select private.is_admin()));

create policy approvers_update on public.approvers
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

insert into public.approvers (name, email) values
  ('Parika.k', 'parika.k@marasca.live'),
  ('Oliver Ian Council', 'oliver.l@marasca.live')
on conflict (email) do nothing;

-- ---------------------------------------------------------------------------
-- Admin write policies — properties, room_types, user_properties, profiles
-- only had _select policies before now (0001). No delete policies: rows
-- referenced by vouchers/user_properties shouldn't be hard-deletable —
-- room types and properties deactivate via is_active instead.
-- ---------------------------------------------------------------------------
create policy properties_insert on public.properties
  for insert to authenticated
  with check ((select private.is_admin()));

create policy properties_update on public.properties
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy room_types_insert on public.room_types
  for insert to authenticated
  with check ((select private.is_admin()));

create policy room_types_update on public.room_types
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy user_properties_insert on public.user_properties
  for insert to authenticated
  with check ((select private.is_admin()));

create policy user_properties_delete on public.user_properties
  for delete to authenticated
  using ((select private.is_admin()));

create policy profiles_update on public.profiles
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- get_voucher_workspace_catalog — adds the active approver list so the
-- Create Voucher form can drop MOCK_APPROVERS, same as it already dropped
-- MOCK_ROOM_TYPES/MOCK_LAST_NUMBER in Phase 2. Return type (jsonb) is
-- unchanged, so create or replace is enough — no drop needed.
-- ---------------------------------------------------------------------------
create or replace function public.get_voucher_workspace_catalog()
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'properties', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id,
        'code', p.code,
        'name', p.name,
        'lastNumber', coalesce(rnc.last_number, 0)
      ) order by p.code), '[]'::jsonb)
      from public.properties p
      left join public.running_number_counters rnc
        on rnc.property_id = p.id
        and rnc.year = extract(year from now())::int
    ),
    'roomTypes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', rt.id,
        'propertyId', rt.property_id,
        'name', rt.name
      ) order by rt.property_id, rt.name), '[]'::jsonb)
      from public.room_types rt
      where rt.is_active
    ),
    'approvers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id,
        'name', a.name,
        'email', a.email
      ) order by a.name), '[]'::jsonb)
      from public.approvers a
      where a.is_active
    )
  );
$$;
