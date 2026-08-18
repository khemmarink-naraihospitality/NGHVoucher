-- handle_new_user is a trigger-only function (fires on auth.users insert).
-- Postgres already refuses to call a `returns trigger` function directly
-- via SQL/RPC, but it still shows up on PostgREST's RPC surface by default
-- — revoke the unnecessary grant so it isn't listed there at all.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
