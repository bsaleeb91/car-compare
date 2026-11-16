"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CRITERIA } from "@/lib/calc";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/session";
import type { ActionState } from "@/app/actions";

const criterion = z.enum(CRITERIA.map((c) => c.key) as [string, ...string[]]);

/** Sets (or, with score null, clears) the signed-in member's own score. RLS enforces ownership. */
export async function setScoreAction(input: { vehicleId: string; criterion: string; score: number | null }) {
  const m = await requireMembership();
  const p = z
    .object({ vehicleId: z.uuid(), criterion, score: z.number().int().min(1).max(5).nullable() })
    .parse(input);
  const supabase = await createClient();
  const { error } = p.score
    ? await supabase.from("scores").upsert(
        { household_id: m.household.id, vehicle_id: p.vehicleId, user_id: m.userId, criterion: p.criterion, score: p.score },
        { onConflict: "household_id,vehicle_id,user_id,criterion" },
      )
    : await supabase
        .from("scores")
        .delete()
        .eq("household_id", m.household.id)
        .eq("vehicle_id", p.vehicleId)
        .eq("user_id", m.userId)
        .eq("criterion", p.criterion);
  if (error) {
    console.error(error);
    return { error: "Couldn't save that score. Try again." };
  }
  revalidatePath("/compare");
  revalidatePath("/");
  return { ok: true };
}

/** Removes a car from the household's shortlist (kept as "rejected", with its scores) or restores it. */
export async function setShortlistAction(input: { vehicleId: string; removed: boolean }) {
  const m = await requireMembership();
  const p = z.object({ vehicleId: z.uuid(), removed: z.boolean() }).parse(input);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shortlist")
    .update({ status: p.removed ? "rejected" : "considering" })
    .eq("household_id", m.household.id)
    .eq("vehicle_id", p.vehicleId)
    .select("vehicle_id");
  if (error || !data?.length) {
    if (error) console.error(error);
    return { error: p.removed ? "Couldn't remove that car. Try again." : "Couldn't restore that car. Try again." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

const noteBody = z.string().trim().min(1, "Write something first.").max(5000, "That note is too long.");

/** Adds a note on a car (later also on a trim or listing). RLS checks membership and authorship. */
export async function addNoteAction(input: { vehicleId: string; body: string }) {
  const m = await requireMembership();
  const p = z.object({ vehicleId: z.uuid(), body: noteBody }).safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Invalid note." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("notes")
    .insert({ household_id: m.household.id, vehicle_id: p.data.vehicleId, author_id: m.userId, body: p.data.body });
  if (error) {
    console.error(error);
    return { error: "Couldn't save your note. Try again." };
  }
  revalidatePath(`/cars/${p.data.vehicleId}`);
  return { ok: true };
}

export async function editNoteAction(input: { id: string; body: string }) {
  const m = await requireMembership();
  const p = z.object({ id: z.uuid(), body: noteBody }).safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Invalid note." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notes")
    .update({ body: p.data.body })
    .eq("id", p.data.id)
    .eq("author_id", m.userId)
    .select("vehicle_id");
  if (error || !data?.length) return { error: "Couldn't update that note." };
  revalidatePath(`/cars/${data[0].vehicle_id}`);
  return { ok: true };
}

export async function deleteNoteAction(input: { id: string }) {
  const m = await requireMembership();
  const id = z.uuid().parse(input.id);
  const supabase = await createClient();
  const { data, error } = await supabase.from("notes").delete().eq("id", id).eq("author_id", m.userId).select("vehicle_id");
  if (error || !data?.length) return { error: "Couldn't delete that note." };
  revalidatePath(`/cars/${data[0].vehicle_id}`);
  return { ok: true };
}

const money = z.coerce.number().min(0).max(10_000_000);
const optInches = z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().min(1).max(2000).nullable());

export async function updatePreferencesAction(_: ActionState, form: FormData): Promise<ActionState> {
  const m = await requireMembership();
  const f = Object.fromEntries(form);
  const weights = Object.fromEntries(CRITERIA.map((c) => [c.key, Number(f[`w_${c.key}`] ?? 0)]));
  const parsed = z
    .object({
      budget_min: money,
      budget_max: money,
      down_payment: money,
      loan_months: z.coerce.number().int().min(12).max(96),
      apr_used: z.coerce.number().min(0).max(40),
      apr_cpo: z.coerce.number().min(0).max(40),
      apr_new: z.coerce.number().min(0).max(40),
      include_tax_fees: z.boolean(),
      sales_tax_pct: z.coerce.number().min(0).max(25),
      fees: money,
      miles_per_year: z.coerce.number().int().min(0).max(200_000),
      gas_price: z.coerce.number().min(0).max(20),
      garage_depth_in: optInches,
      garage_door_width_in: optInches,
      garage_door_height_in: optInches,
      min_walkaround_in: z.coerce.number().min(0).max(200),
      weights: z.record(z.string(), z.number().int().min(0).max(100)),
    })
    .safeParse({ ...f, include_tax_fees: f.include_tax_fees === "on", weights });
  if (!parsed.success) return { error: "Some values are out of range. Check the highlighted fields." };
  const d = parsed.data;
  if (d.budget_min > d.budget_max) return { error: "Budget minimum is above the maximum." };
  const total = Object.values(d.weights).reduce((a, b) => a + b, 0);
  if (total !== 100) return { error: `Priority weights add up to ${total}%. They need to total 100%.` };

  const supabase = await createClient();
  const { error } = await supabase
    .from("preferences")
    .update({ ...d, updated_by: m.userId })
    .eq("household_id", m.household.id);
  if (error) {
    console.error(error);
    return { error: "Couldn't save. Please try again." };
  }
  revalidatePath("/", "layout");
  return { ok: "Saved." };
}
