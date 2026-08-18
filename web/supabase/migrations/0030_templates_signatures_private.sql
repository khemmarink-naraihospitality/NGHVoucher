-- templates/signatures buckets had the same guessable-path problem the
-- vouchers bucket had (migration 0023) — sequential approver IDs
-- (signatures/1/signature.png, signatures/2/...) and small guessable
-- property codes, fully public. signatures is the more sensitive of the
-- two: real people's actual signature images, trivially enumerable with
-- no link required at all.
--
-- Unlike vouchers, neither bucket has a "must work for anonymous guests
-- with no account" requirement in the sharing sense — but the anonymous
-- approve/[token] page DOES need to render both (template art + the
-- assigned approver's signature) before the approver decides, so "require
-- login" isn't an option either. Same fix as vouchers: private bucket, no
-- anon/authenticated grants at all, every consumer resolves a fresh
-- signed URL server-side (lib/supabase/signedUrl.ts) via the service-role
-- client instead of using a stored public URL.
--
-- properties.template_config.imagePath and approvers.signature_url now
-- store bare storage paths going forward (app/admin/actions.ts), not
-- public URLs — the resolver also transparently handles old rows that
-- still hold a full public URL from before this migration, so no backfill
-- is needed.
update storage.buckets set public = false where id in ('templates', 'signatures');

drop policy if exists "templates bucket public read" on storage.objects;
drop policy if exists "signatures bucket public read" on storage.objects;

-- Admin-only SELECT, not "no SELECT at all" (that's what vouchers ended
-- up with, migration 0025) — these uploads go through admin/actions.ts's
-- normal RLS-bound client with upsert: true, which compiles to
-- INSERT ... ON CONFLICT DO UPDATE ... RETURNING and needs SELECT-
-- visibility to evaluate even for the insert branch (this is the exact
-- bug that broke voucher uploads earlier — see 0025's comment). Unlike
-- the vouchers upload path (authorized by approval_token possession,
-- safely movable to a service-role client), these actions have no
-- application-code auth check of their own — RLS via is_admin() *is* the
-- authorization boundary here (see the "every mutation here is also
-- enforced by RLS" comment at the top of admin/actions.ts), so removing
-- read access entirely would either break uploads or require bypassing
-- that boundary with a service-role client. An admin-only SELECT policy
-- satisfies the upsert internals without opening read access to anyone
-- else — normal consumption never uses this policy anyway, it goes
-- through the service-role-signed-URL path (lib/supabase/signedUrl.ts)
-- regardless of caller.
create policy "templates bucket admin read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'templates' and (select private.is_admin()));

create policy "signatures bucket admin read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'signatures' and (select private.is_admin()));
