-- Voucher exports switch from lossless PNG to JPEG (quality 0.80) for the
-- primary downloadable image, not just the PDF embed — cuts per-voucher
-- storage further (PNG was the larger of the two files). Renaming
-- exported_png_path -> exported_jpeg_path so the column name matches
-- what's actually stored, same reasoning as the exported_png_url ->
-- exported_png_path rename in migration 0023.
alter table public.vouchers rename column exported_png_path to exported_jpeg_path;

drop function if exists public.set_voucher_export_files(uuid, text, text, text);

create or replace function public.set_voucher_export_files(
  p_voucher_id uuid,
  p_jpeg_path text,
  p_pdf_path text,
  p_share_code text
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.vouchers
  set exported_jpeg_path = p_jpeg_path, exported_pdf_path = p_pdf_path, share_code = p_share_code
  where id = p_voucher_id and status = 'approved';
$$;

revoke execute on function public.set_voucher_export_files(uuid, text, text, text) from public;
grant execute on function public.set_voucher_export_files(uuid, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_voucher_batch_by_token — drop + recreate: exported_png_path ->
-- exported_jpeg_path.
-- ---------------------------------------------------------------------------
drop function if exists public.get_voucher_batch_by_token(text);

create or replace function public.get_voucher_batch_by_token(p_token text)
returns table (
  id uuid,
  running_no text,
  property_code text,
  property_name text,
  template_config jsonb,
  room_type_names text[],
  nights int,
  breakfast_included boolean,
  blackout_type text,
  blackout_text text,
  validity_start date,
  validity_end date,
  note text,
  item_name text,
  purpose text,
  status text,
  approval_token_expires_at timestamptz,
  approved_at timestamptz,
  rejected_reason text,
  exported_jpeg_path text,
  exported_pdf_path text,
  share_code text,
  approver_name text,
  approver_position text,
  approver_signature_url text,
  issuer_name text,
  issuer_email text
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
    p.template_config,
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
    v.item_name,
    v.purpose,
    v.status,
    v.approval_token_expires_at,
    v.approved_at,
    v.rejected_reason,
    v.exported_jpeg_path,
    v.exported_pdf_path,
    v.share_code,
    a.name,
    a.position,
    a.signature_url,
    coalesce(i.full_name, i.email),
    i.email
  from public.vouchers v
  join public.properties p on p.id = v.property_id
  left join public.approvers a on a.id = v.selected_approver_id
  left join public.profiles i on i.id = v.issuer_id
  where v.approval_token = p_token
  order by v.running_no;
$$;

revoke execute on function public.get_voucher_batch_by_token(text) from public;
grant execute on function public.get_voucher_batch_by_token(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_my_voucher_history — drop + recreate: same rename.
-- ---------------------------------------------------------------------------
drop function if exists public.get_my_voucher_history(text, date, date, bigint, text);

create or replace function public.get_my_voucher_history(
  p_status text default null,
  p_from date default null,
  p_to date default null,
  p_property_id bigint default null,
  p_purpose text default null
)
returns table (
  id uuid,
  running_no text,
  property_name text,
  room_type_names text[],
  nights int,
  breakfast_included boolean,
  validity_start date,
  validity_end date,
  status text,
  note text,
  item_name text,
  purpose text,
  claim_by text,
  reservation_no text,
  revoked_reason text,
  created_at timestamptz,
  exported_jpeg_path text,
  exported_pdf_path text,
  share_code text
)
language sql
security invoker
set search_path = ''
stable
as $$
  select
    v.id,
    v.running_no,
    p.name,
    (
      select coalesce(array_agg(rt.name order by rt.name), '{}')
      from public.room_types rt
      where rt.id = any(v.room_type_ids)
    ),
    v.nights,
    v.breakfast_included,
    v.validity_start,
    v.validity_end,
    v.status,
    v.note,
    v.item_name,
    v.purpose,
    v.claim_by,
    v.reservation_no,
    v.revoked_reason,
    v.created_at,
    v.exported_jpeg_path,
    v.exported_pdf_path,
    v.share_code
  from public.vouchers v
  join public.properties p on p.id = v.property_id
  where (p_status is null or v.status = p_status)
    and (p_from is null or v.validity_start >= p_from)
    and (p_to is null or v.validity_start <= p_to)
    and (p_property_id is null or v.property_id = p_property_id)
    and (p_purpose is null or v.purpose = p_purpose)
  order by v.created_at desc;
$$;

revoke execute on function public.get_my_voucher_history(text, date, date, bigint, text) from public;
grant execute on function public.get_my_voucher_history(text, date, date, bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- get_voucher_by_share_code — drop + recreate: same rename.
-- ---------------------------------------------------------------------------
drop function if exists public.get_voucher_by_share_code(text);

create or replace function public.get_voucher_by_share_code(p_code text)
returns table (
  running_no text,
  property_name text,
  room_type_names text[],
  nights int,
  validity_start date,
  validity_end date,
  status text,
  exported_jpeg_path text,
  exported_pdf_path text
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    v.running_no,
    p.name,
    (
      select coalesce(array_agg(rt.name order by rt.name), '{}')
      from public.room_types rt
      where rt.id = any(v.room_type_ids)
    ),
    v.nights,
    v.validity_start,
    v.validity_end,
    v.status,
    v.exported_jpeg_path,
    v.exported_pdf_path
  from public.vouchers v
  join public.properties p on p.id = v.property_id
  where v.share_code = p_code;
$$;

revoke execute on function public.get_voucher_by_share_code(text) from public;
grant execute on function public.get_voucher_by_share_code(text) to anon, authenticated;
