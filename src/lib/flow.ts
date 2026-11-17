/** The three-stage flow: models, then trims, then listings. Pure, so it's unit-tested. */

export type StageKey = "models" | "trims" | "listings";

export type StageCounts = {
  /** Cars on the shortlist (not removed). */
  cars: number;
  /** Cars marked as finalists. */
  finalists: number;
  /** Trims marked as targets. */
  targets: number;
  /** Listings that aren't passed. */
  listings: number;
};

export type Stage = {
  key: StageKey;
  number: number;
  label: string;
  href: string;
  /** done: the household has chosen something here. current: where they are now. todo: not yet. */
  state: "done" | "current" | "todo";
  /** Stage 2 opens once there is a finalist, stage 3 once there is a target trim (or a listing already). */
  locked: boolean;
  summary: string;
  /** What to do to open a locked stage. */
  lockedHint: string | null;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function buildStages(c: StageCounts, current?: StageKey): Stage[] {
  const modelsDone = c.finalists > 0;
  const trimsDone = c.targets > 0;
  const trimsLocked = !modelsDone;
  const listingsLocked = c.targets === 0 && c.listings === 0;

  const base: Omit<Stage, "state">[] = [
    {
      key: "models",
      number: 1,
      label: "Models",
      href: "/compare",
      locked: false,
      summary: modelsDone ? `${plural(c.finalists, "finalist")} of ${plural(c.cars, "car")}` : c.cars ? `${plural(c.cars, "car")} to narrow down` : "Add cars to compare",
      lockedHint: null,
    },
    {
      key: "trims",
      number: 2,
      label: "Trims",
      href: "/compare?view=trims",
      locked: trimsLocked,
      summary: trimsDone ? plural(c.targets, "target trim") : trimsLocked ? "Opens with a finalist" : "Pick target trims",
      lockedHint: trimsLocked ? "Mark at least one finalist in Models first." : null,
    },
    {
      key: "listings",
      number: 3,
      label: "Listings",
      href: "/listings",
      locked: listingsLocked,
      summary: c.listings ? `${plural(c.listings, "listing")} tracked` : listingsLocked ? "Opens with a target trim" : "Add cars for sale",
      lockedHint: listingsLocked ? "Mark at least one target trim in Trims first." : null,
    },
  ];

  // Without a page to anchor on (the home screen), "current" is the first stage still to do.
  const done: Record<StageKey, boolean> = { models: modelsDone, trims: trimsDone, listings: c.listings > 0 };
  const firstTodo = base.find((s) => !done[s.key] && !s.locked)?.key ?? "listings";
  const here = current ?? firstTodo;

  return base.map((s) => ({ ...s, state: s.key === here ? "current" : done[s.key] ? "done" : "todo" }));
}

/** Which trims the Trims stage shows: only finalists' trims once there are finalists, unless the household asks for all. */
export function trimsInScope(vehicleIds: string[], finalistIds: string[], showAll: boolean): { ids: string[]; narrowed: boolean; locked: boolean } {
  if (finalistIds.length === 0) return { ids: showAll ? vehicleIds : [], narrowed: false, locked: !showAll };
  if (showAll) return { ids: vehicleIds, narrowed: false, locked: false };
  const keep = new Set(finalistIds);
  return { ids: vehicleIds.filter((id) => keep.has(id)), narrowed: true, locked: false };
}
