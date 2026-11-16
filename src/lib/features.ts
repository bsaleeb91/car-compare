/**
 * Does a car have a wishlist feature? Only a few features can be read from model-level specs;
 * the rest vary by trim, so they report "trim" (check the trim or the listing) instead of guessing.
 */

export type Tier = "must_have" | "nice_to_have" | "dont_care";
export type FeatureStatus = "yes" | "no" | "trim";
export type WishItem = { id: string; name: string; category: string; tier: Tier; feature_key: string | null; catalog_key: string | null };

type Specs = {
  seats: number | null;
  sliding_doors: boolean | null;
  hybrid_available: boolean | null;
  awd_available: boolean | null;
  towing_lbs: number | null;
  latch_positions?: number | null;
};

const bool = (b: boolean | null | undefined): FeatureStatus => (b == null ? "trim" : b ? "yes" : "no");

export function featureStatus(v: Specs, featureKey: string | null): FeatureStatus {
  const noThirdRow = v.seats != null && v.seats <= 5;
  switch (featureKey) {
    case "eight_seats":
      return v.seats == null ? "trim" : v.seats >= 8 ? "yes" : "no";
    case "hybrid":
      return bool(v.hybrid_available);
    case "awd":
      return bool(v.awd_available);
    case "towing":
      return v.towing_lbs == null ? "trim" : v.towing_lbs > 0 ? "yes" : "no";
    case "latch_3plus":
      return v.latch_positions == null ? "trim" : v.latch_positions >= 3 ? "yes" : "no";
    // Without sliding doors these can't exist; with them, power/hands-free depends on trim.
    case "power_sliding_doors":
    case "handsfree_sliding_doors":
      return v.sliding_doors === false ? "no" : "trim";
    // Third-row features need a third row.
    case "fold_flat_3rd":
    case "captains_chairs":
      return noThirdRow ? "no" : "trim";
    default:
      return "trim";
  }
}

export type FeatureMatch = {
  missingMust: WishItem[];
  mustToCheck: WishItem[];
  mustTotal: number;
  niceHave: number;
  niceToCheck: number;
  niceTotal: number;
  statuses: Record<string, FeatureStatus>;
};

/** How a car stacks up against the household's must-haves and nice-to-haves. */
export function matchFeatures(v: Specs, items: WishItem[]): FeatureMatch {
  const statuses: Record<string, FeatureStatus> = {};
  const must = items.filter((i) => i.tier === "must_have");
  const nice = items.filter((i) => i.tier === "nice_to_have");
  for (const i of [...must, ...nice]) statuses[i.id] = featureStatus(v, i.feature_key);
  return {
    missingMust: must.filter((i) => statuses[i.id] === "no"),
    mustToCheck: must.filter((i) => statuses[i.id] === "trim"),
    mustTotal: must.length,
    niceHave: nice.filter((i) => statuses[i.id] === "yes").length,
    niceToCheck: nice.filter((i) => statuses[i.id] === "trim").length,
    niceTotal: nice.length,
    statuses,
  };
}
