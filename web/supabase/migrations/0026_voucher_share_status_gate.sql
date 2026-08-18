-- Adds status to get_voucher_by_share_code's output so app/v/[code] and
-- its png/pdf routes can cut off access once a voucher is no longer
-- `approved` (claimed, revoked, or expired past validity) instead of
-- serving the file forever regardless of lifecycle state.
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
    v.status,
    v.exported_png_path,
    v.exported_pdf_path
  from public.vouchers v
  join public.properties p on p.id = v.property_id
  where v.share_code = p_code;
$$;

revoke execute on function public.get_voucher_by_share_code(text) from public;
grant execute on function public.get_voucher_by_share_code(text) to anon, authenticated;
