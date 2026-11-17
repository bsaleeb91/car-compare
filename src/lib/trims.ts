import "server-only";
import { createClient } from "@/lib/supabase/server";

export type Trim = {
  id: string;
  vehicle_id: string;
  household_id: string | null;
  name: string;
  model_years: string;
  key_features: string[];
  features: Record<string, unknown>;
  price_low: number | null;
  price_high: number | null;
  specs_verified: boolean;
};

export type TrimStatus = "considering" | "target" | "rejected";

/** Every trim the household can see (shared catalog plus its own) with its target status, if any. */
export async function getTrims(householdId: string, vehicleIds?: string[]) {
  const supabase = await createClient();
  let q = supabase.from("trims").select("*");
  if (vehicleIds) q = q.in("vehicle_id", vehicleIds.length ? vehicleIds : ["00000000-0000-0000-0000-000000000000"]);
  const [trims, marks] = await Promise.all([
    q.order("price_low", { ascending: true, nullsFirst: false }),
    supabase.from("trim_shortlist").select("trim_id, status").eq("household_id", householdId),
  ]);
  if (trims.error) throw trims.error;
  if (marks.error) throw marks.error;
  const status = new Map((marks.data ?? []).map((m) => [m.trim_id as string, m.status as TrimStatus]));
  return (trims.data ?? []).map((t) => ({
    trim: {
      ...(t as Trim),
      price_low: t.price_low == null ? null : Number(t.price_low),
      price_high: t.price_high == null ? null : Number(t.price_high),
    } as Trim,
    status: status.get(t.id as string) ?? null,
  }));
}
