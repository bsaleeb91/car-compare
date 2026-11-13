-- Car Compare: initial schema
-- Multi-household: every household-owned row carries household_id and is
-- protected by RLS via public.is_member(). Shared catalog rows (vehicles,
-- trims with household_id IS NULL) are readable by every signed-in user and
-- writable only by service role / migrations.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Random 64-hex-char token from two v4 UUIDs (~244 bits of randomness).
create or replace function public.random_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;

-- Sum of numeric values in a jsonb object (used to enforce weights = 100).
create or replace function public.jsonb_values_total(obj jsonb)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select coalesce(sum(value::numeric), 0) from jsonb_each_text(obj);
$$;

-- ---------------------------------------------------------------------------
-- Households & membership
-- ---------------------------------------------------------------------------

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id),
  -- v1: a user belongs to exactly one household.
  unique (user_id)
);

-- SECURITY DEFINER so RLS policies can call them without recursing into
-- household_members' own policies.
create or replace function public.is_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_owner(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  token text not null unique default public.random_token(),
  invited_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null
);
create index invites_household_idx on public.invites (household_id);

-- ---------------------------------------------------------------------------
-- Preferences (one row per household)
-- ---------------------------------------------------------------------------

create table public.preferences (
  household_id uuid primary key references public.households (id) on delete cascade,
  budget_min numeric(10, 2) not null default 30000,
  budget_max numeric(10, 2) not null default 35000,
  down_payment numeric(10, 2) not null default 10000,
  loan_months int not null default 60 check (loan_months between 12 and 96),
  -- Default APR by listing condition (percent, e.g. 6.5 = 6.5%).
  apr_new numeric(5, 3) not null default 4.9 check (apr_new between 0 and 40),
  apr_cpo numeric(5, 3) not null default 5.9 check (apr_cpo between 0 and 40),
  apr_used numeric(5, 3) not null default 6.5 check (apr_used between 0 and 40),
  include_tax_fees boolean not null default false,
  sales_tax_pct numeric(5, 3) not null default 4.15,
  fees numeric(10, 2) not null default 0,
  miles_per_year int not null default 12000 check (miles_per_year >= 0),
  gas_price numeric(5, 2) not null default 3.25 check (gas_price >= 0),
  garage_depth_in numeric(6, 1),
  garage_door_width_in numeric(6, 1),
  garage_door_height_in numeric(6, 1),
  min_walkaround_in numeric(6, 1) not null default 24,
  buy_by_date date,
  excluded_brand_origins text[] not null default '{}',
  -- Household profile for Claude suggestions: kids, ages, driving mix, etc.
  profile jsonb not null default '{}'::jsonb,
  weights jsonb not null default
    '{"cargo":25,"car_seat_access":20,"reliability":15,"price":15,"fuel":10,"city_ease":10,"awd":5}'::jsonb
    check (public.jsonb_values_total(weights) = 100),
  onboarded boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  check (budget_min <= budget_max)
);
create trigger preferences_updated_at before update on public.preferences
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Catalog: vehicles & trims (shared seed rows + household-added rows)
-- ---------------------------------------------------------------------------

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households (id) on delete cascade, -- null = shared catalog
  created_by uuid references auth.users (id) on delete set null,
  make text not null,
  model text not null,
  generation_years text not null default '',
  type text not null default 'suv'
    check (type in ('minivan', 'suv', 'crossover', 'wagon', 'sedan', 'truck', 'other')),
  brand_origin text,
  seats int,
  sliding_doors boolean,
  length_in numeric(6, 1),
  width_in numeric(6, 1),
  height_in numeric(6, 1),
  wheelbase_in numeric(6, 1),
  ground_clearance_in numeric(4, 1),
  cargo_3rd numeric(5, 1),
  cargo_2nd numeric(5, 1),
  cargo_max numeric(5, 1),
  third_row_legroom_in numeric(4, 1),
  hp int,
  mpg_combined numeric(4, 1),
  hybrid_available boolean,
  awd_available boolean,
  towing_lbs int,
  price_low numeric(10, 2),
  price_high numeric(10, 2),
  reliability_note text,
  budget_years text,
  latch_positions int,
  tether_anchors int,
  nhtsa_rollover_stars numeric(2, 1) check (nhtsa_rollover_stars between 1 and 5),
  nhtsa_overall_stars numeric(2, 1) check (nhtsa_overall_stars between 1 and 5),
  specs_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index vehicles_unique_model on public.vehicles
  (lower(make), lower(model), generation_years, household_id) nulls not distinct;
