"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/session";
import { POSITIONS } from "@/lib/seatfit";

const blankToNull = (v: unknown) => (v === "" || v === undefined ? null : v);

function fail(error: { message: string } | null, msg: string) {
  if (error) console.error(error);
  return { error: msg };
}

/** Adds one of the household's car seats (shown in Preferences, picked on each listing's fit check). */
export async function addCarSeatAction(input: { name: string; type: string; widthIn: number | null }) {
  const m = await requireMembership();
  const p = z
    .object({
      name: z.string().trim().min(1, "Give the seat a name.").max(60),
      type: z.enum(["infant", "convertible", "booster"]),
      widthIn: z.preprocess(blankToNull, z.number().min(5).max(30).nullable()),
    })
    .safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the car seat." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("car_seats")
    .insert({ household_id: m.household.id, name: p.data.name, type: p.data.type, width_in: p.data.widthIn });
  if (error) return fail(error, "Couldn't add that seat.");
  revalidatePath("/preferences");
  revalidatePath("/listings", "layout");
  return { ok: true };
}

export async function deleteCarSeatAction(input: { id: string }) {
  const m = await requireMembership();
  const id = z.uuid().parse(input.id);
  const supabase = await createClient();
  const { error } = await supabase.from("car_seats").delete().eq("id", id).eq("household_id", m.household.id);
  if (error) return fail(error, "Couldn't remove that seat.");
  revalidatePath("/preferences");
  revalidatePath("/listings", "layout");
  revalidatePath("/cars", "layout");
  return { ok: true };
}

/** Records how one car seat did in one position of a listing. Re-testing adds a newer check that replaces the old on the map. */
export async function addSeatCheckAction(input: {
  listingId: string;
  carSeatId: string;
  position: string;
  installMethod: string | null;
  result: string;
  frontRoomOk: boolean | null;
  thirdPassengerFit: boolean | null;
  notes: string | null;
}) {
  const m = await requireMembership();
  const p = z
    .object({
      listingId: z.uuid(),
      carSeatId: z.uuid(),
      position: z.enum(POSITIONS.map((x) => x.key) as [string, ...string[]]),
      installMethod: z.preprocess(blankToNull, z.enum(["latch", "seat_belt"]).nullable()),
      result: z.enum(["pass", "tight", "fail"]),
      frontRoomOk: z.boolean().nullable(),
      thirdPassengerFit: z.boolean().nullable(),
      notes: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(500).nullable()),
    })
    .safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the fit check." };
  const supabase = await createClient();
  const { error } = await supabase.from("seat_fit_checks").insert({
    household_id: m.household.id,
    listing_id: p.data.listingId,
    car_seat_id: p.data.carSeatId,
    position: p.data.position,
    install_method: p.data.installMethod,
    result: p.data.result,
    front_room_ok: p.data.frontRoomOk,
    third_passenger_fit: p.data.thirdPassengerFit,
    notes: p.data.notes,
    checked_by: m.userId,
  });
  if (error) return fail(error, "Couldn't save that check.");
  revalidatePath(`/listings/${p.data.listingId}`);
  revalidatePath("/listings");
  revalidatePath("/cars", "layout");
  return { ok: true };
}

export async function deleteSeatCheckAction(input: { id: string; listingId: string }) {
  const m = await requireMembership();
  const p = z.object({ id: z.uuid(), listingId: z.uuid() }).parse(input);
  const supabase = await createClient();
  const { error } = await supabase.from("seat_fit_checks").delete().eq("id", p.id).eq("household_id", m.household.id);
  if (error) return fail(error, "Couldn't delete that check.");
  revalidatePath(`/listings/${p.listingId}`);
  revalidatePath("/listings");
  revalidatePath("/cars", "layout");
  return { ok: true };
}
