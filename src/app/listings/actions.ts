"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/session";
import type { ActionState } from "@/app/actions";

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const optText = (max: number) => z.preprocess(blankToNull, z.string().trim().max(max).nullable());
const optInt = (min: number, max: number) => z.preprocess(blankToNull, z.coerce.number().int().min(min).max(max).nullable());
const optMoney = z.preprocess(
  (v) => (typeof v === "string" ? blankToNull(v.replace(/[$,\s]/g, "")) : v),
  z.coerce.number().min(0).max(10_000_000).nullable(),
);
const optDate = z.preprocess(blankToNull, z.iso.date().nullable());
const status = z.enum(["watching", "contacted", "test-drive", "offer", "passed"]);

const listingSchema = z.object({
  vehicle_id: z.uuid("Pick a car."),
  year: optInt(1980, 2100),
  trim_label: optText(60),
  miles: optInt(0, 1_000_000),
  asking_price: optMoney,
  dealer: optText(120),
  url: z.preprocess(blankToNull, z.url({ protocol: /^https?$/, message: "Paste a full link starting with https://" }).max(2000).nullable()),
  vin: optText(17),
  condition: z.enum(["new", "used", "cpo"]),
  accidents_owners: optText(200),
  status,
  follow_up_on: optDate,
});

function fail(error: { code?: string; message: string } | null, msg: string) {
  if (error) console.error(error);
  return { error: msg };
}
const refresh = (id?: string) => {
  revalidatePath("/listings");
  if (id) revalidatePath(`/listings/${id}`);
  revalidatePath("/");
};

/** Creates a listing (then opens it) or updates one when `id` is present. */
export async function saveListingAction(_: ActionState, form: FormData): Promise<ActionState> {
  const m = await requireMembership();
  const id = form.get("id") ? z.uuid().parse(form.get("id")) : null;
  const parsed = listingSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the highlighted fields." };
  const supabase = await createClient();
  if (id) {
    const { data, error } = await supabase
      .from("listings")
      .update(parsed.data)
      .eq("id", id)
      .eq("household_id", m.household.id)
      .select("id");
    if (error || !data?.length) return fail(error, "Couldn't save the listing.");
    refresh(id);
    return { ok: "Saved." };
  }
  const { data, error } = await supabase
    .from("listings")
    .insert({ ...parsed.data, household_id: m.household.id })
    .select("id")
    .single();
  if (error) return fail(error, "Couldn't add the listing.");
  refresh();
  redirect(`/listings/${data.id}`);
}

export async function setListingStatusAction(input: { id: string; status: string }) {
  const m = await requireMembership();
  const p = z.object({ id: z.uuid(), status }).parse(input);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listings")
    .update({ status: p.status })
    .eq("id", p.id)
    .eq("household_id", m.household.id)
    .select("id");
  if (error || !data?.length) return fail(error, "Couldn't update the status.");
  refresh(p.id);
  return { ok: true };
}

/** Saves (or, with nulls, clears) a listing's own APR, down payment and term. Null means "use my defaults". */
export async function saveListingTermsAction(input: { id: string; apr: number | null; down: number | null; months: number | null }) {
  const m = await requireMembership();
  const p = z
    .object({
      id: z.uuid(),
      apr: z.number().min(0).max(40).nullable(),
      down: z.number().min(0).max(10_000_000).nullable(),
      months: z.number().int().min(12).max(96).nullable(),
    })
    .parse(input);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listings")
    .update({ apr_override: p.apr, down_override: p.down, term_override: p.months })
    .eq("id", p.id)
    .eq("household_id", m.household.id)
    .select("id");
  if (error || !data?.length) return fail(error, "Couldn't save those terms. Try again.");
  refresh(p.id);
  return { ok: true };
}

export async function deleteListingAction(input: { id: string }) {
  const m = await requireMembership();
  const id = z.uuid().parse(input.id);
  const supabase = await createClient();
  const { error } = await supabase.from("listings").delete().eq("id", id).eq("household_id", m.household.id);
  if (error) return fail(error, "Couldn't delete the listing.");
  refresh();
  redirect("/listings");
}

/** Creates or updates the listing's dealer contact. */
export async function saveContactAction(_: ActionState, form: FormData): Promise<ActionState> {
  const m = await requireMembership();
  const p = z
    .object({
      listing_id: z.uuid(),
      dealership: z.string().trim().min(1, "Enter the dealership.").max(120),
      salesperson: optText(80),
      phone: z.preprocess(blankToNull, z.string().trim().max(30).regex(/^[\d\s()+.\-x]+$/, "That phone number looks off.").nullable()),
      email: z.preprocess(blankToNull, z.email("That email looks off.").nullable()),
    })
    .safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the contact details." };
  const { listing_id, ...contact } = p.data;
  const supabase = await createClient();
  const { data: l } = await supabase
    .from("listings")
    .select("dealer_contact_id")
    .eq("id", listing_id)
    .eq("household_id", m.household.id)
    .maybeSingle();
  if (!l) return { error: "Listing not found." };
  if (l.dealer_contact_id) {
    const { error } = await supabase.from("dealer_contacts").update(contact).eq("id", l.dealer_contact_id);
    if (error) return fail(error, "Couldn't save the contact.");
  } else {
    const { data: c, error } = await supabase
      .from("dealer_contacts")
      .insert({ ...contact, household_id: m.household.id })
      .select("id")
      .single();
    if (error) return fail(error, "Couldn't save the contact.");
    const { error: e2 } = await supabase.from("listings").update({ dealer_contact_id: c.id }).eq("id", listing_id);
    if (e2) return fail(e2, "Couldn't link the contact.");
  }
  refresh(listing_id);
  return { ok: "Saved." };
}

