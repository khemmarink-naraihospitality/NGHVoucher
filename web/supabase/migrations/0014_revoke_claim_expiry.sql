-- Wires up the 3 previously-unused vouchers.status transitions (PRD §7/§11-12):
-- Revoke (manual, any account with property access or admin, always requires
-- a reason), Claimed (manual "mark as claimed" button, records who claimed
-- it), and Expired (daily cron, past validity_end while still approved).
-- All 3 target columns (claim_by, revoked_at/by/reason, expired_at) already
-- exist on public.vouchers since migration 0001 — this is RPC-only.

-- ---------------------------------------------------------------------------
-- revoke_voucher — caller must be Admin or have access to the voucher's
-- property (same check vouchers_select RLS already uses). Only meaningful
-- before a voucher has actually been handed over; claimed/rejected/expired/
-- already-revoked are terminal.
-- ---------------------------------------------------------------------------
create or replace function public.revoke_voucher(p_voucher_id uuid, p_reason text)
returns table (id uuid, running_no text, status text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A revoke reason is required.';
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

-- ---------------------------------------------------------------------------
-- claim_voucher — same permission check. Only from 'approved' (this app
-- treats 'approved' as the point a voucher is already usable by the guest —
-- 'claimable' stays a legal-but-unused enum value, see migration 0014 plan
-- notes for why no separate trigger was built for it).
-- ---------------------------------------------------------------------------
create or replace function public.claim_voucher(p_voucher_id uuid, p_claim_by text)
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
  set status = 'claimed', claim_by = p_claim_by
  from target t
  where v.id = t.id
  returning v.id, v.running_no, v.status;
end;
$$;

revoke execute on function public.claim_voucher(uuid, text) from public;
grant execute on function public.claim_voucher(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- expire_overdue_vouchers — daily sweep, called by the Vercel Cron route
-- (api/cron/expire-vouchers) with no user session, so this runs as anon —
-- same "auth-deferred" pattern already accepted for approve/reject
-- (Supabase security advisors flag it, intentionally). Real gate is the
-- CRON_SECRET check in the route. Blast radius of an unauthorized direct
-- call is low: it only flips vouchers already past their own validity_end,
-- which would happen on the next legitimate tick anyway.
-- ---------------------------------------------------------------------------
create or replace function public.expire_overdue_vouchers()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected int;
begin
  update public.vouchers
  set status = 'expired', expired_at = now()
  where status = 'approved' and validity_end < current_date;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke execute on function public.expire_overdue_vouchers() from public;
grant execute on function public.expire_overdue_vouchers() to anon;

-- ---------------------------------------------------------------------------
-- get_my_voucher_history — drop + recreate: adds claim_by/revoked_reason so
-- History can show who claimed a voucher or why one was revoked.
-- ---------------------------------------------------------------------------
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
  claim_by text,
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
    v.revoked_reason,
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
