-- Closes a real information-disclosure hole: the `vouchers` bucket was
-- public with a guessable path ({propertyCode}/{running_no}.png — running
-- numbers are sequential per property/year), so anyone could enumerate
-- every voucher ever issued for a property. Guests still need to fetch
-- their file without logging in (issuers share this with people who have
-- no account), so instead of gating behind auth, each approved voucher
-- gets a random unguessable share_code; the actual file is only ever
-- reached through a short-lived signed URL generated server-side (see
-- app/v/[code]/[png|pdf]/route.ts + lib/supabase/serviceRole.ts), not a
-- permanent public link.

update storage.buckets set public = false where id = 'vouchers';
drop policy if exists "vouchers bucket public read" on storage.objects;

-- exported_png_url/exported_pdf_url used to hold full public URLs; from
-- now on they hold storage object paths only (never directly fetchable —
-- always resolved through a fresh signed URL). Renamed so the column name
-- doesn't lie about that.
alter table public.vouchers rename column exported_png_url to exported_png_path;
alter table public.vouchers rename column exported_pdf_url to exported_pdf_path;

alter table public.vouchers
  add column share_code text,
  add constraint vouchers_share_code_unique unique (share_code);

-- ---------------------------------------------------------------------------
-- set_voucher_export_files — was set_voucher_export_urls. Now also stores
-- the share_code generated at export time (approve/route.ts), alongside
-- the renamed path columns.
-- ---------------------------------------------------------------------------
drop function if exists public.set_voucher_export_urls(uuid, text, text);

create or replace function public.set_voucher_export_files(
  p_voucher_id uuid,
  p_png_path text,
  p_pdf_path text,
  p_share_code text
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.vouchers
  set exported_png_path = p_png_path, exported_pdf_path = p_pdf_path, share_code = p_share_code
  where id = p_voucher_id and status = 'approved';
$$;

revoke execute on function public.set_voucher_export_files(uuid, text, text, text) from public;
grant execute on function public.set_voucher_export_files(uuid, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_voucher_by_share_code — public lookup for app/v/[code] (the landing
-- page) and its png/pdf redirect routes. Only ever returns display info +
-- storage paths, never a fetchable URL — those two routes resolve a fresh
-- signed URL server-side with the service-role client, since the bucket is
-- private now.
-- ---------------------------------------------------------------------------
create or replace function public.get_voucher_by_share_code(p_code text)
returns table (
  running_no text,
  property_name text,
  room_type_names text[],
  nights int,
  validity_start date,
  validity_end date,
  exported_png_path text,
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
    v.exported_png_path,
    v.exported_pdf_path
  from public.vouchers v
  join public.properties p on p.id = v.property_id
  where v.share_code = p_code;
$$;

revoke execute on function public.get_voucher_by_share_code(text) from public;
grant execute on function public.get_voucher_by_share_code(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_voucher_batch_by_token — drop + recreate: exported_png_url/
-- exported_pdf_url -> exported_png_path/exported_pdf_path, adds share_code
-- so the approve page's post-approval PNG/PDF links can point at
-- /v/[code]/png|pdf instead of a stored public URL.
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
  exported_png_path text,
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
    v.exported_png_path,
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
-- get_my_voucher_history — drop + recreate: same rename + share_code
-- addition, for History and its CSV/XLSX export.
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
  exported_png_path text,
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
    v.exported_png_path,
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
