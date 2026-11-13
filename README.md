# Car Compare

A private, mobile-first web app for a household shopping for a family car together. Set your preferences, get a shortlist recommended by Claude, compare models, then trims, then real listings, and record test-drive scores and shared notes that sync live between partners.

Any number of households can use one deployment. Each household's data is isolated with Postgres Row Level Security.

See [`docs/SPEC.md`](docs/SPEC.md) for the full product spec and the implementation decisions.

## Status

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Next.js + Supabase scaffold, full schema with RLS, magic-link auth, household creation, invites | **Done** |
| 2 | Seed catalog, preferences wizard, compare table and calculations | Next |
| 3 | Vehicle detail page: notes (Realtime), scores, listings, garage/payment/fuel panels | |
| 4 | Claude routes (`/api/recommend`, `/api/ask`) | |
| 5 | Three-stage flow, add-any-vehicle autofill | |
| 6 | Listings tracker, financing quotes, mobile polish, deploy | |

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS 4
- Supabase: Postgres, Auth (email magic link), Row Level Security, Realtime
- Anthropic API (Claude), called only from server routes
- Vitest + PGlite (in-memory Postgres) for database and calculation tests

## Local setup

1. **Install:** `npm install`
2. **Create a Supabase project** at [supabase.com](https://supabase.com).
3. **Apply the schema.** Either paste `supabase/migrations/20261113000000_init.sql` into the SQL editor, or with the CLI:
   ```sh
   npx supabase link --project-ref <your-ref>
   npx supabase db push
   ```
4. **Configure auth** (Dashboard → Authentication → URL Configuration):
   - Site URL: `http://localhost:3000` (your production URL once deployed)
   - Redirect URLs: `http://localhost:3000/auth/callback` and `https://<your-domain>/auth/callback`
5. **Environment:** `cp .env.example .env.local` and fill in the values.
6. **Run:** `npm run dev` and open http://localhost:3000.

### Before inviting other households

Supabase's built-in email sender is rate-limited to a handful of emails per hour and is meant for testing only. For real use, set up custom SMTP (for example Resend or Postmark) under Authentication → SMTP Settings.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest: RLS / household-isolation tests against an in-memory Postgres |

## Security model

- Every household-owned table has `household_id`; RLS policies call `public.is_member(household_id)`.
- Child rows (quotes, contact log, seat-fit checks, and so on) use composite foreign keys `(parent_id, household_id)`, so they can't point at another household's rows.
- The shared vehicle catalog (`household_id IS NULL`) is readable by all signed-in users and writable only through migrations or the service role. Vehicles a household adds are private to that household.
- Households and memberships are created only through the `create_household` and `accept_invite` functions. Invites are single-use, expire after 14 days, and must be accepted by the invited email address.
- `SUPABASE_SERVICE_ROLE_KEY` and `ANTHROPIC_API_KEY` are server-only. No secrets are committed.

`tests/db/rls.test.ts` checks these rules. It boots the real migration in PGlite with a stub of Supabase's `auth` schema.
