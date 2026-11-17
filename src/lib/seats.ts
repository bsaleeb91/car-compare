import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { FitCheck, SeatType } from "@/lib/seatfit";

export type CarSeat = { id: string; name: string; type: SeatType; width_in: number | null };

export async function getCarSeats(householdId: string): Promise<CarSeat[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("car_seats").select("id, name, type, width_in").eq("household_id", householdId).order("created_at");
  if (error) throw error;
  return (data ?? []).map((s) => ({ ...s, width_in: s.width_in == null ? null : Number(s.width_in) })) as CarSeat[];
}

const COLS = "id, listing_id, car_seat_id, position, install_method, result, front_room_ok, third_passenger_fit, notes, checked_at";

export async function getSeatChecks(householdId: string, listingId?: string) {
  const supabase = await createClient();
  let q = supabase.from("seat_fit_checks").select(COLS).eq("household_id", householdId);
  if (listingId) q = q.eq("listing_id", listingId);
  const { data, error } = await q.order("checked_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as (FitCheck & { listing_id: string })[];
}
