-- The real fix for "new row violates row-level security policy" on
-- upload: `upload(..., { upsert: true })` compiles to
-- `INSERT ... ON CONFLICT (name, bucket_id) DO UPDATE ... RETURNING *`,
-- which needs SELECT-visibility under RLS to evaluate the conflict target
-- and the RETURNING clause — even for a row that doesn't exist yet. 0023
-- dropped the only SELECT policy on this bucket (that WAS the public-read
-- hole), so uploads broke outright, not just the upsert-collision case
-- 0024 tried to patch.
--
-- Adding SELECT back for anon/authenticated would just reopen the same
-- hole through a different door (the authenticated-download endpoint
-- doesn't care about the bucket's public flag, only this policy). Instead:
-- approve/route.ts now uploads with the service-role client (bypasses RLS
-- entirely, never reaches the browser) — exactly what 0005's original
-- comment flagged as the eventual fix ("Tighten to a server-only
-- service-role client once auth lands"). With that in place, the
-- anon/authenticated grants on this bucket serve no purpose — nothing
-- else writes here — so drop them for real defense in depth.
drop policy if exists "vouchers bucket anon write (auth deferred)" on storage.objects;
drop policy if exists "vouchers bucket update (upsert re-export)" on storage.objects;
