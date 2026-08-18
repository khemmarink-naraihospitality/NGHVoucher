-- get_voucher_workspace_catalog is security definer and was returning ALL
-- properties/room types/approvers (including signature URLs) to any
-- authenticated user unconditionally, relying only on client-side JS
-- filtering (VoucherWorkspace.tsx) for what's actually shown — not a
-- security boundary, since the RPC is directly callable. This is the real
-- read path for the same over-exposure 0028 fixed at the RLS layer for
-- direct table reads; fixing it here too so that fix isn't trivially
-- bypassed by calling this RPC instead. submit_voucher_batch already
-- enforces has_property_access() server-side (0010) — this only affects
-- what's *visible*, not what could be submitted.
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
      where (select private.is_admin()) or private.has_property_access(p.id)
    ),
    'roomTypes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', rt.id,
        'propertyId', rt.property_id,
        'name', rt.name
      ) order by rt.property_id, rt.name), '[]'::jsonb)
      from public.room_types rt
      where rt.is_active
        and ((select private.is_admin()) or private.has_property_access(rt.property_id))
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
        and (
          (select private.is_admin())
          or exists (
            select 1
            from public.approver_properties ap
            where ap.approver_id = a.id and private.has_property_access(ap.property_id)
          )
        )
    )
  );
$$;
