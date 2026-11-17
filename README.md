# Car Compare

A private, mobile-first web app for a household shopping for a family car together. Set your preferences, get a shortlist recommended by Claude, compare models, then trims, then real listings, and record test-drive scores and shared notes that sync live between partners.

Any number of households can use one deployment. Each household's data is isolated with Postgres Row Level Security.

See [`docs/SPEC.md`](docs/SPEC.md) for the full product spec and the implementation decisions.

## Status

Live and in use. Built in ten steps; nine are done.

| Step | Feature | Status |
| --- | --- | --- |
| 1 | Car pages: specs, garage fit, payment and fuel panels, scores | Done |
| 2 | Shared notes that sync live between household members | Done |
| 3 | Test-drive scorecard | Done |
| 4 | Must-haves and nice-to-haves, with "missing a must-have" flags | Done |
| 5 | Listings tracker: dealer contacts, contact log, follow-ups, quotes | Done |
| 6 | Trims compare: Models / Trims switch, target trims (Odyssey trims seeded) | Done |
| 7 | Finance what-ifs: per-listing sliders, side-by-side financing | Done |
| 8 | Car-seat fit: household car seats, per-listing seat map and fit check | Done |
| 9 | Claude features: recommend, ask, suggested tiers, add-any-vehicle autofill | To do (needs `ANTHROPIC_API_KEY`) |
| 10 | Three-stage flow: models, then trims, then listings, with a progress bar | Done |

Known gaps: lender pre-approval quotes, linking listings to trims, brand-origin exclusion and the buy-by date in
Preferences, sliders for the priority weights, sortable compare columns, and trims for models other than the Odyssey.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS 4
- Supabase: Postgres (own `car_compare` schema), Auth (6-digit email code), Row Level Security, Realtime
- Anthropic API (Claude), called only from server routes
- Vitest + PGlite (in-memory Postgres) for database and calculation tests

## Local setup

1. **Install:** `npm install`
2. **Create a Supabase project** at [supabase.com](https://supabase.com).
3. **Apply the schema** with `npx supabase login`, then `npm run migrate -- up --ref <your-project-ref>`. See [Migrations](#migrations).
4. **Expose the schema to the API** (Dashboard → Project Settings → Data API → Exposed schemas): add `car_compare`. Or in `supabase/config.toml`, add it to `[api] schemas`.
5. **Allow the redirect URL** (Authentication → URL Configuration → Redirect URLs): add your `NEXT_PUBLIC_SITE_URL`. The app sends it with each sign-in request, so a shared email template can word the email for this app.
6. **Send a code, not a link.** Sign-in uses a 6-digit code typed into the app. In Authentication → Email Templates, make the "Magic Link" and "Confirm signup" templates show `{{ .Token }}` (for example, "Your Car Compare code is {{ .Token }}"). With the default templates, people get a link the app doesn't use.
7. **Environment:** `cp .env.example .env.local` and fill in the values.
8. **Run:** `npm run dev` and open http://localhost:3000.

### Before inviting other households

Supabase's built-in email sender is rate-limited to a handful of emails per hour and is meant for testing only. For real use, set up custom SMTP (for example Resend or Postmark) under Authentication → SMTP Settings.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest: RLS / household-isolation tests and migration checks against an in-memory Postgres |
| `npm run migrate` | Apply and check migrations on a hosted project (see below) |

## Migrations

Car Compare is built to share a Supabase project with another app, so it keeps its own migration history in `car_compare_migrations.applied` instead of Supabase's `supabase_migrations` (which belongs to whichever app owns the project).

| Command | What it does |
| --- | --- |
| `npm run migrate -- status --ref <ref>` | Read-only. Lists applied and pending migrations, and flags files edited after they were applied |
| `npm run migrate -- up --ref <ref>` | Applies pending migrations in order. Each runs in one transaction together with its history row |
| `npm run migrate -- baseline --ref <ref> <version>` | Records a migration that was already applied by hand, without running it |

Rules:

- **Don't use `supabase db push`** for this app. It would write to the shared history.
- **Never edit an applied migration.** Add a new file with a later timestamp (`YYYYMMDDHHMMSS_name.sql`). `status` and `up` refuse to run if an applied file has changed.
- **Stay inside `car_compare`.** Migrations must not touch `public` or use blanket grants on other schemas. `tests/migrate.test.ts` enforces this.
- **Exposed schemas:** `car_compare` must already exist before it's added to the Data API's exposed schemas. Listing a schema that doesn't exist takes the whole API down.

## Security model

- All tables and functions live in the `car_compare` schema, so the app can share a Supabase project with other apps without touching their objects. Only signed-in users (`authenticated`) can use it; `anon` and `service_role` get no access.
- New accounts are created with user metadata `{"app": "car_compare"}`, so other apps sharing the project's users can tell them apart.
- The app never deletes login accounts. In a shared project one account can belong to several apps, and deleting it removes that person's data in all of them. Leaving a household removes only the membership.
- Every household-owned table has `household_id`; RLS policies call `car_compare.is_member(household_id)`.
- Child rows (quotes, contact log, seat-fit checks, and so on) use composite foreign keys `(parent_id, household_id)`, so they can't point at another household's rows.
- The shared vehicle catalog (`household_id IS NULL`) is readable by all signed-in users and writable only through migrations. Vehicles a household adds are private to that household.
- Households and memberships are created only through the `create_household` and `accept_invite` functions. Invites are single-use, expire after 14 days, and must be accepted by the invited email address.
- Claude calls are rate-limited per household (30 per hour) by `car_compare.consume_ai_call()`, which runs as the signed-in user.
- The app needs no service-role key. `ANTHROPIC_API_KEY` is server-only. No secrets are committed.

`tests/db/rls.test.ts` checks these rules. It boots the real migration in PGlite with a stub of Supabase's `auth` schema.
