-- Adds Reservation Number (captured by front office at claim time, per
-- discussion — helps staff match a voucher to the guest's booking) and
-- Property/Purpose filters to History.

alter table public.vouchers add column if not exists reservation_no text;

-- ---------------------------------------------------------------------------
-- claim_voucher — drop + recreate: adds optional reservation_no.
-- ---------------------------------------------------------------------------
drop function if exists public.claim_voucher(uuid, text);

create or replace function public.claim_voucher(p_voucher_id uuid, p_claim_by text, p_reservation_no text default null)
returns table (id uuid, running_no text, status text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_claim_by is null or btrim(p_claim_by) = '' then
    raise exception 'Claim by is required.';
  end if;

  return query
  with target as (
    select v.id
    from public.vouchers v
    where v.id = p_voucher_id
      and v.status = 'approved'
      and (
        (select private.has_property_access(v.property_id))
        or (select private.is_admin())
      )
    for update of v
  )
  update public.vouchers v
  set status = 'claimed', claim_by = p_claim_by, reservation_no = nullif(btrim(p_reservation_no), '')
  from target t
  where v.id = t.id
  returning v.id, v.running_no, v.status;
end;
$$;

revoke execute on function public.claim_voucher(uuid, text, text) from public;
grant execute on function public.claim_voucher(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- get_my_voucher_history — drop + recreate: adds property/purpose filters
-- and reservation_no to the returned row (History's new columns/filters).
-- ---------------------------------------------------------------------------
drop function if exists public.get_my_voucher_history(text, date, date);

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
  exported_png_url text,
  exported_pdf_url text
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
    v.exported_png_url,
    v.exported_pdf_url
  from public.vouchers v
  join public.properties p on p.id = v.property_id
  where (p_status is null or v.status = p_status)
    and (p_from is null or v.validity_start >= p_from)
    and (p_to is null or v.validity_start <= p_to)
    and (p_property_id is null or v.property_id = p_property_id)
    and (p_purpose is null or v.purpose = p_purpose)
  order by v.created_at desc;
$$;

grant execute on function public.get_my_voucher_history(text, date, date, bigint, text) to authenticated;
