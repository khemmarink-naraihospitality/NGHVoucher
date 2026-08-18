-- Fixes three History-page gaps found after the historical-sheet migration
-- (282 rows imported under a single placeholder issuer profile):
--
-- 1. get_my_voucher_history ordered by `created_at desc` only, with no
--    tiebreaker. Rows from the same import batch share an identical
--    created_at (set from the sheet's Issue Date), so ties came back in
--    arbitrary physical order (e.g. 157,161,160,159,158 instead of
--    161,160,159,158,157). Added `v.running_no desc` as a secondary key —
--    running_no is zero-padded to 3 digits per property/year
--    (0010_approver_signature.sql), so text ordering matches numeric
--    ordering within that range.
-- 2. No "who requested this" column existed anywhere in the history
--    pipeline — issuer_id was never even selected. For the 282 migrated
--    rows, issuer_id points at one placeholder "Migrated Historical Data"
--    account, which isn't useful to display; the real requester name from
--    the sheet needs its own column.
-- 3. No way to reach the original artwork for migrated vouchers — they
--    have no exported_jpeg_path/share_code (never rendered), but each
--    sheet row's "File" cell is a real hyperlink to a Google Drive folder
--    (only visible in the raw xlsx, not the plain-text export used for the
--    import) that's worth surfacing as a fallback Files-column link.
alter table public.vouchers add column if not exists issuer_name_override text;
alter table public.vouchers add column if not exists external_file_url text;

-- SECURITY DEFINER helper, same pattern as private.is_admin()/
-- has_property_access() (0001_init.sql) — resolves an issuer's display
-- name regardless of the calling user's own profiles RLS visibility (a
-- front_office/issuer viewing a property-mate's voucher can see the
-- voucher row via vouchers_select, but profiles_select would otherwise
-- hide that other person's profile since it's neither their own row nor
-- are they admin).
create or replace function private.resolve_issuer_display_name(p_issuer_id uuid, p_override text)
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(p_override, (select coalesce(pr.full_name, pr.email) from public.profiles pr where pr.id = p_issuer_id));
$$;

revoke execute on function private.resolve_issuer_display_name(uuid, text) from public, anon, authenticated;
grant execute on function private.resolve_issuer_display_name(uuid, text) to authenticated;

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
  share_code text,
  issuer_name text,
  external_file_url text
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
    v.share_code,
    private.resolve_issuer_display_name(v.issuer_id, v.issuer_name_override),
    v.external_file_url
  from public.vouchers v
  join public.properties p on p.id = v.property_id
  where (p_status is null or v.status = p_status)
    and (p_from is null or v.validity_start >= p_from)
    and (p_to is null or v.validity_start <= p_to)
    and (p_property_id is null or v.property_id = p_property_id)
    and (p_purpose is null or v.purpose = p_purpose)
  order by v.created_at desc, v.running_no desc;
$$;

revoke execute on function public.get_my_voucher_history(text, date, date, bigint, text) from public;
grant execute on function public.get_my_voucher_history(text, date, date, bigint, text) to authenticated;
