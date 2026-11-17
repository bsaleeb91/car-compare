-- Shared starter trims for the Honda Odyssey, 2022-2024 (the spec's worked example).
-- household_id is null, so every household can see them; only migrations can change them.
-- Feature flags follow the spec (Touring adds parking sensors, rear-seat camera, intercom and
-- rear entertainment; every trim has a backup camera) plus leather, which is standard from
-- EX-L up. A feature missing from `features` means "not recorded", and the app then falls back
-- to "check the trim". Used prices are rough asking ranges seen in November 2026, not
-- transaction prices. Everything here is unverified: confirm on the window sticker.

insert into car_compare.trims (vehicle_id, name, model_years, key_features, features, price_low, price_high, specs_verified)
select v.id, t.name, t.model_years, t.key_features, t.features::jsonb, t.price_low, t.price_high, false
from car_compare.vehicles v
cross join (values
  ('LX', '2022', array['Base trim', 'Backup camera']::text[],
    '{"backup_camera": true, "parking_sensors": false, "rear_camera": false, "intercom": false, "rear_entertainment": false, "leather": false}', 27000, 31000),
  ('EX', '2022–2024', array['Backup camera']::text[],
    '{"backup_camera": true, "parking_sensors": false, "rear_camera": false, "intercom": false, "rear_entertainment": false, "leather": false}', 29000, 33000),
  ('EX-L', '2022–2024', array['Leather', 'Backup camera']::text[],
    '{"backup_camera": true, "parking_sensors": false, "rear_camera": false, "intercom": false, "rear_entertainment": false, "leather": true}', 31000, 36000),
  ('Sport', '2023–2024', array['Sport styling', 'Backup camera']::text[],
    '{"backup_camera": true, "parking_sensors": false, "rear_camera": false, "intercom": false, "rear_entertainment": false}', 33000, 37000),
  ('Touring', '2022–2024', array['Front and rear parking sensors', 'Rear-seat camera', 'Intercom', 'Rear entertainment', 'Leather']::text[],
    '{"backup_camera": true, "parking_sensors": true, "rear_camera": true, "intercom": true, "rear_entertainment": true, "leather": true}', 35000, 40000),
  ('Elite', '2022–2024', array['Everything on Touring', 'Top trim']::text[],
    '{"backup_camera": true, "parking_sensors": true, "rear_camera": true, "intercom": true, "rear_entertainment": true, "leather": true}', 38000, 43000)
) as t(name, model_years, key_features, features, price_low, price_high)
where v.household_id is null and v.make = 'Honda' and v.model = 'Odyssey'
on conflict do nothing;
