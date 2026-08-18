-- Fixes a bug introduced in 0015: revoke_voucher's `returns table (id uuid, ...)`
-- creates an OUT parameter named `id`, which collided with the unqualified
-- `id` in `where id = auth.uid()` inside the new front_office role lookup
-- (ERROR 42702: ambiguous column reference). Table-qualifying it resolves
-- the ambiguity in favor of public.profiles.id, as intended.
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

  select p.role into caller_role from public.profiles p where p.id = (select auth.uid());
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
