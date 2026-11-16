import "server-only";
import type { WishItem } from "@/lib/features";
import { createClient } from "@/lib/supabase/server";
import { TEST_DRIVE_KEYS, averageScores, meanOf, rank, weightedScore, type ScoreRow, type Weights } from "@/lib/calc";

export type Vehicle = {
  id: string;
  household_id: string | null;
  make: string;
  model: string;
  generation_years: string;
  type: string;
  brand_origin: string | null;
  seats: number | null;
  sliding_doors: boolean | null;
  length_in: number | null;
  width_in: number | null;
  height_in: number | null;
  wheelbase_in: number | null;
  ground_clearance_in: number | null;
  cargo_3rd: number | null;
  cargo_2nd: number | null;
  cargo_max: number | null;
  third_row_legroom_in: number | null;
  hp: number | null;
  mpg_combined: number | null;
  hybrid_available: boolean | null;
  awd_available: boolean | null;
  towing_lbs: number | null;
  price_low: number | null;
  price_high: number | null;
  reliability_note: string | null;
  budget_years: string | null;
  latch_positions: number | null;
  nhtsa_rollover_stars: number | null;
  nhtsa_overall_stars: number | null;
  specs_verified: boolean;
};

export type Preferences = {
  household_id: string;
  budget_min: number;
  budget_max: number;
  down_payment: number;
  loan_months: number;
  apr_new: number;
  apr_cpo: number;
  apr_used: number;
  include_tax_fees: boolean;
  sales_tax_pct: number;
  fees: number;
  miles_per_year: number;
  gas_price: number;
  garage_depth_in: number | null;
  garage_door_width_in: number | null;
  garage_door_height_in: number | null;
  min_walkaround_in: number;
  profile: { current_vehicle_id?: string } & Record<string, unknown>;
  weights: Weights;
};

/** Postgres numerics arrive as strings or numbers depending on size; normalize them. */
function nums<T extends Record<string, unknown>>(row: T, keys: string[]): T {
  const out: Record<string, unknown> = { ...row };
  for (const k of keys) if (out[k] != null) out[k] = Number(out[k]);
  return out as T;
}
const VEHICLE_NUMS = [
  "seats", "length_in", "width_in", "height_in", "wheelbase_in", "ground_clearance_in", "cargo_3rd", "cargo_2nd",
  "cargo_max", "third_row_legroom_in", "hp", "mpg_combined", "towing_lbs", "price_low", "price_high",
  "nhtsa_rollover_stars", "nhtsa_overall_stars", "latch_positions",
];
const PREF_NUMS = [
  "budget_min", "budget_max", "down_payment", "loan_months", "apr_new", "apr_cpo", "apr_used", "sales_tax_pct", "fees",
  "miles_per_year", "gas_price", "garage_depth_in", "garage_door_width_in", "garage_door_height_in", "min_walkaround_in",
];

export async function getPreferences(householdId: string): Promise<Preferences> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("preferences").select("*").eq("household_id", householdId).single();
  if (error) throw error;
  return nums(data as Preferences, PREF_NUMS);
}

/** The household's feature wishlist, in display order. */
export async function getWishlist(householdId: string): Promise<WishItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wishlist_items")
    .select("id, name, category, tier, feature_key, catalog_key")
    .eq("household_id", householdId)
    .order("sort_order")
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as WishItem[];
}

export type Ranked = {
  vehicle: Vehicle;
  avg: Partial<Record<string, number>>;
  score: number | null;
  complete: boolean;
  rank: number | null;
  /** Mean test-drive score across members and scorecard items, or null before any test drive. */
  testDrive: number | null;
};

/**
 * Everything the compare and scores pages need: preferences, the household's shortlisted
 * vehicles (not rejected), its current car if set, every member's scores and the ranking.
 */
export async function getComparison(householdId: string) {
  const supabase = await createClient();
  const prefs = await getPreferences(householdId);
  const [shortlist, scores, members, wishlist] = await Promise.all([
    supabase
      .from("shortlist")
      .select("status, vehicles(*)")
      .eq("household_id", householdId),
    supabase.from("scores").select("vehicle_id, user_id, criterion, score").eq("household_id", householdId),
    supabase.from("household_members").select("user_id, display_name").eq("household_id", householdId).order("joined_at"),
    getWishlist(householdId),
  ]);
  for (const r of [shortlist, scores, members]) if (r.error) throw r.error;

  const byName = (a: Vehicle, b: Vehicle) =>
    a.type.localeCompare(b.type) || a.make.localeCompare(b.make) || a.model.localeCompare(b.model);
  const all = (shortlist.data ?? []).map((s) => ({
    status: s.status as string,
    vehicle: nums(s.vehicles as unknown as Vehicle, VEHICLE_NUMS),
  }));
  // "Removed" cars stay in the shortlist as rejected, so their scores survive and they can come back.
  const vehicles = all.filter((s) => s.status !== "rejected").map((s) => s.vehicle).sort(byName);
  const removed = all.filter((s) => s.status === "rejected").map((s) => s.vehicle).sort(byName);

  let current: Vehicle | null = null;
  if (prefs.profile.current_vehicle_id) {
    const { data } = await supabase.from("vehicles").select("*").eq("id", prefs.profile.current_vehicle_id).maybeSingle();
    if (data) current = nums(data as Vehicle, VEHICLE_NUMS);
  }

  const scoreRows = (scores.data ?? []) as ScoreRow[];
  const results = vehicles.map((vehicle) => {
    const avg = averageScores(scoreRows, vehicle.id);
    return { vehicle, avg, ...weightedScore(avg, prefs.weights), testDrive: meanOf(avg, TEST_DRIVE_KEYS) };
  });
  const ranks = rank(results.map((r) => r.score));
  const ranked: Ranked[] = results.map((r, i) => ({ ...r, rank: ranks[i] }));

  return { prefs, vehicles, removed, current, scoreRows, ranked, members: members.data ?? [], wishlist };
}

export const vehicleName = (v: Pick<Vehicle, "make" | "model">) => `${v.make} ${v.model}`;
