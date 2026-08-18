-- Admin dashboard: voucher counts by status, latest running number per
-- property, and Storage usage per bucket, so an admin can monitor the app
-- at a glance instead of only ever seeing individual records.
--
-- running_number_counters has had RLS enabled with zero policies since
-- 0001_init.sql (flagged as an informational advisory the whole time,
-- never actually blocking anything until now, since nothing previously
-- needed to read it directly) — that means literally nobody, not even
-- admin, could read it through the normal RLS-bound client. Add a real
-- policy matching the same has_property_access()-or-admin shape every
-- other property-scoped table already uses (0001_init.sql).
create policy running_number_counters_select on public.running_number_counters
  for select to authenticated
  using ((select private.is_admin()) or private.has_property_access(property_id));

-- storage.objects has no admin-wide SELECT policy for the vouchers bucket
-- (0025_vouchers_bucket_service_role_only.sql deliberately dropped all
-- anon/authenticated access there, including for admins, to close the
-- guessable-path vulnerability that migration fixed) and isn't exposed to
-- PostgREST at all by default regardless. A SECURITY DEFINER function is
-- the right shape here either way — this only ever needs an aggregate
-- byte count per bucket, not per-object read access, so there's no reason
-- to widen storage.objects' own access model just to expose this.
create or replace function public.get_storage_stats()
returns table (bucket_id text, object_count bigint, total_bytes bigint)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'Admin only.';
  end if;

  return query
  select
    o.bucket_id,
    count(*)::bigint,
    coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint
  from storage.objects o
  group by o.bucket_id;
end;
$$;

revoke execute on function public.get_storage_stats() from public, anon;
grant execute on function public.get_storage_stats() to authenticated;