export async function addQuoteAction(_: ActionState, form: FormData): Promise<ActionState> {
  const m = await requireMembership();
  const p = z
    .object({
      listing_id: z.uuid(),
      quoted_on: z.iso.date(),
      otd_price: optMoney,
      apr_offered: z.preprocess(blankToNull, z.coerce.number().min(0).max(40).nullable()),
      includes: optText(300),
      expires_on: optDate,
    })
    .safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the quote." };
  if (p.data.otd_price == null && p.data.apr_offered == null) return { error: "Enter a price or an APR." };
  const supabase = await createClient();
  const { error } = await supabase.from("quotes").insert({ ...p.data, household_id: m.household.id });
  if (error) return fail(error, "Couldn't save the quote.");
  refresh(p.data.listing_id);
  return { ok: "Quote added." };
}

export async function deleteQuoteAction(input: { id: string; listingId: string }) {
  const m = await requireMembership();
  const p = z.object({ id: z.uuid(), listingId: z.uuid() }).parse(input);
  const supabase = await createClient();
  const { error } = await supabase.from("quotes").delete().eq("id", p.id).eq("household_id", m.household.id);
  if (error) return fail(error, "Couldn't delete the quote.");
  refresh(p.listingId);
  return { ok: true };
}

export async function addLogAction(_: ActionState, form: FormData): Promise<ActionState> {
  const m = await requireMembership();
  const p = z
    .object({
      listing_id: z.uuid(),
      logged_on: z.iso.date(),
      channel: z.enum(["call", "text", "email", "in person"]),
      summary: z.string().trim().min(1, "Say what happened.").max(2000),
      follow_up_on: optDate,
    })
    .safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the entry." };
  const { follow_up_on, ...entry } = p.data;
  const supabase = await createClient();
  const { error } = await supabase.from("contact_log").insert({ ...entry, household_id: m.household.id, author_id: m.userId });
  if (error) return fail(error, "Couldn't save the entry.");
  // Logging contact usually means "contacted" and often sets the next follow-up.
  const patch: Record<string, unknown> = {};
  if (follow_up_on) patch.follow_up_on = follow_up_on;
  const { data: l } = await supabase.from("listings").select("status").eq("id", entry.listing_id).maybeSingle();
  if (l?.status === "watching") patch.status = "contacted";
  if (Object.keys(patch).length) await supabase.from("listings").update(patch).eq("id", entry.listing_id).eq("household_id", m.household.id);
  refresh(entry.listing_id);
  return { ok: "Logged." };
}

export async function deleteLogAction(input: { id: string; listingId: string }) {
  const m = await requireMembership();
  const p = z.object({ id: z.uuid(), listingId: z.uuid() }).parse(input);
  const supabase = await createClient();
  const { data, error } = await supabase.from("contact_log").delete().eq("id", p.id).eq("author_id", m.userId).select("id");
  if (error || !data?.length) return fail(error, "You can only delete your own entries.");
  refresh(p.listingId);
  return { ok: true };
}

export async function clearFollowUpAction(input: { id: string }) {
  const m = await requireMembership();
  const id = z.uuid().parse(input.id);
  const supabase = await createClient();
  const { error } = await supabase.from("listings").update({ follow_up_on: null }).eq("id", id).eq("household_id", m.household.id);
  if (error) return fail(error, "Couldn't clear the follow-up.");
  refresh(id);
  return { ok: true };
}

/** Ticks a wishlist feature on or off for this specific car, or clears it (null). */
export async function setFeatureCheckAction(input: { listingId: string; itemId: string; hasIt: boolean | null }) {
  const m = await requireMembership();
  const p = z.object({ listingId: z.uuid(), itemId: z.uuid(), hasIt: z.boolean().nullable() }).parse(input);
  const supabase = await createClient();
  const { error } =
    p.hasIt == null
      ? await supabase.from("listing_feature_checks").delete().eq("listing_id", p.listingId).eq("wishlist_item_id", p.itemId)
      : await supabase.from("listing_feature_checks").upsert(
          { household_id: m.household.id, listing_id: p.listingId, wishlist_item_id: p.itemId, has_it: p.hasIt, checked_by: m.userId },
          { onConflict: "listing_id,wishlist_item_id" },
        );
  if (error) return fail(error, "Couldn't save that.");
  refresh(p.listingId);
  return { ok: true };
}
