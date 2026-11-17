import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { LiveRefresh } from "@/components/LiveRefresh";
import { usd } from "@/components/CompareTable";
import { requireMembership } from "@/lib/session";
import { getComparison } from "@/lib/data";
import { LISTING_STATUSES, getListings, listingTitle, today } from "@/lib/listings";
import { daysUntil, listingCost, listingTerms } from "@/lib/calc";
import { AddListing } from "./AddListing";
import { FinanceCompare } from "./FinanceCompare";
import { FollowUpBadge, StatusChip } from "./bits";

export const metadata = { title: "Listings · Car Compare" };

export default async function ListingsPage({ searchParams }: PageProps<"/listings">) {
  const sp = await searchParams;
  const m = await requireMembership();
  const [{ prefs, ranked }, listings] = await Promise.all([getComparison(m.household.id), getListings(m.household.id)]);
  const filter = typeof sp.status === "string" && LISTING_STATUSES.some((s) => s.key === sp.status) ? sp.status : null;
  const addFor = typeof sp.add === "string" ? sp.add : undefined;
  const cars = ranked.map((r) => ({ id: r.vehicle.id, name: `${r.vehicle.make} ${r.vehicle.model}` })).sort((a, b) => a.name.localeCompare(b.name));
  const now = today();
  const finance = sp.view === "finance";
  const fin = {
    down_payment: prefs.down_payment,
    loan_months: prefs.loan_months,
    apr_used: prefs.apr_used,
    include_tax_fees: prefs.include_tax_fees,
    sales_tax_pct: prefs.sales_tax_pct,
    fees: prefs.fees,
  };
  const financeListings = listings
    .filter((l) => l.status !== "passed")
    .map((l) => {
      const t = listingTerms(l, prefs);
      return {
        id: l.id,
        title: listingTitle(l),
        sub: [l.condition === "cpo" ? "CPO" : l.condition === "new" ? "New" : "Used", l.dealer, l.asking_price != null ? usd(l.asking_price) : null].filter(Boolean).join(" · "),
        status: l.status,
        terms: { price: l.asking_price ?? 0, apr: t.apr, down: t.down, months: t.months },
      };
    });

  const shown = listings
    .filter((l) => (filter ? l.status === filter : l.status !== "passed"))
    .sort((a, b) => {
      // Follow-ups that are due float to the top, soonest first.
      const da = a.follow_up_on ? daysUntil(a.follow_up_on, now) : 9999;
      const db = b.follow_up_on ? daysUntil(b.follow_up_on, now) : 9999;
      return Math.min(da, 9999) - Math.min(db, 9999) || b.created_at.localeCompare(a.created_at);
    });
  const counts = Object.fromEntries(LISTING_STATUSES.map((s) => [s.key, listings.filter((l) => l.status === s.key).length]));
  const active = listings.filter((l) => l.status !== "passed").length;

  return (
    <>
      <AppHeader membership={m} />
      <LiveRefresh householdId={m.household.id} tables={["listings", "contact_log", "quotes"]} />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold">Listings</h1>
          <p className="text-sm text-muted">Real cars for sale you&apos;re tracking, with dealer contacts, quotes and follow-ups.</p>
        </div>

        <div className="flex gap-1 rounded-2xl bg-surface-2 p-1 sm:w-fit" role="tablist" aria-label="Listings view">
          {[
            { key: "list", label: "Cards", href: "/listings" },
            { key: "finance", label: "Compare financing", href: "/listings?view=finance" },
          ].map((t) => {
            const on = (t.key === "finance") === finance;
            return (
              <Link
                key={t.key}
                href={t.href}
                role="tab"
                aria-selected={on}
                className={`flex-1 rounded-xl px-5 py-1.5 text-center text-sm font-medium transition sm:flex-none ${on ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"}`}
              >
                {t.label}
              </Link>
            );
          })}
        </div>

        {finance ? (
          <FinanceCompare listings={financeListings} fin={fin} />
        ) : (
          <>
        <AddListing cars={cars} openFor={addFor} />

        <nav className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" aria-label="Filter by status">
          <FilterChip href="/listings" active={!filter} label={`Active · ${active}`} />
          {LISTING_STATUSES.map((s) => (
            <FilterChip key={s.key} href={`/listings?status=${s.key}`} active={filter === s.key} label={`${s.label} · ${counts[s.key]}`} />
          ))}
        </nav>

        {shown.length === 0 ? (
          <p className="card text-sm text-muted">
            {listings.length === 0 ? "No listings yet. Paste a link above when you find a car for sale." : "Nothing here."}
          </p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {shown.map((l) => {
              const cost = listingCost(l, prefs);
              return (
                <li key={l.id}>
                  <Link href={`/listings/${l.id}`} className="card block h-full transition hover:-translate-y-0.5 hover:shadow-lg">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{listingTitle(l)}</p>
                        <p className="truncate text-sm text-muted">
                          {[l.dealer, l.miles != null ? `${l.miles.toLocaleString()} mi` : null, l.condition === "cpo" ? "CPO" : l.condition === "new" ? "New" : null]
                            .filter(Boolean)
                            .join(" · ") || "No details yet"}
                        </p>
                      </div>
                      <StatusChip status={l.status} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
                      <div>
                        <p className="text-xl font-bold tabular-nums">{l.asking_price != null ? usd(l.asking_price) : "—"}</p>
                        {cost && <p className="text-sm text-muted tabular-nums">{usd(cost.monthly)}/mo at {cost.apr}%</p>}
                      </div>
                      {l.follow_up_on && <FollowUpBadge date={l.follow_up_on} today={now} />}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
          </>
        )}
      </main>
    </>
  );
}

function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition ${
        active ? "bg-accent text-accent-foreground shadow-sm" : "bg-surface text-muted ring-1 ring-border hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  );
}
