-- The vouchers bucket has only ever had an INSERT policy (0005), never
-- UPDATE — unlike templates/signatures, which both got one (0009, 0010).
-- approve/route.ts uploads with { upsert: true }, and running numbers get
-- reused after a rejection (see reject_voucher_batch's released_running_
-- numbers pool), so re-approving a reused running number eventually
-- upserts over an existing object at the same path, which is an UPDATE
-- under the hood — and was failing with "new row violates row-level
-- security policy" for lack of a policy permitting it.
create policy "vouchers bucket update (upsert re-export)"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'vouchers')
  with check (bucket_id = 'vouchers');
