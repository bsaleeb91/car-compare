# Car Compare: Product & Technical Spec

A light, private web app where a household (e.g. two partners) researches a family car together: set preferences, get Claude's recommended shortlist, analyze each vehicle one by one, log listings and test drives, and keep shared notes.

## Goals

- One place for all car-shopping research, shared by two people in real time.
- Claude recommends and explains vehicles based on the household's saved preferences.
- Every number in the analysis (payment, fuel cost, garage fit, weighted score) recalculates instantly when an input changes.

Non-goals for v1: scraping dealer sites, VIN decoding, native mobile apps.

## Stack

- **Next.js 15 (App Router) + TypeScript + Tailwind**, deployed on **Vercel**.
- **Supabase**: Postgres, Auth (email magic link), Row Level Security, Realtime.
- **Anthropic API** (Claude) called only from server routes; key in `ANTHROPIC_API_KEY`, never sent to the browser.
- Mobile-first layout (most use will be on a phone at dealerships).

## Users, login & collaboration

- Sign in with email magic link (Supabase Auth). Optional: Google sign-in.
- Each user belongs to one **household**. The first user creates it; they invite their partner by email from Settings. The invite link joins them to the same household.
- All data is scoped to the household with RLS: a user can only read/write rows where `household_id` is one of their households.
- Notes and scores record their author; show the author's name and timestamp.
- Use Supabase Realtime so a note or score added on one phone appears on the other without refresh.

## Data model

| Table | Key columns |
| --- | --- |
| `households` | id, name, created_at |
| `household_members` | household_id, user_id, display_name, role (owner/member) |
| `invites` | id, household_id, email, token, accepted_at |
| `preferences` | household_id (unique), budget_min, budget_max, down_payment, loan_months, apr, miles_per_year, gas_price, garage_depth_in, garage_door_width_in, garage_door_height_in, min_walkaround_in, buy_by_date, excluded_brand_origins (text[]), must_haves (jsonb: min_seats, sliding_doors, awd, hybrid, parking_sensors), weights (jsonb, must total 100) |
| `vehicles` | id, make, model, generation_years, type (minivan/suv), brand_origin, seats, sliding_doors, length_in, width_in, height_in, wheelbase_in, ground_clearance_in, cargo_3rd, cargo_2nd, cargo_max, third_row_legroom_in, hp, mpg_combined, hybrid_available, awd_available, towing_lbs, price_low, price_high, reliability_note, budget_years, specs_verified (bool) |
| `trims` | id, vehicle_id, model_years, name, key_features (text[]), has_parking_sensors, has_backup_camera |
| `shortlist` | household_id, vehicle_id, status (considering/test-driven/finalist/rejected), added_by, ai_rationale |
| `listings` | id, household_id, vehicle_id, year, trim, miles, asking_price, dealer, url, vin, cpo, accidents_owners, status (watching/contacted/test-drive/offer/passed), added_by |
| `scores` | household_id, vehicle_id, user_id, criterion, score (1–5) |
| `notes` | id, household_id, vehicle_id, trim_id (nullable), listing_id (nullable), author_id, body, created_at |
| `financing_quotes` | id, household_id, lender, apr, months, monthly_payment, notes |

`vehicles` and `trims` are a shared catalog (readable by all signed-in users, writable only via seed/admin).

## Screens

1. **Onboarding / Preferences**: a short wizard for budget, down payment, loan, must-haves, brand exclusions, priority weights (sliders that always sum to 100%), driving and garage inputs. Editable later from Settings.
2. **Recommend**: button "Ask Claude for a shortlist." Server route sends preferences + the vehicle catalog to Claude and returns a ranked list with a 2–3 sentence rationale per vehicle and any deal-breaker conflicts. User can add each to the shortlist.
3. **Shortlist / Compare**: side-by-side table of shortlisted vehicles; best value per row highlighted; columns sortable; weighted score and rank at the bottom.
4. **Vehicle detail** (the one-by-one analysis): specs, trims and which trim gets which features, garage fit result, estimated monthly payment at the low/high price, annual fuel cost, each member's test-drive scores, listings for this model, and the shared notes thread. A "Ask Claude about this car" box answers questions using the vehicle's data and the household's preferences.
5. **Listings**: tracker table across all vehicles with status filter; add/edit from a quick form (paste URL, miles, price, dealer).
6. **Test drive**: one-screen scorecard per vehicle for each member (criteria below), usable one-handed on a phone.
7. **Financing**: payment calculator plus saved lender quotes.
8. **Settings**: household name, invite spouse, members list, edit preferences.

