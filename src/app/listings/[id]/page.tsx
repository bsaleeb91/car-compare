import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { LiveRefresh } from "@/components/LiveRefresh";
import { usd } from "@/components/CompareTable";
import { requireMembership } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getComparison } from "@/lib/data";
import { getListing, listingTitle, today } from "@/lib/listings";
import { listingTerms } from "@/lib/calc";
import { matchFeatures } from "@/lib/features";
import { NotesThread, type Note } from "@/app/cars/[id]/NotesThread";
import { FollowUpBadge } from "../bits";
import { FinanceWhatIf } from "./FinanceWhatIf";
import { SeatFitCard } from "./SeatFitCard";
import { getCarSeats, getSeatChecks } from "@/lib/seats";
import { hasThirdRow } from "@/lib/seatfit";
import { ContactCard, DeleteListing, DetailsCard, FeatureChecks, LogCard, QuotesCard, StatusPicker } from "./parts";

export default async function ListingPage({ params }: PageProps<"/listings/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const m = await requireMembership();
  const [detail, { prefs, ranked, removed, members, wishlist }] = await Promise.all([
    getListing(m.household.id, id),
    getComparison(m.household.id),
  ]);
  if (!detail) notFound();
  const { listing: l, contact, quotes, log, checks } = detail;
  const [carSeats, seatChecks] = await Promise.all([getCarSeats(m.household.id), getSeatChecks(m.household.id, id)]);

  const supabase = await createClient();
  const { data: noteRows } = await supabase
    .from("notes")
    .select("id, author_id, body, created_at, updated_at")
    .eq("household_id", m.household.id)
    .eq("listing_id", id)
    .order("created_at");
  const names = Object.fromEntries(members.map((x) => [x.user_id, x.display_name]));
  const notes: Note[] = (noteRows ?? []).map((n) => ({ ...n, author: names[n.author_id] ?? "Former member" }));

  const vehicle = ranked.find((r) => r.vehicle.id === l.vehicle_id)?.vehicle ?? removed.find((v) => v.id === l.vehicle_id);
  const cars = [...ranked.map((r) => r.vehicle), ...(vehicle && !ranked.some((r) => r.vehicle.id === vehicle.id) ? [vehicle] : [])]
    .map((v) => ({ id: v.id, name: `${v.make} ${v.model}` }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const match = vehicle ? matchFeatures(vehicle, wishlist, checks) : null;
  const terms = listingTerms(l, prefs);
  const defaultTerms = listingTerms({ ...l, apr_override: null, down_override: null, term_override: null }, prefs);
  const fin = {
    down_payment: prefs.down_payment,
    loan_months: prefs.loan_months,
    apr_used: prefs.apr_used,
    include_tax_fees: prefs.include_tax_fees,
    sales_tax_pct: prefs.sales_tax_pct,
    fees: prefs.fees,
  };
  const title = listingTitle(l);
  const now = today();

  return (
    <>
      <AppHeader membership={m} />
      <LiveRefresh householdId={m.household.id} tables={["listings", "contact_log", "quotes", "notes", "listing_feature_checks", "seat_fit_checks"]} />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 px-4 py-6">
        <Link href="/listings" className="text-sm font-medium text-accent hover:underline">
          ← Listings
        </Link>

        <section className="card space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Link href={`/cars/${l.vehicle_id}`} className="text-sm text-muted hover:underline">
                {l.vehicles.make} {l.vehicles.model}
              </Link>
              <h1 className="text-2xl font-bold leading-tight">{title}</h1>
              <p className="text-sm text-muted">
                {[l.dealer, l.miles != null ? `${l.miles.toLocaleString()} miles` : null, l.condition === "cpo" ? "Certified pre-owned" : l.condition === "new" ? "New" : "Used", l.accidents_owners]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {l.url && (
                <a href={l.url} target="_blank" rel="noreferrer noopener" className="mt-1 inline-block text-sm font-medium text-accent hover:underline">
                  Open the listing ↗
                </a>
              )}
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold tabular-nums">{l.asking_price != null ? usd(l.asking_price) : "No price"}</p>
              {l.follow_up_on && (
                <div className="mt-1">
                  <FollowUpBadge date={l.follow_up_on} today={now} />
                </div>
              )}
            </div>
          </div>
          <StatusPicker id={l.id} status={l.status} />
          {match && match.missingMust.length > 0 && (
            <p className="rounded-xl bg-coral-soft p-3 text-sm font-medium text-coral">
              Missing must-have: {match.missingMust.map((x) => x.name).join(", ")}
            </p>
          )}
        </section>

        <FinanceWhatIf
          listingId={l.id}
          askingPrice={l.asking_price}
          saved={{ apr: terms.apr, down: terms.down, months: terms.months }}
          defaults={{ apr: defaultTerms.apr, down: defaultTerms.down, months: defaultTerms.months }}
          hasOverrides={l.apr_override != null || l.down_override != null || l.term_override != null}
          conditionLabel={l.condition === "cpo" ? "CPO" : l.condition}
          fin={fin}
          quotes={quotes.map((q) => ({ id: q.id, otd_price: q.otd_price, apr_offered: q.apr_offered, quoted_on: q.quoted_on }))}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <ContactCard listingId={l.id} contact={contact} fallbackDealer={l.dealer} />
          <LogCard listingId={l.id} log={log.map((e) => ({ ...e, author: names[e.author_id] ?? "Former member", mine: e.author_id === m.userId }))} followUp={l.follow_up_on} today={now} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <QuotesCard listingId={l.id} quotes={quotes} today={now} />
          {match && (
            <FeatureChecks
              listingId={l.id}
              items={wishlist.filter((w) => w.tier !== "dont_care").map((w) => ({ id: w.id, name: w.name, tier: w.tier, status: match.statuses[w.id], checked: checks[w.id] }))}
            />
          )}
        </div>

        <SeatFitCard listingId={l.id} seats={carSeats} checks={seatChecks} names={{}} third={hasThirdRow(vehicle?.seats)} />

        <NotesThread vehicleId={l.vehicle_id} listingId={l.id} notes={notes} myId={m.userId} />

        <DetailsCard cars={cars} listing={l} />
        <DeleteListing id={l.id} />
      </main>
    </>
  );
}
