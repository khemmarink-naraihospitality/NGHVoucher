-- Admin page round 2: (1) properties.template_config becomes the real
-- source of truth for the voucher base image + canvas size (PRD §6.2
-- explicitly recommends this over hardcoding it in code so Admin can edit
-- without a redeploy) — Admin can now upload/replace a property's template
-- image; (2) room types get a delete policy; (3) approvers become scoped
-- per-property via a new approver_properties join table, since different
-- properties use different approvers and an Issuer shouldn't see another
-- property's approver in the dropdown.

-- ---------------------------------------------------------------------------
-- Backfill template_config for the two properties whose art already ships
-- as static assets under /public/templates — without this, refactoring the
-- app to read imagePath/canvasWidth/canvasHeight from the DB would break
-- LDBS/LDCH, which work today.
-- ---------------------------------------------------------------------------
update public.properties
set template_config = jsonb_build_object(
  'imagePath', '/templates/LDBS000.png',
  'canvasWidth', 1713,
  'canvasHeight', 1713
)
where code = 'LDBS' and template_config = '{}'::jsonb;

update public.properties
set template_config = jsonb_build_object(
  'imagePath', '/templates/LDCH000.png',
  'canvasWidth', 1713,
  'canvasHeight', 1713
)
where code = 'LDCH' and template_config = '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- templates storage bucket — Admin-uploaded base images. Public read (the
-- image itself isn't sensitive, same reasoning as the vouchers bucket);
-- write restricted to admin via a private.is_admin() check, unlike the
-- vouchers bucket's anon-write (that one predates real auth — see 0005).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('templates', 'templates', true)
on conflict (id) do nothing;

create policy "templates bucket public read"
  on storage.objects for select
  to public
  using (bucket_id = 'templates');

create policy "templates bucket admin write"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'templates' and (select private.is_admin()));

create policy "templates bucket admin update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'templates' and (select private.is_admin()))
  with check (bucket_id = 'templates' and (select private.is_admin()));

-- ---------------------------------------------------------------------------
-- room_types — delete policy (insert/update already exist from 0008).
-- ---------------------------------------------------------------------------
create policy room_types_delete on public.room_types
  for delete to authenticated
  using ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- approver_properties — which properties each approver serves. An approver
-- with zero rows here is effectively unassigned and won't show up for any
-- property (mirrors user_properties for issuers).
-- ---------------------------------------------------------------------------
create table if not exists public.approver_properties (
  approver_id bigint not null references public.approvers (id) on delete cascade,
  property_id bigint not null references public.properties (id) on delete cascade,
  primary key (approver_id, property_id)
);

alter table public.approver_properties enable row level security;

create policy approver_properties_select on public.approver_properties
  for select to authenticated
  using (true);

create policy approver_properties_insert on public.approver_properties
  for insert to authenticated
  with check ((select private.is_admin()));

create policy approver_properties_delete on public.approver_properties
  for delete to authenticated
  using ((select private.is_admin()));

-- Existing approvers predate this table — assign them to every current
-- property so the "Send for Approval" dropdown doesn't go empty until an
-- admin narrows it down deliberately.
insert into public.approver_properties (approver_id, property_id)
select a.id, p.id from public.approvers a cross join public.properties p
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- get_voucher_workspace_catalog — properties now carry their template
-- image/canvas size; approvers carry which properties they serve.
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
        'lastNumber', coalesce(rnc.last_number, 0),
        'templateImagePath', p.template_config ->> 'imagePath',
        'canvasWidth', (p.template_config ->> 'canvasWidth')::int,
        'canvasHeight', (p.template_config ->> 'canvasHeight')::int
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
        'email', a.email,
        'propertyIds', (
          select coalesce(jsonb_agg(ap.property_id), '[]'::jsonb)
          from public.approver_properties ap
          where ap.approver_id = a.id
        )
      ) order by a.name), '[]'::jsonb)
      from public.approvers a
      where a.is_active
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- get_voucher_batch_by_token — drop + recreate: adds template image/canvas
-- size so /api/approve can render without importing the old hardcoded
-- TEMPLATES config.
-- ---------------------------------------------------------------------------
drop function if exists public.get_voucher_batch_by_token(text);

create or replace function public.get_voucher_batch_by_token(p_token text)
returns table (
  id uuid,
  running_no text,
  property_code text,
  property_name text,
  template_image_path text,
  canvas_width int,
  canvas_height int,
  room_type_names text[],
  nights int,
  breakfast_included boolean,
  blackout_type text,
  blackout_text text,
  validity_start date,
  validity_end date,
  note text,
  status text,
  approval_token_expires_at timestamptz,
  approved_at timestamptz,
  rejected_reason text,
  exported_png_url text,
  exported_pdf_url text
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    v.id,
    v.running_no,
    p.code,
    p.name,
    p.template_config ->> 'imagePath',
    (p.template_config ->> 'canvasWidth')::int,
    (p.template_config ->> 'canvasHeight')::int,
    (
      select coalesce(array_agg(rt.name order by rt.name), '{}')
      from public.room_types rt
      where rt.id = any(v.room_type_ids)
    ),
    v.nights,
    v.breakfast_included,
    v.blackout_type,
    v.blackout_text,
    v.validity_start,
    v.validity_end,
    v.note,
    v.status,
    v.approval_token_expires_at,
    v.approved_at,
    v.rejected_reason,
    v.exported_png_url,
    v.exported_pdf_url
  from public.vouchers v
  join public.properties p on p.id = v.property_id
  where v.approval_token = p_token
  order by v.running_no;
$$;

revoke execute on function public.get_voucher_batch_by_token(text) from public;
grant execute on function public.get_voucher_batch_by_token(text) to anon, authenticated;
