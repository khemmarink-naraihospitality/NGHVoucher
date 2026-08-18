-- Phase 3 cont'd: real PNG/PDF export on approval (PRD §6.3, §9). Adds the
-- storage bucket, extends get_voucher_batch_by_token with the fields the
-- approve page and export step need (rejected_reason/approved_at/export
-- URLs), and a small setter the export step calls per-voucher after upload.

-- ---------------------------------------------------------------------------
-- Storage bucket. Public read (a voucher PNG/PDF isn't sensitive — running
-- number, dates, room type — and PRD §4 step 7 wants it "immediately
-- downloadable"). Anon INSERT is the same auth-deferred posture as the SQL
-- RPCs elsewhere in this phase: the app has no session yet, so it uploads
-- with the anon key. Tighten to a server-only service-role client once
-- auth lands.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('vouchers', 'vouchers', true)
on conflict (id) do nothing;

create policy "vouchers bucket public read"
  on storage.objects for select
  to public
  using (bucket_id = 'vouchers');

create policy "vouchers bucket anon write (auth deferred)"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'vouchers');

-- ---------------------------------------------------------------------------
-- get_voucher_batch_by_token — drop + recreate: return shape changed
-- (adds rejected_reason, approved_at, exported_png_url, exported_pdf_url)
-- so the approve page can render every terminal state and download links.
-- ---------------------------------------------------------------------------
drop function if exists public.get_voucher_batch_by_token(text);

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
  approval_token_expires_at timestamptz,
  approved_at timestamptz,
  rejected_reason text,
  exported_png_url text,
  exported_pdf_url text
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
    v.approval_token_expires_at,
    v.approved_at,
    v.rejected_reason,
    v.exported_png_url,
    v.exported_pdf_url
  from public.vouchers v
  join public.properties p on p.id = v.property_id
  where v.approval_token = p_token
  order by v.running_no;
$$;

revoke execute on function public.get_voucher_batch_by_token(text) from public;
grant execute on function public.get_voucher_batch_by_token(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- set_voucher_export_urls — called once per voucher row right after its
-- PNG/PDF are uploaded. Scoped to status = 'approved' as a sanity check
-- (the voucher id is an unguessable uuid, but this keeps the function from
-- being usable to graffiti arbitrary rows regardless of state).
-- ---------------------------------------------------------------------------
create or replace function public.set_voucher_export_urls(
  p_voucher_id uuid,
  p_png_url text,
  p_pdf_url text
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.vouchers
  set exported_png_url = p_png_url, exported_pdf_url = p_pdf_url
  where id = p_voucher_id and status = 'approved';
$$;

revoke execute on function public.set_voucher_export_urls(uuid, text, text) from public;
grant execute on function public.set_voucher_export_urls(uuid, text, text) to anon, authenticated;
