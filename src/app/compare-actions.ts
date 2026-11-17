"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CRITERIA, TEST_DRIVE_KEYS } from "@/lib/calc";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/session";
import type { ActionState } from "@/app/actions";
import type { WishItem } from "@/lib/features";

const criterion = z.enum([...CRITERIA.map((c) => c.key), ...TEST_DRIVE_KEYS] as [string, ...string[]]);

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
  revalidatePath(`/cars/${p.vehicleId}`);
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
export async function addNoteAction(input: { vehicleId: string; listingId?: string; body: string }) {
  const m = await requireMembership();
  const p = z.object({ vehicleId: z.uuid(), listingId: z.uuid().optional(), body: noteBody }).safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Invalid note." };
  const supabase = await createClient();
  const { error } = await supabase.from("notes").insert({
    household_id: m.household.id,
    vehicle_id: p.data.vehicleId,
    listing_id: p.data.listingId ?? null,
    author_id: m.userId,
    body: p.data.body,
  });
  if (error) {
    console.error(error);
    return { error: "Couldn't save your note. Try again." };
  }
  revalidatePath(`/cars/${p.data.vehicleId}`);
  if (p.data.listingId) revalidatePath(`/listings/${p.data.listingId}`);
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
    .select("vehicle_id, listing_id");
  if (error || !data?.length) return { error: "Couldn't update that note." };
  revalidatePath(`/cars/${data[0].vehicle_id}`);
  if (data[0].listing_id) revalidatePath(`/listings/${data[0].listing_id}`);
  return { ok: true };
}

export async function deleteNoteAction(input: { id: string }) {
  const m = await requireMembership();
  const id = z.uuid().parse(input.id);
  const supabase = await createClient();
  const { data, error } = await supabase.from("notes").delete().eq("id", id).eq("author_id", m.userId).select("vehicle_id, listing_id");
  if (error || !data?.length) return { error: "Couldn't delete that note." };
  revalidatePath(`/cars/${data[0].vehicle_id}`);
  if (data[0].listing_id) revalidatePath(`/listings/${data[0].listing_id}`);
  return { ok: true };
}

const tier = z.enum(["must_have", "nice_to_have", "dont_care"]);

/** Moves a wishlist item between must-have, nice-to-have and don't care. */
export async function setTierAction(input: { id: string; tier: string }) {
  const m = await requireMembership();
  const p = z.object({ id: z.uuid(), tier }).parse(input);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wishlist_items")
    .update({ tier: p.tier })
    .eq("id", p.id)
    .eq("household_id", m.household.id)
    .select("id");
  if (error || !data?.length) return { error: "Couldn't save that. Try again." };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Adds a feature that isn't in the preloaded list. It can't be read from specs, so it's checked by hand. */
export async function addCustomFeatureAction(input: { name: string; tier: string }) {
  const m = await requireMembership();
  const p = z
    .object({ name: z.string().trim().min(1, "Name the feature.").max(80, "Keep it under 80 characters."), tier })
    .safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Invalid feature." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wishlist_items")
    .insert({ household_id: m.household.id, name: p.data.name, tier: p.data.tier, category: "Custom", sort_order: 10000 })
    .select("id, name, category, tier, feature_key, catalog_key")
    .single();
  if (error) {
    console.error(error);
    return { error: "Couldn't add that feature." };
  }
  revalidatePath("/", "layout");
  return { ok: true, item: data as WishItem };
}

/** Deletes a custom feature. Preloaded ones can only be set to "don't care". */
export async function deleteCustomFeatureAction(input: { id: string }) {
  const m = await requireMembership();
  const id = z.uuid().parse(input.id);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wishlist_items")
    .delete()
    .eq("id", id)
    .eq("household_id", m.household.id)
    .is("catalog_key", null)
    .select("id");
  if (error || !data?.length) return { error: "Couldn't delete that feature." };
  revalidatePath("/", "layout");
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

/** Marks a trim as a target (or clears it). RLS requires household membership and that the trim is visible. */
export async function setTrimTargetAction(input: { trimId: string; target: boolean }) {
  const m = await requireMembership();
  const p = z.object({ trimId: z.uuid(), target: z.boolean() }).parse(input);
  const supabase = await createClient();
  const { error } = p.target
    ? await supabase
        .from("trim_shortlist")
        .upsert({ household_id: m.household.id, trim_id: p.trimId, status: "target" }, { onConflict: "household_id,trim_id" })
    : await supabase.from("trim_shortlist").delete().eq("household_id", m.household.id).eq("trim_id", p.trimId);
  if (error) {
    console.error(error);
    return { error: "Couldn't save that. Try again." };
  }
  revalidatePath("/compare");
  revalidatePath("/listings");
  revalidatePath("/");
  return { ok: true };
}

/** Marks a shortlisted car as a finalist (moves on to the Trims stage) or puts it back to considering. Removed cars are left alone. */
export async function setFinalistAction(input: { vehicleId: string; finalist: boolean }) {
  const m = await requireMembership();
  const p = z.object({ vehicleId: z.uuid(), finalist: z.boolean() }).parse(input);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shortlist")
    .update({ status: p.finalist ? "finalist" : "considering" })
    .eq("household_id", m.household.id)
    .eq("vehicle_id", p.vehicleId)
    .neq("status", "rejected")
    .select("vehicle_id");
  if (error || !data?.length) {
    if (error) console.error(error);
    return { error: "Couldn't save that. Try again." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
