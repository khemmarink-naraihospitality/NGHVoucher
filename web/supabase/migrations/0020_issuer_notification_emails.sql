-- Surfaces the issuer's name/email on get_voucher_batch_by_token so
-- api/approve and api/reject can email them back once a decision is made
-- (PRD §7/§4 steps 7-8 — previously only the initial approver-notification
-- email existed). Safe to expose to whoever holds the approval_token (the
-- assigned approver) alongside everything else this function already
-- returns keyed on that token.
drop function if exists public.get_voucher_batch_by_token(text);

create or replace function public.get_voucher_batch_by_token(p_token text)
returns table (
  id uuid,
  running_no text,
  property_code text,
  property_name text,
  template_config jsonb,
  room_type_names text[],
  nights int,
  breakfast_included boolean,
  blackout_type text,
  blackout_text text,
  validity_start date,
  validity_end date,
  note text,
  item_name text,
  purpose text,
  status text,
  approval_token_expires_at timestamptz,
  approved_at timestamptz,
  rejected_reason text,
  exported_png_url text,
  exported_pdf_url text,
  approver_name text,
  approver_position text,
  approver_signature_url text,
  issuer_name text,
  issuer_email text
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
    p.template_config,
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
    v.item_name,
    v.purpose,
    v.status,
    v.approval_token_expires_at,
    v.approved_at,
    v.rejected_reason,
    v.exported_png_url,
    v.exported_pdf_url,
    a.name,
    a.position,
    a.signature_url,
    coalesce(i.full_name, i.email),
    i.email
  from public.vouchers v
  join public.properties p on p.id = v.property_id
  left join public.approvers a on a.id = v.selected_approver_id
  left join public.profiles i on i.id = v.issuer_id
  where v.approval_token = p_token
  order by v.running_no;
$$;

revoke execute on function public.get_voucher_batch_by_token(text) from public;
grant execute on function public.get_voucher_batch_by_token(text) to anon, authenticated;
