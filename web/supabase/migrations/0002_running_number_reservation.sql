-- Phase 2: running-number reservation + the submit-for-approval write path
-- (PRD §6.4, §4 step 5). Concurrency safety comes from a plain UPDATE on
-- running_number_counters — Postgres takes a row lock for the duration of
-- the UPDATE, so two concurrent callers serialize instead of racing to read
-- the same last_number.
--
-- Auth is deferred (Phase 2 scope decision) — there is no logged-in Issuer
-- yet, so the write path can't be "authenticated issuer inserts their own
-- row" per the vouchers_insert policy below. Instead both RPCs are
-- SECURITY DEFINER and granted to `anon`, bypassing RLS entirely for these
-- two controlled entry points. issuer_id is left null. Once real auth
-- lands: pass auth.uid() into submit_voucher_batch as issuer_id, revoke the
-- `anon` grants below, and switch the app to insert through the
-- vouchers_insert policy directly (or keep the RPC but require
-- `authenticated`).

-- ---------------------------------------------------------------------------
-- vouchers_insert — forward-looking policy for when auth lands (PRD §8).
-- Not exercised by the app yet (submit_voucher_batch bypasses RLS below),
-- but was called out as pending in 0001_init.sql's comment.
-- ---------------------------------------------------------------------------
create policy vouchers_insert on public.vouchers
  for insert to authenticated
  with check (
    issuer_id = (select auth.uid())
    and (select private.has_property_access(property_id))
  );

-- ---------------------------------------------------------------------------
-- get_voucher_workspace_catalog — everything the Create Voucher page needs
-- in one round trip: properties + their room types + this year's last
-- issued number per property. Read-only, non-sensitive catalog data.
-- ---------------------------------------------------------------------------
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
        'lastNumber', coalesce(rnc.last_number, 0)
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
    )
  );
$$;

revoke execute on function public.get_voucher_workspace_catalog() from public;
grant execute on function public.get_voucher_workspace_catalog() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- submit_voucher_batch — reserves `p_voucher_count` sequential running
-- numbers for the property and inserts one `pending_approval` voucher row
-- per number (PRD §4 step 5, §6.4). Year prefix matches format.ts'
-- twoDigitYear (last 2 digits of the Gregorian year — the PRD's own worked
-- examples, not literal Buddhist-era) — keep both in sync if this changes.
-- ---------------------------------------------------------------------------
create or replace function public.submit_voucher_batch(
  p_property_code text,
  p_room_type_ids bigint[],
  p_nights int,
  p_voucher_count int,
  p_breakfast_included boolean,
  p_blackout_type text,
  p_blackout_text text,
  p_validity_start date,
  p_validity_end date,
  p_note text default null,
  p_item_name text default null,
  p_purpose text default null
)
returns table (id uuid, running_no text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property_id bigint;
  v_year int := extract(year from now())::int;
  v_year_prefix text := lpad((v_year % 100)::text, 2, '0');
  v_new_last_number int;
  v_start_number int;
begin
  if p_voucher_count is null or p_voucher_count < 1 then
    raise exception 'voucher_count must be at least 1';
  end if;

  select p.id into v_property_id from public.properties p where p.code = p_property_code;
  if v_property_id is null then
    raise exception 'Unknown property code: %', p_property_code;
  end if;

  insert into public.running_number_counters (property_id, year, last_number)
  values (v_property_id, v_year, 0)
  on conflict (property_id, year) do nothing;

  -- Row lock held until the transaction commits — concurrent callers for
  -- the same property/year block here instead of reading a stale number.
  update public.running_number_counters
  set last_number = last_number + p_voucher_count
  where property_id = v_property_id and year = v_year
  returning last_number into v_new_last_number;

  v_start_number := v_new_last_number - p_voucher_count + 1;

  return query
  insert into public.vouchers (
    running_no, item_name, purpose, property_id, room_type_ids, nights,
    breakfast_included, blackout_type, blackout_text, validity_start,
    validity_end, note, status
  )
  select
    v_year_prefix || '/' || p_property_code || lpad((v_start_number + seq - 1)::text, 3, '0'),
    p_item_name,
    p_purpose,
    v_property_id,
    p_room_type_ids,
    p_nights,
    p_breakfast_included,
    p_blackout_type,
    p_blackout_text,
    p_validity_start,
    p_validity_end,
    p_note,
    'pending_approval'
  from generate_series(1, p_voucher_count) as seq
  returning vouchers.id, vouchers.running_no;
end;
$$;

revoke execute on function public.submit_voucher_batch(
  text, bigint[], int, int, boolean, text, text, date, date, text, text, text
) from public;
grant execute on function public.submit_voucher_batch(
  text, bigint[], int, int, boolean, text, text, date, date, text, text, text
) to anon, authenticated;
