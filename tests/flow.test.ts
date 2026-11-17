import { describe, expect, it } from "vitest";
import { buildStages, trimsInScope } from "@/lib/flow";

const none = { cars: 8, finalists: 0, targets: 0, listings: 0 };

describe("buildStages", () => {
  it("starts at models, with trims and listings waiting", () => {
    const s = buildStages(none);
    expect(s.map((x) => x.state)).toEqual(["current", "todo", "todo"]);
    expect(s[1].locked).toBe(true);
    expect(s[1].lockedHint).toMatch(/finalist/);
    expect(s[2].locked).toBe(true);
    expect(s[0].summary).toBe("8 cars to narrow down");
  });

  it("opens trims once there is a finalist, and moves the home-screen marker there", () => {
    const s = buildStages({ ...none, finalists: 2 });
    expect(s[0].state).toBe("done");
    expect(s[0].summary).toBe("2 finalists of 8 cars");
    expect(s[1].locked).toBe(false);
    expect(s[1].state).toBe("current");
  });

  it("opens listings with a target trim, or when listings already exist", () => {
    expect(buildStages({ ...none, finalists: 1, targets: 1 })[2].locked).toBe(false);
    expect(buildStages({ ...none, finalists: 1, targets: 1 })[1].summary).toBe("1 target trim");
    expect(buildStages({ ...none, listings: 3 })[2].locked).toBe(false);
  });

  it("marks the page you are on as current and earlier chosen stages as done", () => {
    const s = buildStages({ cars: 8, finalists: 2, targets: 2, listings: 4 }, "models");
    expect(s.map((x) => x.state)).toEqual(["current", "done", "done"]);
    expect(buildStages({ cars: 8, finalists: 2, targets: 0, listings: 0 }, "listings").map((x) => x.state)).toEqual(["done", "todo", "current"]);
  });
});

describe("trimsInScope", () => {
  const all = ["a", "b", "c"];
  it("is locked until a finalist exists, unless the household shows all", () => {
    expect(trimsInScope(all, [], false)).toEqual({ ids: [], narrowed: false, locked: true });
    expect(trimsInScope(all, [], true)).toEqual({ ids: all, narrowed: false, locked: false });
  });
  it("narrows to finalists, and can be widened", () => {
    expect(trimsInScope(all, ["b"], false)).toEqual({ ids: ["b"], narrowed: true, locked: false });
    expect(trimsInScope(all, ["b"], true)).toEqual({ ids: all, narrowed: false, locked: false });
  });
});
