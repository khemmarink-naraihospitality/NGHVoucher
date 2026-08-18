# Lub d Voucher Web App

Internal tool for Lub d hotels: an **issuer** submits a complimentary voucher
request, an assigned **approver** approves or rejects it via a token-based
email link (no login required), and on approval a JPEG + PDF voucher is
rendered and made available through a short, unguessable share link. An
**admin** panel manages properties, room types, approvers, users, and the
outbound email system; a **front_office** role can look up and claim
approved vouchers at check-in. See `docs/PRD_Voucher_Generator_WebApp_EN.md`
(one level up from this folder) for the full product spec.

Stack: Next.js (App Router, Server Actions) + Supabase (Postgres, Auth,
Storage) + Tailwind CSS v4, deployed on Vercel.

## Local setup

```bash
npm install
cp .env.local.example .env.local   # then fill in real values, see below
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign-in is Google
OAuth only — you'll need a `profiles` row with a `role` set (via the
Supabase dashboard/SQL, or the admin panel once you have one admin
account) before most of the app is usable.

### Environment variables

All required variables are listed with comments in `.env.local.example`.
Notable ones:

- `SUPABASE_SERVICE_ROLE_KEY` — server-only, bypasses RLS. Used for
  anything that has to run on behalf of a caller with no real session or
  no standing grant of their own: signing short-lived URLs for voucher/
  template/signature files (private Storage buckets), and uploading
  voucher exports. Never expose this to the client.
- `GMAIL_USER` / `GMAIL_APP_PASSWORD` / `GMAIL_SMTP_PORT` — outbound email
  goes through Gmail/Google Workspace SMTP directly (not a dedicated ESP —
  see `src/lib/email/mailer.ts` for why). Generate an App Password at
  Google Account → Security → 2-Step Verification → App passwords, then
  verify with `npm run email:test -- you@example.com`. These can also be
  set from the Admin → Email panel instead, which takes priority over the
  env vars at send time.
- `CRON_SECRET` — authorizes Vercel Cron's calls to `/api/cron/expire-vouchers`
  (daily) and `/api/cron/monthly-backup` (monthly). Must also be set as a
  Vercel project env var (Vercel sends it automatically as `Authorization:
  Bearer $CRON_SECRET` once configured there — nothing else to wire up).
- `BACKUP_EMAIL_TO` — where the monthly DB backup gets emailed
  (`api/cron/monthly-backup`, a zipped JSON dump of every table except the
  Gmail app password, in lieu of paying for Supabase's own backup add-on).

## Database & migrations

Schema and RLS policies live in `supabase/migrations/`, applied in
order. Every write is enforced by Postgres RLS, not just app-level
checks — see the comment at the top of `src/app/admin/actions.ts`. To
apply migrations to a Supabase project:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

New migrations are numbered `NNNN_description.sql`, one file per logical
change — check the highest existing number in `supabase/migrations/`
before adding one.

## Deploying

Deploys on Vercel; `vercel.json` configures the daily `expire-vouchers`
cron job (`0 1 * * *` UTC) and the monthly `monthly-backup` cron job
(`0 2 1 * *` UTC). The app lives in this `web/` subfolder, not the
repo root — when creating the Vercel project, set **Root Directory** to
`web`. Checklist for a new environment:

1. Set every var from `.env.local.example` as a Vercel project env var
   (including `CRON_SECRET` — see above), with `NEXT_PUBLIC_APP_URL` set
   to the real production URL, not `localhost`.
2. Run the Supabase migrations against that project (`supabase db push`).
3. Confirm the Storage buckets exist and are private (`vouchers`,
   `signatures`, `templates` — created by the migrations, but worth a
   quick check in the Supabase dashboard).
4. Add `<production-url>/auth/callback` to Supabase Dashboard → Authentication
   → URL Configuration → Redirect URLs (Google's own OAuth client only
   needs Supabase's own callback URL, which doesn't change between
   environments — this app-side allow-list is the one that does).
5. Log in once with a Google account — the very first sign-in against a
   fresh database bootstraps straight to `admin` + active automatically
   (`handle_new_user`, `supabase/migrations/0006`/`0033`). Every signup
   after that lands `pending` until an admin approves them from
   Admin → Users.

## Scripts

- `npm run dev` — local dev server.
- `npm run build` / `npm run start` — production build/serve.
- `npm run lint` — ESLint.
- `npm run email:test -- you@example.com` — standalone SMTP check against
  the `GMAIL_*` env vars (independent of the DB-backed settings).
