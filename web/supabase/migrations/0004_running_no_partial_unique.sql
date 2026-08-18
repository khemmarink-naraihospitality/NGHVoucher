-- Fixes a real conflict between two PRD §6.4/§8 requirements: a rejected
-- voucher's running_no must stay in history forever (never deleted), *and*
-- that same number must be reissuable to a later batch. A plain UNIQUE
-- constraint on running_no can't satisfy both — the old rejected row would
-- collide with the new row reusing its number. Caught by
-- reject_voucher_batch + submit_voucher_batch smoke-testing in migration
-- 0003, before any real voucher data existed.
--
-- Fix: uniqueness only applies among non-rejected rows (a partial index).
-- A rejected voucher can now coexist with a later voucher that reused its
-- running_no; two *active* vouchers still can never share a number.
alter table public.vouchers drop constraint vouchers_running_no_key;

create unique index vouchers_running_no_active_key
  on public.vouchers (running_no)
  where status <> 'rejected';
