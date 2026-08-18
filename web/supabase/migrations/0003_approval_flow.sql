-- Phase 3: approval flow (PRD §7) — token issuance on submit, the public
-- (no-login) approve/reject actions, and the running-number reuse pool
-- confirmed in PRD §6.4 ("rejected numbers return to the pool for reuse").
--
-- Same auth-deferred posture as migration 0002: these RPCs are
-- SECURITY DEFINER and granted to `anon` because there's no Issuer/Approver
-- session yet. The approve/reject actions are gated entirely by the
-- possession of a valid, unexpired `approval_token` — never trust anything
-- else from the client (PRD §7).

-- ---------------------------------------------------------------------------
-- released_running_numbers — numbers freed up by a rejection, scoped to the
-- (property, year) they belonged to. submit_voucher_batch drains this pool
-- (oldest number first) before advancing running_number_counters, so a
-- rejected number gets reissued to the next batch instead of leaving a
-- permanent gap.
-- ---------------------------------------------------------------------------
create table if not exists public.released_running_numbers (
  property_id bigint not null references public.properties (id) on delete cascade,
  year int not null,
  number int not null,
  released_at timestamptz not null default now(),
  primary key (property_id, year, number)
);

alter table public.released_running_numbers enable row level security;
-- No policies: only ever touched via the SECURITY DEFINER functions below,
-- same posture as running_number_counters in migration 0001/0002.

-- ---------------------------------------------------------------------------
-- submit_voucher_batch — replaces the 0002 version. Same reservation logic,
-- plus: (1) draws from released_running_numbers before advancing the
-- counter, (2) issues an approval_token + 7-day expiry on every inserted
-- row (PRD §7).
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
returns table (id uuid, running_no text, approval_token text, approval_token_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property_id bigint;
  v_year int := extract(year from now())::int;
  v_year_prefix text := lpad((v_year % 100)::text, 2, '0');
  v_new_last_number int;
  v_reused_numbers int[];
  v_reused_count int;
  v_remaining int;
  v_new_numbers int[];
  v_all_numbers int[];
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_expires_at timestamptz := now() + interval '7 days';
begin
  if p_voucher_count is null or p_voucher_count < 1 then
    raise exception 'voucher_count must be at least 1';
  end if;

  select p.id into v_property_id from public.properties p where p.code = p_property_code;
  if v_property_id is null then
    raise exception 'Unknown property code: %', p_property_code;
  end if;

  -- Drain the reuse pool first (oldest released number first), skipping
  -- any row a concurrent caller has already locked.
  with candidates as (
    select property_id, year, number
    from public.released_running_numbers
    where property_id = v_property_id and year = v_year
    order by number
    limit p_voucher_count
    for update skip locked
  ),
  deleted as (
    delete from public.released_running_numbers r
    using candidates c
    where r.property_id = c.property_id and r.year = c.year and r.number = c.number
    returning r.number
  )
  select coalesce(array_agg(number order by number), '{}') into v_reused_numbers from deleted;

  v_reused_count := coalesce(array_length(v_reused_numbers, 1), 0);
  v_remaining := p_voucher_count - v_reused_count;

  if v_remaining > 0 then
    insert into public.running_number_counters (property_id, year, last_number)
    values (v_property_id, v_year, 0)
    on conflict (property_id, year) do nothing;

    -- Row lock held until commit — concurrent callers for the same
    -- property/year serialize here instead of reading a stale number.
    update public.running_number_counters
    set last_number = last_number + v_remaining
    where property_id = v_property_id and year = v_year
    returning last_number into v_new_last_number;

    select coalesce(array_agg(n), '{}')
    into v_new_numbers
    from generate_series(v_new_last_number - v_remaining + 1, v_new_last_number) as n;
  else
    v_new_numbers := '{}';
  end if;

  v_all_numbers := v_reused_numbers || v_new_numbers;

  return query
  insert into public.vouchers (
    running_no, item_name, purpose, property_id, room_type_ids, nights,
    breakfast_included, blackout_type, blackout_text, validity_start,
    validity_end, note, status, approval_token, approval_token_expires_at
  )
  select
    v_year_prefix || '/' || p_property_code || lpad(n::text, 3, '0'),
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
    'pending_approval',
    v_token,
    v_expires_at
  from unnest(v_all_numbers) as n
  returning vouchers.id, vouchers.running_no, vouchers.approval_token, vouchers.approval_token_expires_at;
end;
$$;

revoke execute on function public.submit_voucher_batch(
  text, bigint[], int, int, boolean, text, text, date, date, text, text, text
) from public;
grant execute on function public.submit_voucher_batch(
  text, bigint[], int, int, boolean, text, text, date, date, text, text, text
) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_voucher_batch_by_token — read-only lookup for the public approve
-- page. Returns rows regardless of status/expiry so the page can render an
-- "already approved/rejected/expired" message instead of a blank 404.
-- ---------------------------------------------------------------------------
create or replace function public.get_voucher_batch_by_token(p_token text)
returns table (
  id uuid,
  running_no text,
  property_code text,
  property_name text,
  room_type_names text[],
  nights int,
  breakfast_included boolean,
  blackout_type text,
  blackout_text text,
  validity_start date,
  validity_end date,
  note text,
  status text,
  approval_token_expires_at timestamptz
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
    v.approval_token_expires_at
  from public.vouchers v
  join public.properties p on p.id = v.property_id
  where v.approval_token = p_token
  order by v.running_no;
$$;

revoke execute on function public.get_voucher_batch_by_token(text) from public;
grant execute on function public.get_voucher_batch_by_token(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- approve_voucher_batch — the UPDATE itself is the concurrency guard: it
-- only matches rows still 'pending_approval', so a second click (or a
-- reject racing an approve) just matches zero rows instead of double-firing.
-- ---------------------------------------------------------------------------
create or replace function public.approve_voucher_batch(p_token text)
returns table (id uuid, running_no text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.vouchers v
  set status = 'approved', approved_at = now()
  where v.approval_token = p_token
    and v.status = 'pending_approval'
    and v.approval_token_expires_at > now()
  returning v.id, v.running_no;
end;
$$;

revoke execute on function public.approve_voucher_batch(text) from public;
grant execute on function public.approve_voucher_batch(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- reject_voucher_batch — locks the target rows first (`for update of v`) so
-- the release-pool insert and the status update see the same fixed row set;
-- without that lock, a concurrent approve could win the row after we've
-- already released its number, double-issuing it later.
-- ---------------------------------------------------------------------------
create or replace function public.reject_voucher_batch(p_token text, p_reason text)
returns table (id uuid, running_no text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A rejection reason is required.';
  end if;

  return query
  with target as (
    select v.id, v.property_id, v.running_no, v.created_at, p.code
    from public.vouchers v
    join public.properties p on p.id = v.property_id
    where v.approval_token = p_token
      and v.status = 'pending_approval'
      and v.approval_token_expires_at > now()
    for update of v
  ),
  released as (
    insert into public.released_running_numbers (property_id, year, number)
    select
      t.property_id,
      extract(year from t.created_at)::int,
      substring(t.running_no from length(t.code) + 4)::int
    from target t
    on conflict do nothing
  )
  update public.vouchers v
  set status = 'rejected', rejected_reason = p_reason
  from target t
  where v.id = t.id
  returning v.id, v.running_no;
end;
$$;

revoke execute on function public.reject_voucher_batch(text, text) from public;
grant execute on function public.reject_voucher_batch(text, text) to anon, authenticated;