## Three-stage comparison flow (models, then trims, then listings)

The app walks the household through three stages, in order. Each stage narrows the field before the next one opens, and the user can go back at any time.

1. **Models**: compare make/models on things that barely change by trim (size, cargo, seats, reliability, MPG, AWD, price range). User marks models as finalists. Stage 2 unlocks once at least one finalist is chosen.
2. **Trims**: for each finalist model, compare its trims side by side: features each trim adds (e.g. parking sensors, rear-seat camera, ventilated seats), typical used price range, and which trims fit the budget. Trims from different models can also be compared directly (e.g. Odyssey Touring vs Pilot Elite). User marks target trims.
3. **Listings**: compare specific vehicles for sale of the target trims: year, miles, asking price, dealer, CPO, accident/owner history, monthly payment at that price, and notes. This is where the final pick is made.

A progress indicator shows the current stage and what's been chosen in earlier stages.

Data model additions: `trims` gains `price_low`, `price_high`, `features` (jsonb of booleans: parking_sensors, backup_camera, rear_camera, intercom, rear_entertainment, ventilated_seats, heated_wheel, power_liftgate, moonroof, leather), `specs_verified`. `shortlist` gains `stage` (model/trim/listing). Add `trim_shortlist` (household_id, trim_id, status, added_by). `listings.trim_id` references `trims`.

## Add any vehicle

Users can add any vehicle sold in the US, not just the seeded catalog.

- Form asks only for **make, model, year and trim**.
- `POST /api/vehicle-autofill` sends those to Claude and returns JSON for every `vehicles` and `trims` field (dimensions, cargo behind 3rd/2nd row and max, legroom, hp, MPG, AWD, towing, seats, features, typical used price range). Validate with zod.
- Results open as an **editable form**; the user can correct any field before saving. Every autofilled field is saved with `specs_verified = false` and shows an "unverified" badge until a user confirms it.
- If the make/model/trim already exists in the catalog, link to it instead of creating a duplicate.
- Added vehicles belong to the household (`vehicles.household_id` nullable: null = shared seed catalog, set = household-added) and RLS scopes them accordingly.
- Future option: replace or cross-check autofill with a paid vehicle-spec API.

## Live financing what-ifs

Interest rates differ between cars (new-car promo APRs are often far lower than used-car rates), so rate and terms are adjustable per car, live.

