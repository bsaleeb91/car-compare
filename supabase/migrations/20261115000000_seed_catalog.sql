-- Shared starter catalog: 8 family vehicles (3 minivans, 5 three-row SUVs).
-- household_id is null, so every household can see these; only migrations can change them.
-- Figures are manufacturer specs for the current generation of each model, several of them
-- approximate, so specs_verified is false: confirm on the window sticker. Cargo figures are
-- each brand's own measurement and aren't directly comparable across brands. Used prices are
-- asking prices seen in November 2026, not transaction prices; budget_years are the model
-- years that fell in a $30-35k used budget then.

insert into car_compare.vehicles (
  make, model, generation_years, type, brand_origin, seats, sliding_doors,
  length_in, width_in, height_in, wheelbase_in, ground_clearance_in,
  cargo_3rd, cargo_2nd, cargo_max, third_row_legroom_in, hp, mpg_combined,
  hybrid_available, awd_available, towing_lbs, price_low, price_high,
  reliability_note, budget_years, specs_verified
) values
  ('Honda', 'Odyssey', '', 'minivan', 'Japan', 8, true, 205.2, 78.5, 69.6, 118.1, 4.4, 38.6, 89.2, 155.8, 38.1, 280, 22, false, false, 3000, 30000, 38000, 'Above average', '2022–2024', false),
  ('Toyota', 'Sienna', '', 'minivan', 'Japan', 8, true, 203.7, 78.5, 68.5, 120.5, 6.1, 33.5, 75.2, 101, 38.7, 245, 36, true, true, 3500, 28000, 39000, 'Best in class. Hybrid-only; MPG is the hybrid figure.', '2021–2022', false),
  ('Kia', 'Carnival', '', 'minivan', 'Korea', 8, true, 203, 78.5, 68.5, 121.7, 6.8, 40.2, 86.9, 145.1, 35.6, 290, 21, false, false, 3500, 27000, 40000, 'Good, newer. Hybrid only on 2025+ models.', '2023–2024', false),
  ('Honda', 'Pilot', '', 'suv', 'Japan', 8, false, 199.9, 78.5, 71, 113.8, 7.3, 18.6, 48.5, 113.7, 32.5, 285, 21, false, true, 5000, 31000, 38000, 'Above average', '2023–2024', false),
  ('Toyota', 'Highlander', '', 'suv', 'Japan', 8, false, 194.9, 76, 68.1, 112.2, 8, 16, 48.4, 84.3, 27.7, 265, 25, true, true, 5000, 30000, 38000, 'Excellent', '2022–2023', false),
  ('Toyota', 'Grand Highlander', '', 'suv', 'Japan', 8, false, 201.4, 78.3, 70.1, 116.1, 8, 20.6, 57.9, 97.5, 33.5, 265, 24, true, true, 5000, 40000, 47000, 'Excellent, newer', '2024 (stretch)', false),
  ('Toyota', '4Runner', '2010–2024', 'suv', 'Japan', 7, false, 190.2, 75.8, 71.5, 109.8, 9, 9, 46.3, 88.8, 29, 270, 17, false, true, 5000, 30000, 37000, 'Excellent', '2021–2023', false),
  ('VW', 'Atlas', '', 'suv', 'Germany', 7, false, 200.7, 78.3, 70.4, 117.3, 8, 20.6, 55.5, 96.8, 33.7, 269, 22, false, true, 5000, 27000, 33000, 'Below average', '2022–2024', false);
