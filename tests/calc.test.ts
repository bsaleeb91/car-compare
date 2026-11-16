import { describe, expect, it } from "vitest";
import {
  amountFinanced,
  annualFuelCost,
  averageScores,
  bestIndexes,
  garageFit,
  monthlyPayment,
  rank,
  weightedScore,
} from "@/lib/calc";

const garage = { garage_depth_in: 240, garage_door_width_in: 108, garage_door_height_in: 84, min_walkaround_in: 24 };
const weights = { cargo: 25, car_seat_access: 20, reliability: 15, price: 15, fuel: 10, city_ease: 10, awd: 5 };

describe("money", () => {
  it("amortizes like a loan calculator", () => {
    expect(monthlyPayment(22500, 6.5, 60)).toBeCloseTo(440.24, 2);
    expect(monthlyPayment(12000, 0, 60)).toBe(200);
    expect(monthlyPayment(0, 6.5, 60)).toBe(0);
  });

  it("adds tax and fees only when asked, then subtracts the down payment", () => {
    const f = { down_payment: 10000, loan_months: 60, apr_used: 6.5, include_tax_fees: false, sales_tax_pct: 4.15, fees: 500 };
    expect(amountFinanced(32500, f)).toBe(22500);
    expect(amountFinanced(32500, { ...f, include_tax_fees: true })).toBeCloseTo(24348.75, 2);
    expect(amountFinanced(5000, f)).toBe(0);
  });

  it("matches the spreadsheet's yearly fuel cost", () => {
    expect(annualFuelCost(12000, 22, 3.25)).toBeCloseTo(1772.73, 2); // Odyssey
    expect(annualFuelCost(12000, 36, 3.25)).toBeCloseTo(1083.33, 2); // Sienna
    expect(annualFuelCost(12000, null, 3.25)).toBeNull();
  });
});

describe("garage fit", () => {
  it("matches the spreadsheet margins", () => {
    expect(garageFit(garage, { length_in: 205.2, width_in: 78.5, height_in: 69.6 })).toEqual({
      status: "fits",
      depthLeft: 34.8,
      widthMargin: 29.5,
      heightMargin: 14.4,
    });
  });

  it("is tight under the minimums and no when it doesn't fit", () => {
    expect(garageFit(garage, { length_in: 220, width_in: 78, height_in: 70 }).status).toBe("tight");
    expect(garageFit(garage, { length_in: 200, width_in: 100, height_in: 70 }).status).toBe("tight");
    expect(garageFit(garage, { length_in: 241, width_in: 78, height_in: 70 }).status).toBe("no");
  });

  it("is unknown without measurements", () => {
    const none = { ...garage, garage_depth_in: null, garage_door_width_in: null, garage_door_height_in: null };
    expect(garageFit(none, { length_in: 200, width_in: 78, height_in: 70 }).status).toBe("unknown");
  });
});

describe("scores", () => {
  const odyssey = { cargo: 5, car_seat_access: 5, reliability: 4, price: 3, fuel: 2, city_ease: 2, awd: 1 };
  const rows = Object.entries(odyssey).map(([criterion, score]) => ({ vehicle_id: "o", user_id: "a", criterion, score }));

  it("matches the spreadsheet's weighted score", () => {
    expect(weightedScore(averageScores(rows, "o"), weights)).toEqual({ score: 3.75, complete: true });
  });

  it("averages members and rescales missing criteria", () => {
    const two = [...rows, { vehicle_id: "o", user_id: "b", criterion: "cargo", score: 3 }];
    expect(averageScores(two, "o").cargo).toBe(4);
    const partial = weightedScore({ cargo: 4, fuel: 2 }, weights);
    expect(partial.complete).toBe(false);
    expect(partial.score).toBeCloseTo((4 * 25 + 2 * 10) / 35, 5);
    expect(weightedScore({}, weights).score).toBeNull();
  });

  it("ranks with ties like the spreadsheet", () => {
    expect(rank([3.75, 3.75, 3.55, 3.1, null])).toEqual([1, 1, 3, 4, null]);
  });

  it("finds the best values, and none when all tie", () => {
    expect(bestIndexes([1, 3, 3, null], "high")).toEqual([1, 2]);
    expect(bestIndexes([1, 3, 3], "low")).toEqual([0]);
    expect(bestIndexes([2, 2], "high")).toEqual([]);
  });
});

describe("test drive", () => {
  it("has unique td_ keys that never collide with weighted criteria", async () => {
    const { TEST_DRIVE_KEYS, CRITERIA } = await import("@/lib/calc");
    expect(new Set(TEST_DRIVE_KEYS).size).toBe(TEST_DRIVE_KEYS.length);
    expect(TEST_DRIVE_KEYS.every((k) => k.startsWith("td_"))).toBe(true);
    expect(CRITERIA.some((c) => TEST_DRIVE_KEYS.includes(c.key))).toBe(false);
  });

  it("averages only scored test-drive items and ignores weighted ones", async () => {
    const { meanOf, TEST_DRIVE_KEYS, weightedScore } = await import("@/lib/calc");
    const avg = { td_verdict: 4, td_braking: 3, cargo: 5 };
    expect(meanOf(avg, TEST_DRIVE_KEYS)).toBe(3.5);
    expect(meanOf({}, TEST_DRIVE_KEYS)).toBeNull();
    // td_ scores don't change the weighted score
    expect(weightedScore(avg, { cargo: 100 }).score).toBe(5);
  });
});
