import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { StageCounts } from "@/lib/flow";

export type FlowState = {
  counts: StageCounts;
  finalistIds: string[];
  /** Target trims as "Honda Odyssey Touring", for the Listings stage's "shopping for" line. */
  targetNames: string[];
};

/** Where the household stands in the models, trims, listings flow. */
export async function getFlowState(householdId: string): Promise<FlowState> {
  const supabase = await createClient();
  const [shortlist, targets, listings] = await Promise.all([
    supabase.from("shortlist").select("vehicle_id, status").eq("household_id", householdId),
    supabase.from("trim_shortlist").select("trims(name, vehicles(make, model))").eq("household_id", householdId).eq("status", "target"),
    supabase.from("listings").select("id", { count: "exact", head: true }).eq("household_id", householdId).neq("status", "passed"),
  ]);
  for (const r of [shortlist, targets, listings]) if (r.error) throw r.error;

  const live = (shortlist.data ?? []).filter((s) => s.status !== "rejected");
  const finalistIds = live.filter((s) => s.status === "finalist").map((s) => s.vehicle_id as string);
  type TargetRow = { trims: { name: string; vehicles: { make: string; model: string } | null } | null };
  const targetNames = ((targets.data ?? []) as unknown as TargetRow[])
    .flatMap((t) => (t.trims ? [`${t.trims.vehicles ? `${t.trims.vehicles.make} ${t.trims.vehicles.model} ` : ""}${t.trims.name}`] : []))
    .sort();

  return {
    counts: { cars: live.length, finalists: finalistIds.length, targets: targetNames.length, listings: listings.count ?? 0 },
    finalistIds,
    targetNames,
  };
}
