-- New "front_office" role: History-only, Claim-only, watermarked preview
-- instead of a real download link (see components/history/VoucherPreviewButton.tsx).

alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('issuer', 'approver', 'admin', 'front_office'));

-- ---------------------------------------------------------------------------
-- get_voucher_render_data — same shape as get_voucher_batch_by_token
-- (migration 0013) but scoped by voucher id under the caller's own session
-- (security invoker + existing vouchers_select RLS) instead of a public
-- token. Only meaningful once a voucher is approved/claimed — that's the
-- point a real file exists to compare against, so anything else returns no
-- rows by design (the UI treats an empty result as "nothing to preview").
-- ---------------------------------------------------------------------------
create or replace function public.get_voucher_render_data(p_voucher_id uuid)
returns table (
  id uuid,
  running_no text,
  property_code text,
  property_name text,
  template_config jsonb,
  room_type_names text[],
  nights int,
  breakfast_included boolean,
  blackout_text text,
  validity_start date,
  validity_end date,
  status text,
  approved_at timestamptz,
  approver_position text,
  approver_signature_url text
)
language sql
security invoker
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
    v.blackout_text,
    v.validity_start,
    v.validity_end,
    v.status,
    v.approved_at,
    a.position,
    a.signature_url
  from public.vouchers v
  join public.properties p on p.id = v.property_id
  left join public.approvers a on a.id = v.selected_approver_id
  where v.id = p_voucher_id
    and v.status in ('approved', 'claimed');
$$;

grant execute on function public.get_voucher_render_data(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- revoke_voucher — drop + recreate: front_office can never revoke, checked
-- server-side (not just hidden in the UI) since they'd otherwise have the
-- same has_property_access as any other role and could call the RPC
-- directly.
-- ---------------------------------------------------------------------------
create or replace function public.revoke_voucher(p_voucher_id uuid, p_reason text)
returns table (id uuid, running_no text, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A revoke reason is required.';
  end if;

  select role into caller_role from public.profiles where id = (select auth.uid());
  if caller_role = 'front_office' then
    raise exception 'Front office cannot revoke vouchers.';
  end if;

  return query
  with target as (
    select v.id
    from public.vouchers v
    where v.id = p_voucher_id
      and v.status in ('pending_approval', 'approved')
      and (
        (select private.has_property_access(v.property_id))
        or (select private.is_admin())
      )
    for update of v
  )
  update public.vouchers v
  set status = 'revoked', revoked_at = now(), revoked_by = (select auth.uid()), revoked_reason = p_reason
  from target t
  where v.id = t.id
  returning v.id, v.running_no, v.status;
end;
$$;

revoke execute on function public.revoke_voucher(uuid, text) from public;
grant execute on function public.revoke_voucher(uuid, text) to authenticated;
