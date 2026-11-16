/** Pure calculations shared by the compare and scores pages. No I/O, so they're unit-tested. */

export const CRITERIA = [
  { key: "cargo", label: "Cargo with 3rd row up", short: "Cargo", hint: "Road-trip luggage room with every seat in use" },
  { key: "car_seat_access", label: "Car-seat install & 3rd-row access", short: "Car seats", hint: "Installing seats and climbing past them" },
  { key: "reliability", label: "Reliability & resale", short: "Reliability", hint: "Repair costs now, trade-in value later" },
  { key: "price", label: "Price / value within budget", short: "Price", hint: "How much car you get for the money" },
  { key: "fuel", label: "Fuel cost", short: "Fuel", hint: "Yearly gas spend at your mileage" },
  { key: "city_ease", label: "City driving & parking ease", short: "City", hint: "Tight lots, garages and visibility" },
  { key: "awd", label: "AWD / winter capability", short: "AWD", hint: "Snow and bad-weather confidence" },
] as const;

export type CriterionKey = (typeof CRITERIA)[number]["key"];

/**
 * Test-drive scorecard. Stored in `scores` like the weighted criteria (keys prefixed `td_`),
 * but kept out of the weighted score: it's what you felt, shown next to it.
 */
export const TEST_DRIVE = [
  {
    title: "The basics",
    items: [
      { key: "td_seat_install", label: "Car-seat install (2nd row)" },
      { key: "td_third_row_access", label: "3rd-row access with car seats in" },
      { key: "td_cargo", label: "Cargo with 3rd row up (stroller + luggage)" },
      { key: "td_ride_noise", label: "Ride and noise on the highway" },
      { key: "td_city", label: "Parking and city ease" },
      { key: "td_infotainment", label: "Infotainment / CarPlay" },
    ],
  },
  {
    title: "Driving feel & handling",
    items: [
      { key: "td_stability", label: "Stability in lane changes", hint: "Planted, or tippy and leaning?" },
      { key: "td_cornering", label: "Cornering confidence", hint: "A turn at normal speed" },
      { key: "td_steering", label: "Steering feel", hint: "Precise vs vague; effort in parking lots" },
      { key: "td_braking", label: "Braking confidence", hint: "Smooth, stops straight" },
      { key: "td_visibility", label: "Visibility", hint: "Blind spots, over the hood, rear view" },
      { key: "td_enjoyment", label: "Enjoyment", hint: "Easy and pleasant to drive?" },
    ],
  },
  { title: "Overall", items: [{ key: "td_verdict", label: "Overall verdict" }] },
] as const;

export const TEST_DRIVE_KEYS: string[] = TEST_DRIVE.flatMap((g) => g.items.map((i) => i.key));

/** Mean of the given criteria's (already member-averaged) scores, or null if none are scored. */
export function meanOf(avg: Partial<Record<string, number>>, keys: string[]): number | null {
  const vals = keys.map((k) => avg[k]).filter((x): x is number => x != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}
export type Weights = Partial<Record<string, number>>;

/** Standard amortized monthly payment. `aprPct` is a percent (6.5 = 6.5%). */
export function monthlyPayment(principal: number, aprPct: number, months: number): number {
  if (principal <= 0 || months <= 0) return 0;
  const r = aprPct / 100 / 12;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

export type Financing = {
  down_payment: number;
  loan_months: number;
  apr_used: number;
  include_tax_fees: boolean;
  sales_tax_pct: number;
  fees: number;
};

/** Amount financed for a car at `price`, after tax/fees (if enabled) and the down payment. */
export function amountFinanced(price: number, f: Financing): number {
  const total = f.include_tax_fees ? price * (1 + f.sales_tax_pct / 100) + f.fees : price;
  return Math.max(0, total - f.down_payment);
}

/** Yearly fuel cost, or null when MPG is unknown. */
export function annualFuelCost(milesPerYear: number, mpg: number | null, gasPrice: number): number | null {
  if (!mpg || mpg <= 0) return null;
  return (milesPerYear / mpg) * gasPrice;
}

export type Garage = {
  garage_depth_in: number | null;
  garage_door_width_in: number | null;
  garage_door_height_in: number | null;
  min_walkaround_in: number;
};
export type Size = { length_in: number | null; width_in: number | null; height_in: number | null };
export type Fit = {
  status: "fits" | "tight" | "no" | "unknown";
  depthLeft: number | null;
  widthMargin: number | null;
  heightMargin: number | null;
};

/**
 * Garage fit, matching the spreadsheet: "tight" means it physically fits but leaves less
 * walk-around room than the minimum, under 12 in of door-width margin, or under 3 in of
 * door-height margin. Widths exclude mirrors.
 */
export function garageFit(g: Garage, v: Size): Fit {
  const sub = (a: number | null, b: number | null) => (a == null || b == null ? null : round1(a - b));
  const depthLeft = sub(g.garage_depth_in, v.length_in);
  const widthMargin = sub(g.garage_door_width_in, v.width_in);
  const heightMargin = sub(g.garage_door_height_in, v.height_in);
  const known = [depthLeft, widthMargin, heightMargin].filter((x): x is number => x != null);
  let status: Fit["status"];
  if (known.length === 0) status = "unknown";
  else if (known.some((x) => x <= 0)) status = "no";
  else if (known.length < 3) status = "unknown";
  else if (depthLeft! < g.min_walkaround_in || widthMargin! < 12 || heightMargin! < 3) status = "tight";
  else status = "fits";
  return { status, depthLeft, widthMargin, heightMargin };
}

export type ScoreRow = { vehicle_id: string; user_id: string; criterion: string; score: number };

/** Each criterion's score for one vehicle, averaged across the household members who scored it. */
export function averageScores(rows: ScoreRow[], vehicleId: string): Partial<Record<string, number>> {
  const sums: Record<string, { total: number; n: number }> = {};
  for (const r of rows) {
    if (r.vehicle_id !== vehicleId) continue;
    const s = (sums[r.criterion] ??= { total: 0, n: 0 });
    s.total += r.score;
    s.n += 1;
  }
  return Object.fromEntries(Object.entries(sums).map(([k, s]) => [k, s.total / s.n]));
}

/**
 * Weighted score out of 5. Criteria nobody has scored yet are left out and the remaining
 * weights are scaled up, so `complete` says whether every weighted criterion was scored.
 */
export function weightedScore(avg: Partial<Record<string, number>>, weights: Weights) {
  let sum = 0;
  let used = 0;
  let total = 0;
  for (const [k, w] of Object.entries(weights)) {
    if (!w) continue;
    total += w;
    const s = avg[k];
    if (s == null) continue;
    sum += s * w;
    used += w;
  }
  return { score: used ? sum / used : null, complete: used === total && total > 0 };
}

/** Competition ranking ("1, 1, 3"), highest first; nulls rank last and get no rank. */
export function rank(values: (number | null)[]): (number | null)[] {
  const r = values.map((v) => (v == null ? null : round2(v)));
  return r.map((v) => (v == null ? null : 1 + r.filter((o) => o != null && o > v).length));
}

/** Indexes of the best value(s) in a row, or [] when fewer than two values are known. */
export function bestIndexes(values: (number | null)[], better: "high" | "low"): number[] {
  const known = values.filter((v): v is number => v != null);
  if (known.length < 2) return [];
  const best = better === "high" ? Math.max(...known) : Math.min(...known);
  if (known.every((v) => v === best)) return [];
  return values.flatMap((v, i) => (v === best ? [i] : []));
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
