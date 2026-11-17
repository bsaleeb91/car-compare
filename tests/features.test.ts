import { describe, expect, it } from "vitest";
import { featureStatus, matchFeatures, type WishItem } from "@/lib/features";

const minivan = { seats: 8, sliding_doors: true, hybrid_available: false, awd_available: false, towing_lbs: 3500 };
const suv5 = { seats: 5, sliding_doors: false, hybrid_available: true, awd_available: true, towing_lbs: 2000 };
const item = (id: string, feature_key: string | null, tier: WishItem["tier"]): WishItem => ({
  id,
  name: id,
  category: "x",
  tier,
  feature_key,
  catalog_key: feature_key,
});

describe("featureStatus", () => {
  it("reads model-level specs", () => {
    expect(featureStatus(minivan, "eight_seats")).toBe("yes");
    expect(featureStatus(suv5, "eight_seats")).toBe("no");
    expect(featureStatus(minivan, "awd")).toBe("no");
    expect(featureStatus(suv5, "hybrid")).toBe("yes");
    expect(featureStatus({ ...minivan, hybrid_available: null }, "hybrid")).toBe("trim");
  });

  it("rules out features the body style can't have, and defers the rest to the trim", () => {
    expect(featureStatus(suv5, "power_sliding_doors")).toBe("no");
    expect(featureStatus(minivan, "power_sliding_doors")).toBe("trim");
    expect(featureStatus(suv5, "fold_flat_3rd")).toBe("no");
    expect(featureStatus(minivan, "parking_sensors")).toBe("trim");
    expect(featureStatus(minivan, null)).toBe("trim");
  });
});

describe("matchFeatures", () => {
  it("flags missing must-haves and counts nice-to-haves", () => {
    const items = [
      item("awd", "awd", "must_have"),
      item("seats", "eight_seats", "must_have"),
      item("sensors", "parking_sensors", "must_have"),
      item("hybrid", "hybrid", "nice_to_have"),
      item("tow", "towing", "nice_to_have"),
      item("ignored", "moonroof", "dont_care"),
    ];
    const m = matchFeatures(minivan, items);
    expect(m.missingMust.map((i) => i.id)).toEqual(["awd"]);
    expect(m.mustToCheck.map((i) => i.id)).toEqual(["sensors"]);
    expect(m.mustTotal).toBe(3);
    expect([m.niceHave, m.niceToCheck, m.niceTotal]).toEqual([1, 0, 2]);
    expect(m.statuses.ignored).toBeUndefined();
  });
});

import { trimChecks } from "@/lib/features";

describe("trim features", () => {
  const items = [item("sensors", "parking_sensors", "must_have"), item("cam", "rear_camera", "nice_to_have"), item("awd", "awd", "must_have")];

  it("turns a trim's recorded booleans into per-item ticks and skips what it doesn't record", () => {
    expect(trimChecks({ parking_sensors: true, rear_camera: false, leather: true }, items)).toEqual({ sensors: true, cam: false });
    expect(trimChecks(null, items)).toEqual({});
  });

  it("lets a trim's record beat the model-level answer, and still falls back to the model for the rest", () => {
    const m = matchFeatures(minivan, items, trimChecks({ parking_sensors: false }, items));
    expect(m.statuses.sensors).toBe("no");
    expect(m.missingMust.map((i) => i.id)).toEqual(expect.arrayContaining(["sensors", "awd"]));
    expect(m.statuses.cam).toBe("trim");
  });
});
