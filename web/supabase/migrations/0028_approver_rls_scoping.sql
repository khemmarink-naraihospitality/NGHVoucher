-- approvers_select/approver_properties_select used `using (true)` for any
-- authenticated user — inconsistent with every other scoped table
-- (properties_select/room_types_select/vouchers_select all check
-- private.has_property_access(), supabase/migrations/0001_init.sql). Net
-- effect: any signed-in issuer could see every approver's name/email and
-- every property assignment org-wide, not just for properties they have
-- access to. Scoping both to the same has_property_access() pattern.
drop policy if exists approvers_select on public.approvers;

create policy approvers_select on public.approvers
  for select to authenticated
  using (
    (select private.is_admin())
    or exists (
      select 1
      from public.approver_properties ap
      where ap.approver_id = approvers.id
        and private.has_property_access(ap.property_id)
    )
  );

drop policy if exists approver_properties_select on public.approver_properties;

create policy approver_properties_select on public.approver_properties
  for select to authenticated
  using (
    (select private.is_admin())
    or private.has_property_access(approver_properties.property_id)
  );
