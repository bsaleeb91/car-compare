/** Car-seat fit: seat positions, results and roll-ups. Pure, so it's unit-tested. */

export const POSITIONS = [
  { key: "row2_left", row: 2, label: "2nd row, left" },
  { key: "row2_middle", row: 2, label: "2nd row, middle" },
  { key: "row2_right", row: 2, label: "2nd row, right" },
  { key: "row3_left", row: 3, label: "3rd row, left" },
  { key: "row3_middle", row: 3, label: "3rd row, middle" },
  { key: "row3_right", row: 3, label: "3rd row, right" },
] as const;
export type PositionKey = (typeof POSITIONS)[number]["key"];

export const RESULTS = [
  { key: "pass", label: "Fits", cls: "bg-best text-best-foreground", mark: "✓" },
  { key: "tight", label: "Tight", cls: "bg-amber-soft text-amber", mark: "~" },
  { key: "fail", label: "Doesn't fit", cls: "bg-coral-soft text-coral", mark: "✕" },
] as const;
export type Result = (typeof RESULTS)[number]["key"];

export type SeatType = "infant" | "convertible" | "booster";
export const SEAT_TYPES: { key: SeatType; label: string }[] = [
  { key: "infant", label: "Infant" },
  { key: "convertible", label: "Convertible" },
  { key: "booster", label: "Booster" },
];

export type FitCheck = {
  id: string;
  car_seat_id: string;
  position: PositionKey;
  install_method: "latch" | "seat_belt" | null;
  result: Result;
  front_room_ok: boolean | null;
  third_passenger_fit: boolean | null;
  notes: string | null;
  checked_at: string;
};

const SEVERITY: Record<Result, number> = { pass: 0, tight: 1, fail: 2 };

/** The worst result among the given ones (fail beats tight beats pass), or null when there are none. */
export function worstResult(results: Result[]): Result | null {
  if (results.length === 0) return null;
  return results.reduce((w, r) => (SEVERITY[r] > SEVERITY[w] ? r : w));
}

/**
 * For each seat position, the most recent check per car seat (so re-testing replaces an old result
 * instead of piling up), plus the worst of those as the position's overall result.
 */
export function positionResults(checks: FitCheck[]) {
  const latest = new Map<string, FitCheck>();
  for (const c of checks) {
    const k = `${c.position}:${c.car_seat_id}`;
    const prev = latest.get(k);
    if (!prev || c.checked_at > prev.checked_at) latest.set(k, c);
  }
  const out = {} as Record<PositionKey, { checks: FitCheck[]; worst: Result | null }>;
  for (const p of POSITIONS) {
    const list = [...latest.values()].filter((c) => c.position === p.key);
    out[p.key] = { checks: list, worst: worstResult(list.map((c) => c.result)) };
  }
  return out;
}

/** Count of positions that fit, are tight or fail, using each position's worst result. */
export function fitSummary(checks: { listing_id: string; car_seat_id: string; position: PositionKey; result: Result; checked_at: string }[]) {
  const byListing = new Map<string, typeof checks>();
  for (const c of checks) byListing.set(c.listing_id, [...(byListing.get(c.listing_id) ?? []), c]);
  const out: Record<string, { pass: number; tight: number; fail: number; tested: number }> = {};
  for (const [id, list] of byListing) {
    const pr = positionResults(list as unknown as FitCheck[]);
    const s = { pass: 0, tight: 0, fail: 0, tested: 0 };
    for (const p of POSITIONS) {
      const w = pr[p.key].worst;
      if (w) {
        s[w] += 1;
        s.tested += 1;
      }
    }
    out[id] = s;
  }
  return out;
}

/** "2 fit, 1 tight" style line for a roll-up, or null when nothing's been tested. */
export function summaryText(s: { pass: number; tight: number; fail: number } | undefined): string | null {
  if (!s) return null;
  const parts = [s.pass ? `${s.pass} fit` : null, s.tight ? `${s.tight} tight` : null, s.fail ? `${s.fail} fail` : null].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/** Whether to show the 3rd row on the seat map: only for vehicles that seat seven or more (or when we don't know). */
export const hasThirdRow = (seats: number | null | undefined) => seats == null || seats >= 7;
