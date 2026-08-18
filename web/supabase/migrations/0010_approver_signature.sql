-- Approver position + signature photo, overlaid on the voucher's
-- "Approved by" line once approved. The redesigned templates (LDBS/LDCH,
-- 2026-08-13) dropped the static "(Property Leader)" label — Admin
-- confirmed it's meant to be rendered dynamically per-approver now,
-- alongside their signature image.
--
-- This also fixes a real gap: nothing previously recorded *which* approver
-- (from the `approvers` table) a voucher batch was sent to — only their
-- name/email were looked up transiently for the email at submit time,
-- never persisted. Without that link there's no way to know whose
-- signature/position to draw once approved.

alter table public.approvers add column if not exists position text;
alter table public.approvers add column if not exists signature_url text;

alter table public.vouchers
  add column if not exists selected_approver_id bigint references public.approvers (id);

-- ---------------------------------------------------------------------------
-- signatures storage bucket — same admin-write/public-read posture as the
-- templates bucket (0009).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('signatures', 'signatures', true)
on conflict (id) do nothing;

create policy "signatures bucket public read"
  on storage.objects for select
  to public
  using (bucket_id = 'signatures');

create policy "signatures bucket admin write"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'signatures' and (select private.is_admin()));

create policy "signatures bucket admin update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'signatures' and (select private.is_admin()))
  with check (bucket_id = 'signatures' and (select private.is_admin()));

-- ---------------------------------------------------------------------------
-- submit_voucher_batch — adds p_approver_id (no default, so it must sit
-- before the already-defaulted p_note/p_item_name/p_purpose per Postgres
-- parameter ordering rules) and records it as selected_approver_id.
-- ---------------------------------------------------------------------------
drop function if exists public.submit_voucher_batch(
  text, bigint[], int, int, boolean, text, text, date, date, text, text, text
);

create or replace function public.submit_voucher_batch(
  p_property_code text,
  p_room_type_ids bigint[],
  p_nights int,
  p_voucher_count int,
  p_breakfast_included boolean,
  p_blackout_type text,
  p_blackout_text text,
  p_validity_start date,
  p_validity_end date,
  p_approver_id bigint,
  p_note text default null,
  p_item_name text default null,
  p_purpose text default null
)
returns table (id uuid, running_no text, approval_token text, approval_token_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property_id bigint;
  v_year int := extract(year from now())::int;
  v_year_prefix text := lpad((v_year % 100)::text, 2, '0');
  v_new_last_number int;
  v_reused_numbers int[];
  v_reused_count int;
  v_remaining int;
  v_new_numbers int[];
  v_all_numbers int[];
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_expires_at timestamptz := now() + interval '7 days';
  v_issuer_id uuid := auth.uid();
begin
  if v_issuer_id is null then
    raise exception 'Not authenticated.';
  end if;

  if p_voucher_count is null or p_voucher_count < 1 then
    raise exception 'voucher_count must be at least 1';
  end if;

  select p.id into v_property_id from public.properties p where p.code = p_property_code;
  if v_property_id is null then
    raise exception 'Unknown property code: %', p_property_code;
  end if;

  if not (
    (select private.has_property_access(v_property_id)) or (select private.is_admin())
  ) then
    raise exception 'You do not have access to this property.';
  end if;

  with candidates as (
    select property_id, year, number
    from public.released_running_numbers
    where property_id = v_property_id and year = v_year
    order by number
    limit p_voucher_count
    for update skip locked
  ),
  deleted as (
    delete from public.released_running_numbers r
    using candidates c
    where r.property_id = c.property_id and r.year = c.year and r.number = c.number
    returning r.number
  )
  select coalesce(array_agg(number order by number), '{}') into v_reused_numbers from deleted;

  v_reused_count := coalesce(array_length(v_reused_numbers, 1), 0);
  v_remaining := p_voucher_count - v_reused_count;

  if v_remaining > 0 then
    insert into public.running_number_counters (property_id, year, last_number)
    values (v_property_id, v_year, 0)
    on conflict (property_id, year) do nothing;

    update public.running_number_counters
    set last_number = last_number + v_remaining
    where property_id = v_property_id and year = v_year
    returning last_number into v_new_last_number;

    select coalesce(array_agg(n), '{}')
    into v_new_numbers
    from generate_series(v_new_last_number - v_remaining + 1, v_new_last_number) as n;
  else
    v_new_numbers := '{}';
  end if;

  v_all_numbers := v_reused_numbers || v_new_numbers;

  return query
  insert into public.vouchers (
    running_no, item_name, purpose, property_id, room_type_ids, nights,
    breakfast_included, blackout_type, blackout_text, validity_start,
    validity_end, note, issuer_id, selected_approver_id, status,
    approval_token, approval_token_expires_at
  )
  select
    v_year_prefix || '/' || p_property_code || lpad(n::text, 3, '0'),
    p_item_name,
    p_purpose,
    v_property_id,
    p_room_type_ids,
    p_nights,
    p_breakfast_included,
    p_blackout_type,
    p_blackout_text,
    p_validity_start,
    p_validity_end,
    p_note,
    v_issuer_id,
    p_approver_id,
    'pending_approval',
    v_token,
    v_expires_at
  from unnest(v_all_numbers) as n
  returning vouchers.id, vouchers.running_no, vouchers.approval_token, vouchers.approval_token_expires_at;
end;
$$;

revoke execute on function public.submit_voucher_batch(
  text, bigint[], int, int, boolean, text, text, date, date, bigint, text, text, text
) from public, anon;
grant execute on function public.submit_voucher_batch(
  text, bigint[], int, int, boolean, text, text, date, date, bigint, text, text, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- get_voucher_batch_by_token — drop + recreate: adds the assigned
-- approver's name/position/signature so the approve page + export can
-- draw them once the batch is approved (callers gate on status themselves;
-- this just makes the data available).
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
  exported_pdf_url text,
  approver_name text,
  approver_position text,
  approver_signature_url text
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
    v.exported_pdf_url,
    a.name,
    a.position,
    a.signature_url
  from public.vouchers v
  join public.properties p on p.id = v.property_id
  left join public.approvers a on a.id = v.selected_approver_id
  where v.approval_token = p_token
  order by v.running_no;
$$;

revoke execute on function public.get_voucher_batch_by_token(text) from public;
grant execute on function public.get_voucher_batch_by_token(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_voucher_workspace_catalog — approvers now carry position/signature
-- (mainly for Admin visibility; the Issuer-side form only needs
-- id/name/email/propertyIds, already there).
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
        'position', a.position,
        'signatureUrl', a.signature_url,
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