create index vehicles_household_idx on public.vehicles (household_id);
create trigger vehicles_updated_at before update on public.vehicles
  for each row execute function public.set_updated_at();

create table public.trims (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  household_id uuid references public.households (id) on delete cascade, -- null = shared catalog
  created_by uuid references auth.users (id) on delete set null,
  name text not null,
  model_years text not null default '',
  key_features text[] not null default '{}',
  -- Booleans: parking_sensors, backup_camera, rear_camera, intercom,
  -- rear_entertainment, ventilated_seats, heated_wheel, power_liftgate,
  -- moonroof, leather, ... (keys match feature_catalog.feature_key)
  features jsonb not null default '{}'::jsonb,
  price_low numeric(10, 2),
  price_high numeric(10, 2),
  specs_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index trims_unique_name on public.trims
  (vehicle_id, lower(name), model_years, household_id) nulls not distinct;
create index trims_household_idx on public.trims (household_id);
create trigger trims_updated_at before update on public.trims
  for each row execute function public.set_updated_at();

-- A vehicle/trim is visible to a user if it is shared catalog or theirs.
create or replace function public.can_see_vehicle(vid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.vehicles v
    where v.id = vid and (v.household_id is null or public.is_member(v.household_id))
  );
$$;

create or replace function public.can_see_trim(tid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.trims t
    where t.id = tid and (t.household_id is null or public.is_member(t.household_id))
  );
$$;

-- Trims added by a household must hang off a vehicle that household can see.
create or replace function public.check_trim_vehicle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid;
begin
  select household_id into v_household from public.vehicles where id = new.vehicle_id;
  if new.household_id is null and v_household is not null then
    raise exception 'A shared catalog trim cannot belong to a household vehicle';
  end if;
  if v_household is not null and v_household is distinct from new.household_id then
    raise exception 'Trim and vehicle belong to different households';
  end if;
  return new;
end;
$$;
create trigger trims_check_vehicle before insert or update on public.trims
  for each row execute function public.check_trim_vehicle();

-- ---------------------------------------------------------------------------
-- Shortlists (three-stage flow)
-- ---------------------------------------------------------------------------

create table public.shortlist (
  household_id uuid not null references public.households (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  status text not null default 'considering'
    check (status in ('considering', 'test-driven', 'finalist', 'rejected')),
  stage text not null default 'model' check (stage in ('model', 'trim', 'listing')),
  ai_rationale text,
  added_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, vehicle_id)
);
create trigger shortlist_updated_at before update on public.shortlist
  for each row execute function public.set_updated_at();

create table public.trim_shortlist (
  household_id uuid not null references public.households (id) on delete cascade,
  trim_id uuid not null references public.trims (id) on delete cascade,
  status text not null default 'considering'
    check (status in ('considering', 'target', 'rejected')),
  added_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (household_id, trim_id)
);

-- ---------------------------------------------------------------------------
-- Dealers, listings, quotes, contact log
-- ---------------------------------------------------------------------------

create table public.dealer_contacts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  dealership text not null,
  salesperson text,
  phone text,
  email text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, household_id)
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  trim_id uuid references public.trims (id) on delete set null,
  year int check (year between 1980 and 2100),
  trim_label text, -- free-text trim when trim_id is unknown
  miles int check (miles >= 0),
  asking_price numeric(10, 2) check (asking_price >= 0),
  dealer text,
  url text,
  vin text,
  condition text not null default 'used' check (condition in ('new', 'used', 'cpo')),
  accidents_owners text,
  status text not null default 'watching'
    check (status in ('watching', 'contacted', 'test-drive', 'offer', 'passed')),
  apr_override numeric(5, 3) check (apr_override between 0 and 40),
  down_override numeric(10, 2) check (down_override >= 0),
  term_override int check (term_override between 12 and 96),
  dealer_contact_id uuid,
  follow_up_on date,
  added_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id),
  foreign key (dealer_contact_id, household_id)
    references public.dealer_contacts (id, household_id) on delete set null (dealer_contact_id)
);
create index listings_household_idx on public.listings (household_id);
create index listings_vehicle_idx on public.listings (vehicle_id);
create index listings_follow_up_idx on public.listings (household_id, follow_up_on);
create trigger listings_updated_at before update on public.listings
  for each row execute function public.set_updated_at();

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  listing_id uuid not null,
  quoted_on date not null default current_date,
  otd_price numeric(10, 2),
  apr_offered numeric(5, 3),
  includes text,
  expires_on date,
  added_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (listing_id, household_id) references public.listings (id, household_id) on delete cascade
);
create index quotes_listing_idx on public.quotes (listing_id);

