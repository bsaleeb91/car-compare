import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { CompareTable, usd } from "@/components/CompareTable";
import { requireMembership } from "@/lib/session";
import { getComparison } from "@/lib/data";
import { matchFeatures } from "@/lib/features";
import { RemovedList } from "@/components/RemovedList";
import { LiveRefresh } from "@/components/LiveRefresh";
import { TrimTable } from "@/components/TrimTable";
import { getTrims } from "@/lib/trims";
import { StageProgress } from "@/components/StageProgress";
import { getFlowState } from "@/lib/flow-data";
import { trimsInScope } from "@/lib/flow";

export const metadata = { title: "Compare · Car Compare" };

export default async function ComparePage({ searchParams }: PageProps<"/compare">) {
  const { view, all } = await searchParams;
  const trimsView = view === "trims";
  const m = await requireMembership();
  const [{ prefs, ranked, current, removed, wishlist }, flow] = await Promise.all([getComparison(m.household.id), getFlowState(m.household.id)]);
  const finalistSet = new Set(flow.finalistIds);
  const showAll = all === "1";
  const order = [...ranked].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const cols = [...order.map((r) => ({ ...r, isCurrent: false, finalist: finalistSet.has(r.vehicle.id), match: matchFeatures(r.vehicle, wishlist) })), ...(current ? [{ vehicle: current, score: null, complete: false, rank: null, avg: {}, isCurrent: true }] : [])];
  const noGarage = prefs.garage_depth_in == null;
  const byId = new Map(order.map((r) => [r.vehicle.id, r.vehicle]));
  const scope = trimsInScope([...byId.keys()], flow.finalistIds, showAll);
  const trimCols = trimsView && !scope.locked
    ? (await getTrims(m.household.id, scope.ids)).flatMap(({ trim, status }) => {
        const vehicle = byId.get(trim.vehicle_id);
        return vehicle ? [{ trim, vehicle, status }] : [];
      })
    : [];

  return (
    <>
      <AppHeader membership={m} />
      <LiveRefresh householdId={m.household.id} tables={["scores", "shortlist", "preferences", "wishlist_items", "trim_shortlist", "listings"]} />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 px-4 py-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Compare</h1>
            <p className="text-sm text-muted">
              Ranked by your weighted score. Click a car for details and its test drive. <span className="chip bg-best text-best-foreground">Green</span> marks the best
              in each row.
            </p>
          </div>
          <Link href="/scores" className="btn-primary text-sm">
            Edit scores
          </Link>
        </div>

        <StageProgress counts={flow.counts} current={trimsView ? "trims" : "models"} />

        <div className="flex gap-1 rounded-2xl bg-surface-2 p-1 sm:w-fit" role="tablist" aria-label="Compare by">
          {[
            { key: "models", label: "Models", href: "/compare" },
            { key: "trims", label: "Trims", href: "/compare?view=trims" },
          ].map((t) => {
            const on = (t.key === "trims") === trimsView;
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

        {noGarage && (
          <p className="card border-amber/40 bg-amber-soft text-sm">
            Add your garage measurements in <Link href="/preferences" className="font-medium underline">Preferences</Link> to
            see which cars fit.
          </p>
        )}

        {trimsView && scope.locked ? (
          <section className="card space-y-2">
            <h2 className="font-semibold">Pick your finalists first</h2>
            <p className="text-sm text-muted">
              Trims open once you have narrowed the models. Mark one or more cars as finalists in Models, and their trims show up here.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/compare" className="btn-primary text-sm">
                Choose finalists
              </Link>
              <Link href="/compare?view=trims&all=1" className="btn-secondary text-sm">
                Show every car&apos;s trims anyway
              </Link>
            </div>
          </section>
        ) : trimsView ? (
          trimCols.length === 0 ? (
            <p className="card text-muted">No trims are recorded for these cars yet. Odyssey trims are in; more are coming.</p>
          ) : (
            <>
              <p className="text-sm text-muted">
                {scope.narrowed ? "Trims of your finalists" : "Every trim of the cars on your list"}, side by side. Mark the ones worth shopping for as targets.{" "}
                {scope.narrowed ? (
                  <Link href="/compare?view=trims&all=1" className="font-medium text-accent hover:underline">
                    Show every car&apos;s trims
                  </Link>
                ) : flow.finalistIds.length > 0 ? (
                  <Link href="/compare?view=trims" className="font-medium text-accent hover:underline">
                    Back to finalists only
                  </Link>
                ) : null}
              </p>
              <TrimTable prefs={prefs} cols={trimCols} wishlist={wishlist} />
            </>
          )
        ) : cols.length === 0 ? (
          <p className="card text-muted">Your list is empty. Put cars back from the removed list below.</p>
        ) : (
          <CompareTable prefs={prefs} cols={cols} />
        )}

        {removed.length > 0 && <RemovedList removed={removed} />}

        <p className="text-xs text-muted">
          Specs are manufacturer figures for each model&apos;s current generation and not yet verified: confirm on the window
          sticker. Cargo is each brand&apos;s own measurement. Payments use {prefs.apr_used}% APR over {prefs.loan_months} months
          with {usd(prefs.down_payment)} down; fuel uses {prefs.miles_per_year.toLocaleString()} miles a year at $
          {prefs.gas_price.toFixed(2)}/gal. Change these in <Link href="/preferences" className="underline">Preferences</Link>.
        </p>
      </main>
    </>
  );
}
