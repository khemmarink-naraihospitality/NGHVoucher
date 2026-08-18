-- Admin-adjustable template layout (drag-and-drop editor). Field positions
-- (running_no, room_type_nights, validity_range, blackout_text,
-- approver_position, approved_date, breakfastCheckbox, signatureField)
-- move from hardcoded SHARED_FIELDS in code (lib/templates/config.ts) into
-- properties.template_config — the same jsonb column that already holds
-- imagePath/canvasWidth/canvasHeight (0009). No new column needed, no new
-- RLS policy needed (properties_update from 0008 already covers this).
--
-- What changes here is just what the read RPCs expose: instead of
-- extracting individual keys (imagePath, canvasWidth, canvasHeight) they
-- now return the whole template_config blob, so the app can read/merge
-- fields/breakfastCheckbox/signatureField too. A property with no saved
-- layout yet just has an object missing those keys — the app falls back
-- to code-level defaults (see lib/templates/config.ts DEFAULT_FIELDS etc).

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
        'templateConfig', p.template_config
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