create table public.contact_log (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  listing_id uuid not null,
  logged_on date not null default current_date,
  channel text not null check (channel in ('call', 'text', 'email', 'in person')),
  summary text not null,
  author_id uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (listing_id, household_id) references public.listings (id, household_id) on delete cascade
);
create index contact_log_listing_idx on public.contact_log (listing_id);

-- ---------------------------------------------------------------------------
-- Scores & notes
-- ---------------------------------------------------------------------------

create table public.scores (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  criterion text not null,
  score int not null check (score between 1 and 5),
  updated_at timestamptz not null default now(),
  unique (household_id, vehicle_id, user_id, criterion)
);
create trigger scores_updated_at before update on public.scores
  for each row execute function public.set_updated_at();

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  trim_id uuid references public.trims (id) on delete cascade,
  listing_id uuid,
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (listing_id, household_id) references public.listings (id, household_id) on delete cascade
);
create index notes_vehicle_idx on public.notes (household_id, vehicle_id);
create index notes_trim_idx on public.notes (trim_id);
create index notes_listing_idx on public.notes (listing_id);
create trigger notes_updated_at before update on public.notes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Financing
-- ---------------------------------------------------------------------------

create table public.financing_quotes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  lender text not null,
  apr numeric(5, 3) not null check (apr between 0 and 40),
  months int not null check (months between 12 and 96),
  monthly_payment numeric(10, 2),
  notes text,
  added_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Car seats
-- ---------------------------------------------------------------------------

create table public.car_seats (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  type text not null check (type in ('infant', 'convertible', 'booster')),
  width_in numeric(4, 1),
  created_at timestamptz not null default now(),
  unique (id, household_id)
);

create table public.seat_fit_checks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  listing_id uuid not null,
  car_seat_id uuid not null,
  position text not null check (position in
    ('row2_left', 'row2_middle', 'row2_right', 'row3_left', 'row3_middle', 'row3_right')),
  install_method text check (install_method in ('latch', 'seat_belt')),
  result text not null check (result in ('pass', 'tight', 'fail')),
  front_room_ok boolean,
  third_passenger_fit boolean,
  notes text,
  checked_by uuid default auth.uid() references auth.users (id) on delete set null,
  checked_at timestamptz not null default now(),
  foreign key (listing_id, household_id) references public.listings (id, household_id) on delete cascade,
  foreign key (car_seat_id, household_id) references public.car_seats (id, household_id) on delete cascade
);
create index seat_fit_listing_idx on public.seat_fit_checks (listing_id);

-- ---------------------------------------------------------------------------
-- Wishlist (must-have / nice-to-have) — the single source of truth for
-- household must-haves.
-- ---------------------------------------------------------------------------

-- Global, read-only list of preloaded features copied into each household.
create table public.feature_catalog (
  key text primary key,
  name text not null,
  category text not null,
  feature_key text, -- maps to trims.features / vehicles column when one exists
  sort_order int not null
);

