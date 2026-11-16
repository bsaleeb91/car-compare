import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { CompareTable, usd } from "@/components/CompareTable";
import { requireMembership } from "@/lib/session";
import { getComparison } from "@/lib/data";
import { RemovedList } from "@/components/RemovedList";

export const metadata = { title: "Compare · Car Compare" };

export default async function ComparePage() {
  const m = await requireMembership();
  const { prefs, ranked, current, removed } = await getComparison(m.household.id);
  const order = [...ranked].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const cols = [...order.map((r) => ({ ...r, isCurrent: false })), ...(current ? [{ vehicle: current, score: null, complete: false, rank: null, avg: {}, isCurrent: true }] : [])];
  const noGarage = prefs.garage_depth_in == null;

  return (
    <>
      <AppHeader membership={m} />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 px-4 py-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Compare</h1>
            <p className="text-sm text-muted">
              Ranked by your weighted score. <span className="chip bg-best text-best-foreground">Green</span> marks the best
              in each row.
            </p>
          </div>
          <Link href="/scores" className="btn-primary text-sm">
            Edit scores
          </Link>
        </div>

        {noGarage && (
          <p className="card border-amber/40 bg-amber-soft text-sm">
            Add your garage measurements in <Link href="/preferences" className="font-medium underline">Preferences</Link> to
            see which cars fit.
          </p>
        )}

        {cols.length === 0 ? (
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
