import { describe, expect, it } from "vitest";
import { fitSummary, hasThirdRow, positionResults, summaryText, worstResult, type FitCheck } from "@/lib/seatfit";

const c = (over: Partial<FitCheck> & { listing_id?: string }): FitCheck & { listing_id: string } => ({
  id: Math.random().toString(),
  car_seat_id: "s1",
  position: "row2_left",
  install_method: "latch",
  result: "pass",
  front_room_ok: null,
  third_passenger_fit: null,
  notes: null,
  checked_at: "2026-11-16T10:00:00Z",
  listing_id: "L1",
  ...over,
});

describe("seat fit", () => {
  it("ranks fail above tight above pass", () => {
    expect(worstResult(["pass", "tight"])).toBe("tight");
    expect(worstResult(["pass", "fail", "tight"])).toBe("fail");
    expect(worstResult([])).toBeNull();
  });

  it("keeps only the latest check per seat and position, and takes the worst across seats", () => {
    const r = positionResults([
      c({ result: "fail", checked_at: "2026-11-16T10:00:00Z" }),
      c({ result: "pass", checked_at: "2026-11-16T11:00:00Z" }), // retested later: replaces the fail
      c({ car_seat_id: "s2", result: "tight" }),
    ]);
    expect(r.row2_left.checks).toHaveLength(2);
    expect(r.row2_left.worst).toBe("tight");
    expect(r.row3_right.worst).toBeNull();
  });

  it("summarizes positions per listing", () => {
    const s = fitSummary([
      c({ position: "row2_left", result: "pass" }),
      c({ position: "row2_right", result: "tight" }),
      c({ position: "row2_middle", result: "fail", listing_id: "L2" }),
    ]);
    expect(s.L1).toEqual({ pass: 1, tight: 1, fail: 0, tested: 2 });
    expect(s.L2.fail).toBe(1);
    expect(summaryText(s.L1)).toBe("1 fit, 1 tight");
    expect(summaryText(undefined)).toBeNull();
  });

  it("shows a 3rd row only on 7+ seaters, or when seats are unknown", () => {
    expect(hasThirdRow(8)).toBe(true);
    expect(hasThirdRow(5)).toBe(false);
    expect(hasThirdRow(null)).toBe(true);
  });
});