create table public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  catalog_key text references public.feature_catalog (key) on delete set null,
  name text not null check (char_length(name) between 1 and 80),
  category text not null default 'Custom',
  tier text not null default 'dont_care' check (tier in ('must_have', 'nice_to_have', 'dont_care')),
  feature_key text,
  notes text,
  sort_order int not null default 0,
  suggested_tier text check (suggested_tier in ('must_have', 'nice_to_have', 'dont_care')),
  suggestion_reason text,
  added_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id),
  unique (household_id, catalog_key)
);
create trigger wishlist_items_updated_at before update on public.wishlist_items
  for each row execute function public.set_updated_at();

create table public.listing_feature_checks (
  household_id uuid not null,
  listing_id uuid not null,
  wishlist_item_id uuid not null,
  has_it boolean not null,
  checked_by uuid default auth.uid() references auth.users (id) on delete set null,
  checked_at timestamptz not null default now(),
  primary key (listing_id, wishlist_item_id),
  foreign key (listing_id, household_id) references public.listings (id, household_id) on delete cascade,
  foreign key (wishlist_item_id, household_id) references public.wishlist_items (id, household_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- AI usage log (per-household rate limiting for Claude routes)
-- ---------------------------------------------------------------------------

create table public.ai_usage (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  route text not null,
  created_at timestamptz not null default now()
);
create index ai_usage_household_time_idx on public.ai_usage (household_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Feature catalog seed (reference data)
-- ---------------------------------------------------------------------------

insert into public.feature_catalog (key, name, category, feature_key, sort_order) values
  ('rear_camera',          'Rear-seat camera (e.g. CabinWatch)',         'Kids & family', 'rear_camera', 10),
  ('intercom',             'Intercom to rear rows',                      'Kids & family', 'intercom', 20),
  ('eight_seats',          '8 seats',                                    'Kids & family', 'eight_seats', 30),
  ('captains_chairs',      '2nd-row captain''s chairs',                  'Kids & family', 'captains_chairs', 40),
  ('sliding_2nd_row',      'Removable / sliding 2nd row',                'Kids & family', 'sliding_2nd_row', 50),
  ('third_row_access',     'Easy 3rd-row access with car seats in',      'Kids & family', null, 60),
  ('latch_3plus',          'LATCH positions (3+)',                       'Kids & family', 'latch_3plus', 70),
  ('rear_sunshades',       'Rear sunshades',                             'Kids & family', 'rear_sunshades', 80),
  ('rear_entertainment',   'Rear entertainment screen',                  'Kids & family', 'rear_entertainment', 90),
  ('rear_climate',         'Rear climate controls',                      'Kids & family', 'rear_climate', 100),
  ('rear_usb',             'Rear USB ports',                             'Kids & family', 'rear_usb', 110),
  ('power_sliding_doors',  'Power sliding doors',                        'Doors & cargo', 'power_sliding_doors', 200),
  ('handsfree_sliding',    'Hands-free sliding doors',                   'Doors & cargo', 'handsfree_sliding_doors', 210),
  ('power_liftgate',       'Power liftgate',                             'Doors & cargo', 'power_liftgate', 220),
  ('handsfree_liftgate',   'Hands-free liftgate',                        'Doors & cargo', 'handsfree_liftgate', 230),
  ('fold_flat_3rd',        'Fold-flat 3rd row',                          'Doors & cargo', 'fold_flat_3rd', 240),
  ('roof_rails',           'Roof rails',                                 'Doors & cargo', 'roof_rails', 250),
  ('built_in_vacuum',      'Built-in vacuum',                            'Doors & cargo', 'built_in_vacuum', 260),
  ('backup_camera',        'Backup camera',                              'Safety & driver assist', 'backup_camera', 300),
  ('camera_360',           '360° camera',                                'Safety & driver assist', 'camera_360', 310),
  ('parking_sensors',      'Front/rear parking sensors',                 'Safety & driver assist', 'parking_sensors', 320),
  ('blind_spot',           'Blind-spot monitoring',                      'Safety & driver assist', 'blind_spot', 330),
  ('rear_cross_traffic',   'Rear cross-traffic alert',                   'Safety & driver assist', 'rear_cross_traffic', 340),
  ('adaptive_cruise',      'Adaptive cruise control',                    'Safety & driver assist', 'adaptive_cruise', 350),
  ('lane_keep',            'Lane-keeping assist',                        'Safety & driver assist', 'lane_keep', 360),
  ('aeb',                  'Automatic emergency braking',                'Safety & driver assist', 'aeb', 370),
  ('rear_seat_reminder',   'Rear-seat reminder',                         'Safety & driver assist', 'rear_seat_reminder', 380),
  ('leather',              'Leather',                                    'Comfort', 'leather', 400),
  ('heated_front',         'Heated front seats',                         'Comfort', 'heated_front', 410),
  ('ventilated_seats',     'Ventilated front seats',                     'Comfort', 'ventilated_seats', 420),
  ('heated_2nd_row',       'Heated 2nd row',                             'Comfort', 'heated_2nd_row', 430),
  ('heated_wheel',         'Heated steering wheel',                      'Comfort', 'heated_wheel', 440),
  ('moonroof',             'Moonroof',                                   'Comfort', 'moonroof', 450),
  ('tri_zone',             'Tri-zone climate',                           'Comfort', 'tri_zone', 460),
  ('memory_seats',         'Power-adjustable seats with memory',         'Comfort', 'memory_seats', 470),
  ('wireless_carplay',     'Wireless Apple CarPlay / Android Auto',      'Tech', 'wireless_carplay', 500),
  ('large_touchscreen',    'Large touchscreen',                          'Tech', 'large_touchscreen', 510),
  ('navigation',           'Built-in navigation',                        'Tech', 'navigation', 520),
  ('premium_audio',        'Premium audio',                              'Tech', 'premium_audio', 530),
  ('wireless_charging',    'Wireless charging',                          'Tech', 'wireless_charging', 540),
  ('hud',                  'Head-up display',                            'Tech', 'hud', 550),
  ('hybrid',               'Hybrid',                                     'Powertrain', 'hybrid', 600),
  ('awd',                  'AWD',                                        'Powertrain', 'awd', 610),
  ('towing',               'Tow hitch / towing package',                 'Powertrain', 'towing', 620),
  ('remote_start',         'Remote start',                               'Powertrain', 'remote_start', 630);

-- ---------------------------------------------------------------------------
-- RPCs: household lifecycle
-- ---------------------------------------------------------------------------

-- Creates a household, makes the caller its owner, creates default
-- preferences and copies the feature catalog into the wishlist.
create or replace function public.create_household(p_name text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_hid uuid;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if exists (select 1 from public.household_members where user_id = v_uid) then
    raise exception 'You already belong to a household' using errcode = 'P0001';
  end if;

  insert into public.households (name, created_by)
    values (trim(p_name), v_uid)
    returning id into v_hid;

  insert into public.household_members (household_id, user_id, display_name, role)
    values (v_hid, v_uid, trim(p_display_name), 'owner');

  insert into public.preferences (household_id, updated_by) values (v_hid, v_uid);

  insert into public.wishlist_items (household_id, catalog_key, name, category, feature_key, sort_order, added_by)
    select v_hid, fc.key, fc.name, fc.category, fc.feature_key, fc.sort_order, null
    from public.feature_catalog fc;

  return v_hid;
end;
$$;

-- Returns minimal, non-sensitive info about an invite for the join page.
create or replace function public.get_invite(p_token text)
returns table (household_name text, invited_by_name text, email text, expired boolean, accepted boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select h.name,
         m.display_name,
         i.email,
         i.expires_at < now(),
         i.accepted_at is not null
  from public.invites i
  join public.households h on h.id = i.household_id
  left join public.household_members m on m.household_id = i.household_id and m.user_id = i.invited_by
  where i.token = p_token
    and auth.uid() is not null;
$$;

-- Joins the caller to the invite's household. The signed-in email must match
-- the invited email so a forwarded link can't be used by someone else.
create or replace function public.accept_invite(p_token text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_inv public.invites%rowtype;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  select * into v_inv from public.invites where token = p_token for update;
  if not found then
    raise exception 'Invite not found' using errcode = 'P0002';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'This invite has already been used' using errcode = 'P0001';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'This invite has expired' using errcode = 'P0001';
  end if;

  select email into v_email from auth.users where id = v_uid;
  if lower(coalesce(v_email, '')) <> lower(v_inv.email) then
    raise exception 'This invite was sent to a different email address' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.household_members where user_id = v_uid) then
    raise exception 'You already belong to a household' using errcode = 'P0001';
  end if;

  insert into public.household_members (household_id, user_id, display_name, role)
    values (v_inv.household_id, v_uid, trim(p_display_name), 'member');

  update public.invites set accepted_at = now(), accepted_by = v_uid where id = v_inv.id;

  return v_inv.household_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.invites enable row level security;
alter table public.preferences enable row level security;
alter table public.vehicles enable row level security;
alter table public.trims enable row level security;
alter table public.shortlist enable row level security;
alter table public.trim_shortlist enable row level security;
alter table public.dealer_contacts enable row level security;
alter table public.listings enable row level security;
alter table public.quotes enable row level security;
alter table public.contact_log enable row level security;
alter table public.scores enable row level security;
alter table public.notes enable row level security;
alter table public.financing_quotes enable row level security;
alter table public.car_seats enable row level security;
alter table public.seat_fit_checks enable row level security;
alter table public.feature_catalog enable row level security;
alter table public.wishlist_items enable row level security;
alter table public.listing_feature_checks enable row level security;
alter table public.ai_usage enable row level security;

-- households: members read; owner renames. Created only via create_household().
create policy households_select on public.households for select to authenticated
  using (public.is_member(id));
create policy households_update on public.households for update to authenticated
  using (public.is_owner(id)) with check (public.is_owner(id));

-- household_members: members see each other. Rows are created only by RPCs.
create policy members_select on public.household_members for select to authenticated
  using (public.is_member(household_id));
-- Members can change their own display name (role changes blocked by trigger below).
create policy members_update_self on public.household_members for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- A member may leave; the owner may remove other members.
create policy members_delete on public.household_members for delete to authenticated
  using (
    (user_id = (select auth.uid()) and role = 'member')
    or (public.is_owner(household_id) and user_id <> (select auth.uid()))
  );

create or replace function public.prevent_member_escalation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role is distinct from old.role
     or new.household_id is distinct from old.household_id
     or new.user_id is distinct from old.user_id then
    raise exception 'Only display_name can be changed';
  end if;
  return new;
end;
$$;
create trigger household_members_no_escalation before update on public.household_members
  for each row execute function public.prevent_member_escalation();

-- invites: members can see; owner creates and revokes.
create policy invites_select on public.invites for select to authenticated
  using (public.is_member(household_id));
create policy invites_insert on public.invites for insert to authenticated
  with check (public.is_owner(household_id) and invited_by = (select auth.uid()) and accepted_at is null);
create policy invites_delete on public.invites for delete to authenticated
  using (public.is_owner(household_id));

-- preferences: any member reads and edits.
create policy preferences_select on public.preferences for select to authenticated
  using (public.is_member(household_id));
create policy preferences_update on public.preferences for update to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

-- vehicles/trims: shared catalog readable by all; household rows by members.
create policy vehicles_select on public.vehicles for select to authenticated
  using (household_id is null or public.is_member(household_id));
create policy vehicles_insert on public.vehicles for insert to authenticated
  with check (household_id is not null and public.is_member(household_id));
create policy vehicles_update on public.vehicles for update to authenticated
  using (household_id is not null and public.is_member(household_id))
  with check (household_id is not null and public.is_member(household_id));
create policy vehicles_delete on public.vehicles for delete to authenticated
  using (household_id is not null and public.is_member(household_id));

create policy trims_select on public.trims for select to authenticated
  using (household_id is null or public.is_member(household_id));
create policy trims_insert on public.trims for insert to authenticated
  with check (household_id is not null and public.is_member(household_id));
create policy trims_update on public.trims for update to authenticated
  using (household_id is not null and public.is_member(household_id))
  with check (household_id is not null and public.is_member(household_id));
create policy trims_delete on public.trims for delete to authenticated
  using (household_id is not null and public.is_member(household_id));

create policy feature_catalog_select on public.feature_catalog for select to authenticated
  using (true);

-- Household-owned tables that reference a vehicle/trim: member + visibility.
create policy shortlist_all on public.shortlist for all to authenticated
  using (public.is_member(household_id))
  with check (public.is_member(household_id) and public.can_see_vehicle(vehicle_id));

create policy trim_shortlist_all on public.trim_shortlist for all to authenticated
  using (public.is_member(household_id))
  with check (public.is_member(household_id) and public.can_see_trim(trim_id));

create policy listings_all on public.listings for all to authenticated
  using (public.is_member(household_id))
  with check (
    public.is_member(household_id)
    and public.can_see_vehicle(vehicle_id)
    and (trim_id is null or public.can_see_trim(trim_id))
  );

-- Simple household-scoped tables.
create policy dealer_contacts_all on public.dealer_contacts for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy quotes_all on public.quotes for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy financing_quotes_all on public.financing_quotes for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy car_seats_all on public.car_seats for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy seat_fit_checks_all on public.seat_fit_checks for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy wishlist_items_all on public.wishlist_items for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy listing_feature_checks_all on public.listing_feature_checks for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

-- contact_log: household reads/adds; author edits/deletes own.
create policy contact_log_select on public.contact_log for select to authenticated
  using (public.is_member(household_id));
create policy contact_log_insert on public.contact_log for insert to authenticated
  with check (public.is_member(household_id) and author_id = (select auth.uid()));
create policy contact_log_update on public.contact_log for update to authenticated
  using (author_id = (select auth.uid()) and public.is_member(household_id))
  with check (author_id = (select auth.uid()) and public.is_member(household_id));
create policy contact_log_delete on public.contact_log for delete to authenticated
  using (author_id = (select auth.uid()) and public.is_member(household_id));

-- scores: household reads; each member writes only their own scores.
create policy scores_select on public.scores for select to authenticated
  using (public.is_member(household_id));
create policy scores_insert on public.scores for insert to authenticated
  with check (public.is_member(household_id) and user_id = (select auth.uid())
              and public.can_see_vehicle(vehicle_id));
create policy scores_update on public.scores for update to authenticated
  using (user_id = (select auth.uid()) and public.is_member(household_id))
  with check (user_id = (select auth.uid()) and public.is_member(household_id));
create policy scores_delete on public.scores for delete to authenticated
  using (user_id = (select auth.uid()) and public.is_member(household_id));

-- notes: household reads/adds; author edits/deletes own.
create policy notes_select on public.notes for select to authenticated
  using (public.is_member(household_id));
create policy notes_insert on public.notes for insert to authenticated
  with check (
    public.is_member(household_id) and author_id = (select auth.uid())
    and public.can_see_vehicle(vehicle_id)
    and (trim_id is null or public.can_see_trim(trim_id))
  );
create policy notes_update on public.notes for update to authenticated
  using (author_id = (select auth.uid()) and public.is_member(household_id))
  with check (author_id = (select auth.uid()) and public.is_member(household_id));
create policy notes_delete on public.notes for delete to authenticated
  using (author_id = (select auth.uid()) and public.is_member(household_id));

-- ai_usage: members can read their household's usage; writes happen server-side.
create policy ai_usage_select on public.ai_usage for select to authenticated
  using (public.is_member(household_id));

-- ---------------------------------------------------------------------------
-- Grants (explicit, so the Data API exposure doesn't depend on defaults)
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from public, anon;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

grant execute on function public.create_household(text, text) to authenticated;
grant execute on function public.get_invite(text) to authenticated;
grant execute on function public.accept_invite(text, text) to authenticated;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.is_owner(uuid) to authenticated;
grant execute on function public.can_see_vehicle(uuid) to authenticated;
grant execute on function public.can_see_trim(uuid) to authenticated;
grant execute on function public.jsonb_values_total(jsonb) to authenticated;
grant execute on function public.random_token() to authenticated;
grant execute on all functions in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Realtime: tables whose changes sync live between household members.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.notes, public.scores, public.wishlist_items, public.listings,
      public.contact_log, public.quotes, public.seat_fit_checks,
      public.shortlist, public.trim_shortlist, public.preferences;
  end if;
end;
$$;
