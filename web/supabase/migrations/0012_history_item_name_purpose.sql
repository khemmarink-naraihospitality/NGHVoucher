-- Surfaces item_name/purpose (already writable via submit_voucher_batch
-- since 0003, but never shown anywhere) in the History page's RPC — PRD
-- §5.1: Item Name groups a batch, Purpose is a required category.
drop function if exists public.get_my_voucher_history(text, date, date);

create or replace function public.get_my_voucher_history(
  p_status text default null,
  p_from date default null,
  p_to date default null
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
    v.created_at,
    v.exported_png_url,
    v.exported_pdf_url
  from public.vouchers v
  join public.properties p on p.id = v.property_id
  where (p_status is null or v.status = p_status)
    and (p_from is null or v.validity_start >= p_from)
    and (p_to is null or v.validity_start <= p_to)
  order by v.created_at desc;
$$;

grant execute on function public.get_my_voucher_history(text, date, date) to authenticated;