- Every vehicle, trim and listing card shows its monthly payment with inline controls: **price, APR, down payment and term**, adjusted by slider or typed value. Payment, total interest and total cost update instantly as you move them (client-side, no save needed).
- Each listing has a **condition** (new / used / CPO). Preferences hold a default APR for each (e.g. new 4.9%, CPO 5.9%, used 6.9%), and a listing starts from the default for its condition.
- A per-listing APR override can be saved (e.g. a dealer's promo rate); a "reset to default" control reverts it.
- **Side-by-side finance view**: pick 2–4 listings and see each one's monthly payment, total interest and total cost over the loan, with the difference from the cheapest highlighted. Example: a new car at 2.9% vs a used car at 7.5%.
- Data model: `listings` gains `condition`, `apr_override`, `down_override`, `term_override`; `preferences` gains `apr_new`, `apr_cpo`, `apr_used`.

## Car-seat fit

With a second baby coming, car-seat fit can decide the purchase, so it is tracked per listing (and rolled up to trim and model).

- Household profile lists its car seats (name, type: infant / convertible / booster, width in inches if known).
- Each listing gets a **car-seat fit check**, filled in on the test drive: which seat went in which position (2nd-row left/middle/right, 3rd-row left/middle/right), whether it installed with LATCH or seat belt, whether the front seat in front still had comfortable room, and whether a third passenger fit beside two seats.
- Shows a simple seat map of the vehicle with each tested seat placed, plus a pass / tight / fail result per position.
- Model and trim pages show the count of LATCH positions and tether anchors (autofilled, marked unverified until confirmed).
- Data model: `car_seats` (household_id, name, type, width_in); `seat_fit_checks` (listing_id, car_seat_id, position, install_method, result, notes, checked_by, checked_at). `vehicles` gains `latch_positions`, `tether_anchors`.

## Dealer contacts

Each listing tracks the dealer conversation so negotiation doesn't live in text threads.

- Per listing: dealership, salesperson name, phone, email, and a log of quotes received (date, out-the-door price, what's included, APR offered, expiration).
- **Follow-up date** with a reminder badge on the listing and a "Follow-ups due" list on the home screen.
- Contact log entries (date, channel: call / text / email / in person, summary, author) shared with the household.
- Tapping a phone number or email opens the phone's dialer or mail app.
- Data model: `dealer_contacts` (id, household_id, dealership, salesperson, phone, email); `listings.dealer_contact_id`; `quotes` (listing_id, date, otd_price, apr_offered, includes, expires_on, added_by); `contact_log` (listing_id, date, channel, summary, author_id); `listings.follow_up_on`.

## Notes at every stage

Shared notes threads exist at all three levels: model, trim and listing. A note is attached to the most specific item it was written on (`listing_id` > `trim_id` > `vehicle_id`).

- Model page shows its own notes plus a collapsible "Notes on trims and listings" section rolling up everything beneath it.
- Trim page shows trim notes plus notes on that trim's listings.
- Listing page shows only that listing's notes.
- Every note shows author name and timestamp and syncs live to the other household member (Realtime). Authors can edit or delete their own notes.
- A small note-count badge appears on each model, trim and listing card.

## Must-haves vs nice-to-haves

A shared, editable feature wishlist the household builds together (e.g. rear-seat camera, parking sensors, AWD, sliding doors, 8 seats, hybrid).

- Each item has a name, a tier (**must-have**, **nice-to-have** or **don't care**), who added it, and optional notes. Either spouse can add, edit, reorder or move items between tiers; changes sync live.
- **Preloaded feature catalog:** the list comes prebuilt, so nobody types features in. Every feature starts as "Don't care" and the user just taps to sort it into Must-have, Nice-to-have or Don't care. Grouped by category:
    - Kids & family: rear-seat camera (e.g. Honda CabinWatch), intercom to rear rows, 8 seats, 2nd-row captain's chairs, removable/sliding 2nd row, easy 3rd-row access with car seats installed, LATCH positions (3+), rear sunshades, rear entertainment screen, rear climate controls, rear USB ports.
    - Doors & cargo: power sliding doors, hands-free sliding doors, power liftgate, hands-free liftgate, fold-flat 3rd row, roof rails, built-in vacuum.
    - Safety & driver assist: backup camera, 360° camera, front/rear parking sensors, blind-spot monitoring, rear cross-traffic alert, adaptive cruise control, lane-keeping assist, automatic emergency braking, rear-seat reminder.
    - Comfort: leather, heated front seats, ventilated front seats, heated 2nd row, heated steering wheel, moonroof, tri-zone climate, power-adjustable seats with memory.
    - Tech: Apple CarPlay/Android Auto (wireless), large touchscreen, built-in navigation, premium audio, wireless charging, head-up display.
    - Powertrain: hybrid, AWD, tow hitch / towing package, remote start.
- **Claude suggests tiers:** a "Suggest for us" button sends the household profile (number and ages of kids, road-trip and city driving, budget) to Claude, which pre-sorts the catalog with a one-line reason per item. The user accepts, changes or clears any suggestion.
- Users can still add a custom feature if something's missing.
- Each item maps to a feature field on trims/vehicles where one exists (e.g. rear-seat camera -> `features.rear_camera`); free-text items without a mapping are checked off manually per listing.
- **Filtering:** a model, trim or listing missing any must-have is flagged "Missing must-have: X" (or hidden, with a toggle to show them).
- **Scoring:** nice-to-haves add to a "nice-to-have match" score shown on each card (e.g. 4 of 6), and can optionally feed the weighted score.
- Data model: `wishlist_items` (id, household_id, name, tier, feature_key nullable, notes, sort_order, added_by); `listing_feature_checks` (listing_id, wishlist_item_id, has_it, checked_by).

## Calculations (pure functions, unit-tested)

- **Monthly payment**: P × r / (1 − (1 + r)^−n), P = price − down payment, r = APR / 12, n = months. Show total interest. Note that VA sales tax (~4.15%) and fees are excluded unless the user toggles them on.
- **Annual fuel cost**: miles_per_year ÷ mpg_combined × gas_price.
- **Garage fit**: depth left = garage_depth − length; door width margin = door_width − width; door height margin = door_height − height. "Yes" if depth left ≥ min_walkaround and width margin ≥ 12 and height margin ≥ 3; "Tight" if all positive; else "No".
- **Weighted score**: Σ(weight × score) using the household's averaged member scores (fall back to suggested scores before test drives); rank descending.
- **Filtering**: exclude vehicles whose brand_origin is in excluded_brand_origins or that fail a must-have; show why each was excluded.

Test-drive criteria: car-seat install (2nd row), 3rd-row access with car seats in, cargo with 3rd row up (stroller + luggage), ride and noise on the highway, parking/city ease, **driving feel & handling**, infotainment/CarPlay, overall verdict.

**Driving feel & handling** gets its own section on the test-drive screen, because some vehicles are easy and enjoyable to drive while taller SUVs can feel top-heavy and less stable in quick lane changes or turns taken without slowing. Each member scores 1–5 on:
- Stability in lane changes (body lean, does it feel planted or tippy)
- Cornering confidence (how it handles a turn at normal speed)
- Steering feel (precise vs vague, effort in parking lots)
- Braking confidence (smooth, stops straight)
- Visibility (blind spots, seeing over the hood, rear view)
- Enjoyment (does it feel easy and pleasant to drive)

Plus a free-text "how it felt" note. The screen shows a short reminder to judge these at normal, legal speeds on the test route, not by driving aggressively.

Alongside the scores, each model shows its **NHTSA rollover rating** and overall crash rating (autofilled from Claude, marked unverified until confirmed on nhtsa.gov), so the subjective feel sits next to the measured data. Data model: `vehicles` gains `nhtsa_rollover_stars`, `nhtsa_overall_stars`; handling criteria are stored in `scores` like the others.

## Claude integration

- `POST /api/recommend`: input = preferences + catalog (JSON). Ask for JSON only: `[{vehicle_id, rank, fit_score, rationale, conflicts[]}]`. Validate with zod; on parse failure retry once, then show an error.
- `POST /api/ask`: input = vehicle row, its trims, household preferences, recent notes, user question. Return plain text, under 200 words.
- System prompt for both: use only the provided data for specs and prices; say when something isn't in the data; never invent listings.
- Rate-limit per household (e.g. 30 calls/hour).

## Seed data

Seed `vehicles` from the comparison spreadsheet (`Second_Car_Comparison.xlsx`, Measurements tab): Honda Odyssey, Toyota Sienna, Kia Carnival, Honda Pilot, Toyota Highlander, Toyota Grand Highlander, Toyota 4Runner (2010–2024 gen), VW Atlas. Set `specs_verified = false` for figures not yet confirmed against manufacturer sites, and show a small "unverified" badge in the UI.

Seed `trims` for the Odyssey 2022–2024: LX (2022 only), EX, EX-L, Sport (2023–2024), Touring (adds front/rear parking sensors, rear camera, intercom, rear entertainment), Elite. All trims have a backup camera.

Default preferences: budget $30,000–$35,000, down payment $10,000, 60 months, APR 6.5%, 12,000 miles/yr, $3.25/gal, garage 240 × 108 × 84 in, min walk-around 24 in, buy by 2027-03-31, excluded brand origin: USA, weights cargo 25 / car-seat access 20 / reliability 15 / price 15 / fuel 10 / city ease 10 / AWD 5.

## Build phases

1. Scaffold Next.js + Tailwind + Supabase; schema migrations with RLS; magic-link auth; household creation and invite flow.
2. Seed catalog; Preferences wizard; Compare table with calculations and highlighting.
3. Vehicle detail page with notes (Realtime), scores, listings, and garage/payment/fuel panels.
4. Claude routes (`/api/recommend`, `/api/ask`) and their UI.
5. Three-stage flow (models, trims, listings) and add-any-vehicle autofill.
6. Listings tracker, financing quotes, polish for mobile, deploy to Vercel.

## Acceptance criteria

- Two accounts in the same household see each other's notes and scores within a few seconds without refreshing; a third account outside the household sees nothing.
- Changing APR, down payment, gas price or garage size updates every dependent number immediately.
- Excluding US brands removes any American-brand vehicle and states the reason.
- Claude's shortlist only contains vehicles from the catalog and every rationale references the household's preferences.
- A user can add a vehicle by make/model/year/trim, edit the autofilled specs, and see it marked unverified until confirmed.
- The flow moves models, then trims, then listings, and trims from different models can be compared side by side.
- Moving the APR, down payment or term slider on any car updates its payment, total interest and total cost instantly, and a new car at a promo rate can be compared side by side with a used car at a higher rate.
- A car-seat fit check can be recorded per listing with a result for each seat position, and appears on the listing and trim pages.
- Each listing stores its dealer contact, quotes and follow-up date; due follow-ups appear on the home screen for both household members.
- Notes can be left on a model, a trim or a listing; each shows its author, syncs live to the spouse, and rolls up to the parent page.
- Both spouses can build a shared must-have / nice-to-have list; vehicles missing a must-have are flagged, and each card shows its nice-to-have match count.
- The test-drive screen includes a driving feel & handling section scored by each member, shown next to the model's NHTSA rollover rating.
- Calculation functions have unit tests; the app passes `npm run build` and `npm run lint`.
- `.env.example` lists `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`; no secrets committed.


## Implementation decisions (Phase 1)

These resolve overlaps in the spec above; the schema in `supabase/migrations` is authoritative.

- **Multi-household app.** Any number of households can sign up. Every household-owned row has `household_id` and RLS checks membership via `public.is_member()`. A user belongs to one household (v1).
- **Must-haves live in one place:** `wishlist_items.tier`. `preferences.must_haves` was dropped.
- **APR lives in one place:** `preferences.apr_new / apr_cpo / apr_used` (default used for a listing's condition), plus per-listing overrides. The single `preferences.apr` was dropped. A 0% APR must be handled as `principal / months`.
- **Trim features live in one place:** `trims.features` jsonb. `has_parking_sensors` / `has_backup_camera` were dropped.
- **Listing condition** (`new` / `used` / `cpo`) replaces the `cpo` boolean.
- **Catalog:** `vehicles.household_id` / `trims.household_id` null = shared seed catalog (read-only to users); set = household-added (private to that household).
- **Scores** are unique per (household, vehicle, user, criterion); members can only write their own.
- **Notes:** author-only edit/delete; household-wide read.
- **Invites** are owner-created, expire after 14 days, single-use, and only accepted by the invited email address (a forwarded link can't be used by someone else).
- **Neutral defaults for new households:** `excluded_brand_origins` starts empty, garage size and buy-by date start unset; the preferences wizard collects them.
- **Feature catalog** is a global table copied into each new household's wishlist as "Don't care".
- **Next.js 16** (current at build time) instead of 15; Cache Components disabled because nearly every page is per-household live data.
