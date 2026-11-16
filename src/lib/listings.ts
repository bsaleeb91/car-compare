import "server-only";
import { createClient } from "@/lib/supabase/server";

export const LISTING_STATUSES = [
  { key: "watching", label: "Watching", cls: "bg-surface-2 text-muted" },
  { key: "contacted", label: "Contacted", cls: "bg-accent-soft text-accent" },
  { key: "test-drive", label: "Test drive", cls: "bg-amber-soft text-amber" },
  { key: "offer", label: "Offer", cls: "bg-teal-soft text-teal" },
  { key: "passed", label: "Passed", cls: "bg-coral-soft text-coral" },
] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number]["key"];

export type Listing = {
  id: string;
  vehicle_id: string;
  year: number | null;
  trim_label: string | null;
  miles: number | null;
  asking_price: number | null;
  dealer: string | null;
  url: string | null;
  vin: string | null;
  condition: "new" | "used" | "cpo";
  accidents_owners: string | null;
  status: ListingStatus;
  apr_override: number | null;
  down_override: number | null;
  term_override: number | null;
  follow_up_on: string | null;
  dealer_contact_id: string | null;
  created_at: string;
  vehicles: { make: string; model: string; type: string };
};

const LISTING_COLS =
  "id, vehicle_id, year, trim_label, miles, asking_price, dealer, url, vin, condition, accidents_owners, status, apr_override, down_override, term_override, follow_up_on, dealer_contact_id, created_at, vehicles(make, model, type)";

const num = (x: unknown) => (x == null ? null : Number(x));
function normalize(row: Record<string, unknown>): Listing {
  return {
    ...(row as unknown as Listing),
    asking_price: num(row.asking_price),
    apr_override: num(row.apr_override),
    down_override: num(row.down_override),
  };
}

export async function getListings(householdId: string, vehicleId?: string): Promise<Listing[]> {
  const supabase = await createClient();
  let q = supabase.from("listings").select(LISTING_COLS).eq("household_id", householdId);
  if (vehicleId) q = q.eq("vehicle_id", vehicleId);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => normalize(r as Record<string, unknown>));
}

export async function getListing(householdId: string, id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("listings").select(LISTING_COLS).eq("household_id", householdId).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const listing = normalize(data as Record<string, unknown>);
  const [contact, quotes, log, checks] = await Promise.all([
    listing.dealer_contact_id
      ? supabase.from("dealer_contacts").select("id, dealership, salesperson, phone, email").eq("id", listing.dealer_contact_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("quotes")
      .select("id, quoted_on, otd_price, apr_offered, includes, expires_on")
      .eq("listing_id", id)
      .order("quoted_on", { ascending: false }),
    supabase
      .from("contact_log")
      .select("id, logged_on, channel, summary, author_id, created_at")
      .eq("listing_id", id)
      .order("logged_on", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("listing_feature_checks").select("wishlist_item_id, has_it").eq("listing_id", id),
  ]);
  return {
    listing,
    contact: contact.data as { id: string; dealership: string; salesperson: string | null; phone: string | null; email: string | null } | null,
    quotes: (quotes.data ?? []).map((q) => ({ ...q, otd_price: num(q.otd_price), apr_offered: num(q.apr_offered) })) as {
      id: string;
      quoted_on: string;
      otd_price: number | null;
      apr_offered: number | null;
      includes: string | null;
      expires_on: string | null;
    }[],
    log: (log.data ?? []) as { id: string; logged_on: string; channel: string; summary: string; author_id: string; created_at: string }[],
    checks: Object.fromEntries((checks.data ?? []).map((c) => [c.wishlist_item_id, c.has_it as boolean])) as Record<string, boolean>,
  };
}

export const listingTitle = (l: Pick<Listing, "year" | "trim_label" | "vehicles">) =>
  [l.year, l.vehicles.make, l.vehicles.model, l.trim_label].filter(Boolean).join(" ");

/** Today's date (YYYY-MM-DD) in US Eastern time, which is close enough for follow-up badges. */
export function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}
