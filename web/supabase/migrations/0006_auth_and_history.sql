-- Phase 4: real Issuer auth (Google OAuth) + History page.
--
-- This is the "once real auth lands" cleanup flagged throughout migrations
-- 0002/0003: submit_voucher_batch now records the real issuer and requires
-- an authenticated session; the approver-side RPCs (approve/reject/
-- get_voucher_batch_by_token) stay anon-callable on purpose — the Approver
-- still never logs in (PRD §3, §7), only the Issuer does.

-- ---------------------------------------------------------------------------
-- handle_new_user — auto-provisions a profiles row on every Supabase Auth
-- signup. Bootstraps the very first account as 'admin' (nobody could use
-- the Admin page to promote anyone otherwise); every subsequent signup is
-- 'issuer'. Access control chosen for this phase: open self-signup —
-- anyone who completes Google OAuth gets an account (PRD §3 role table
-- still governs what they can *do* once logged in).
--
-- Stopgap: also grants every new profile access to every existing
-- property. There's no Admin page yet to hand-assign properties per PRD
-- §3, so without this a fresh signup would see an empty workspace. Replace
-- with real Admin-driven user_properties assignment once that page ships.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  v_role := case when not exists (select 1 from public.profiles) then 'admin' else 'issuer' end;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', new.email),
    v_role
  );

  insert into public.user_properties (user_id, property_id)
  select new.id, p.id from public.properties p;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- submit_voucher_batch — now requires a session and records the real
-- issuer_id (previously null, per the Phase 2 deferred-auth decision).
-- Same signature as 0003 (create or replace is enough, no drop needed).
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
  v_issuer_id uuid := auth.uid();
begin
  if v_issuer_id is null then
    raise exception 'Not authenticated.';
  end if;

  if p_voucher_count is null or p_voucher_count < 1 then
    raise exception 'voucher_count must be at least 1';
  end if;

  select p.id into v_property_id from public.properties p where p.code = p_property_code;
  if v_property_id is null then
    raise exception 'Unknown property code: %', p_property_code;
  end if;

  if not (
    (select private.has_property_access(v_property_id)) or (select private.is_admin())
  ) then
    raise exception 'You do not have access to this property.';
  end if;

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
    validity_end, note, issuer_id, status, approval_token, approval_token_expires_at
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
    v_issuer_id,
    'pending_approval',
    v_token,
    v_expires_at
  from unnest(v_all_numbers) as n
  returning vouchers.id, vouchers.running_no, vouchers.approval_token, vouchers.approval_token_expires_at;
end;
$$;

revoke execute on function public.submit_voucher_batch(
  text, bigint[], int, int, boolean, text, text, date, date, text, text, text
) from public, anon;
grant execute on function public.submit_voucher_batch(
  text, bigint[], int, int, boolean, text, text, date, date, text, text, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- get_voucher_workspace_catalog — Create Voucher page is now behind login,
-- so this no longer needs to be anon-callable either.
-- ---------------------------------------------------------------------------
revoke execute on function public.get_voucher_workspace_catalog() from anon;

-- ---------------------------------------------------------------------------
-- get_my_voucher_history — PRD §4 step 9. SECURITY INVOKER (not DEFINER,
-- unlike everything else in this file) so the underlying vouchers/
-- properties reads run as the calling user and stay subject to the
-- existing vouchers_select RLS policy (own-issued OR property-access OR
-- admin) from migration 0001 — no need to re-derive that logic here.
-- ---------------------------------------------------------------------------
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
