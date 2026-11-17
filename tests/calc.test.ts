import { describe, expect, it } from "vitest";
import {
  amountFinanced,
  annualFuelCost,
  averageScores,
  bestIndexes,
  budgetFit,
  loanCost,
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

describe("listings", () => {
  const p = { down_payment: 10000, loan_months: 60, apr_used: 6.5, apr_cpo: 5.9, apr_new: 4.9, include_tax_fees: false, sales_tax_pct: 4.15, fees: 0 };
  const l = { asking_price: 32500, condition: "used" as const, apr_override: null, down_override: null, term_override: null };

  it("uses the default APR for the listing's condition, unless overridden", async () => {
    const { listingTerms } = await import("@/lib/calc");
    expect(listingTerms(l, p).apr).toBe(6.5);
    expect(listingTerms({ ...l, condition: "cpo" }, p).apr).toBe(5.9);
    expect(listingTerms({ ...l, condition: "new" }, p).apr).toBe(4.9);
    expect(listingTerms({ ...l, apr_override: 2.9, term_override: 72, down_override: 5000 }, p)).toEqual({ apr: 2.9, down: 5000, months: 72 });
  });

  it("computes payment, total interest and total cost", async () => {
    const { listingCost } = await import("@/lib/calc");
    const c = listingCost(l, p)!;
    expect(c.monthly).toBeCloseTo(440.24, 2);
    expect(c.totalInterest).toBeCloseTo(440.24 * 60 - 22500, 0);
    expect(c.totalCost).toBeCloseTo(440.24 * 60 + 10000, 0);
    expect(listingCost({ ...l, asking_price: null }, p)).toBeNull();
    // A down payment bigger than the price pays cash: no loan, total = price.
    expect(listingCost({ ...l, asking_price: 8000 }, p)).toMatchObject({ monthly: 0, totalInterest: 0, totalCost: 8000 });
  });

  it("counts days to a follow-up", async () => {
    const { daysUntil } = await import("@/lib/calc");
    expect(daysUntil("2026-11-20", "2026-11-15")).toBe(5);
    expect(daysUntil("2026-11-14", "2026-11-15")).toBe(-1);
  });
});

describe("budgetFit", () => {
  it("compares a used-price range with the budget", () => {
    expect(budgetFit({ price_low: 31000, price_high: 36000 }, 30000, 35000)).toBe("in");
    expect(budgetFit({ price_low: 35500, price_high: 40000 }, 30000, 35000)).toBe("over");
    expect(budgetFit({ price_low: 20000, price_high: 28000 }, 30000, 35000)).toBe("under");
    expect(budgetFit({ price_low: null, price_high: 33000 }, 30000, 35000)).toBe("in");
    expect(budgetFit({ price_low: null, price_high: null }, 30000, 35000)).toBeNull();
  });
});

describe("loanCost", () => {
  const f = { down_payment: 10000, loan_months: 60, apr_used: 6.5, include_tax_fees: false, sales_tax_pct: 4.15, fees: 500 };

  it("matches the amortization for a price, APR, down payment and term", () => {
    const c = loanCost(32500, 6.5, 10000, 60, f);
    expect(c.principal).toBe(22500);
    expect(c.monthly).toBeCloseTo(440.24, 2);
    expect(c.totalInterest).toBeCloseTo(440.24 * 60 - 22500, 0);
    expect(c.totalCost).toBeCloseTo(440.24 * 60 + 10000, 0);
  });

  it("a lower APR on a pricier car can still cost less in total", () => {
    const promo = loanCost(36000, 2.9, 10000, 60, f);
    const used = loanCost(32500, 7.5, 10000, 60, f);
    expect(promo.totalInterest).toBeLessThan(used.totalInterest);
  });

  it("handles 0% and a down payment bigger than the price", () => {
    expect(loanCost(24000, 0, 4000, 50, f).monthly).toBe(400);
    const over = loanCost(8000, 6.5, 10000, 60, f);
    expect(over.monthly).toBe(0);
    expect(over.totalCost).toBe(8000);
  });

  it("adds tax and fees once, to the price, when asked", () => {
    const c = loanCost(30000, 0, 0, 60, { ...f, include_tax_fees: true });
    expect(c.principal).toBeCloseTo(30000 * 1.0415 + 500, 2);
  });
});
