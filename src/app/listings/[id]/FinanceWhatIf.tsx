"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TermsControls, costOf, usd, type Terms } from "@/components/FinanceControls";
import type { Financing } from "@/lib/calc";
import { saveListingTermsAction } from "../actions";

type Quote = { id: string; otd_price: number | null; apr_offered: number | null; quoted_on: string };

const same = (a: Terms, b: Terms) => a.price === b.price && a.apr === b.apr && a.down === b.down && a.months === b.months;

/**
 * Live payment calculator for one listing. Moving anything updates the numbers instantly and
 * saves nothing; "Save these terms" keeps the APR, down payment and term as this listing's own,
 * and "Back to my defaults" clears them. Price is for what-ifs only (change the real one in Details).
 */
export function FinanceWhatIf({
  askingPrice,
  saved,
  defaults,
  hasOverrides,
  listingId,
  fin,
  quotes,
  conditionLabel,
}: {
  askingPrice: number | null;
  saved: { apr: number; down: number; months: number };
  defaults: { apr: number; down: number; months: number };
  hasOverrides: boolean;
  listingId: string;
  fin: Financing;
  quotes: Quote[];
  conditionLabel: string;
}) {
  const base: Terms = { price: askingPrice ?? 0, ...saved };
  const [t, setT] = useState<Terms>(base);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const cost = costOf(t, fin);
  const now = costOf(base, fin);
  const termsChanged = t.apr !== saved.apr || t.down !== saved.down || t.months !== saved.months;
  const moved = !same(t, base);

  function save(next: { apr: number; down: number; months: number } | null) {
    setError(null);
    start(async () => {
      const res = await saveListingTermsAction({
        id: listingId,
        apr: next && next.apr !== defaults.apr ? next.apr : null,
        down: next && next.down !== defaults.down ? next.down : null,
        months: next && next.months !== defaults.months ? next.months : null,
      });
      if ("error" in res) setError(res.error);
      else router.refresh();
    });
  }

  const delta = (a: number, b: number) => {
    const d = Math.round(a - b);
    return d === 0 ? null : (
      <span className={`ml-2 text-xs font-medium ${d < 0 ? "text-success" : "text-coral"}`}>
        {d < 0 ? "−" : "+"}
        {usd(Math.abs(d))}
      </span>
    );
  };

  return (
    <section className="card space-y-4" aria-labelledby="finance-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="finance-h" className="font-semibold">
          Payment what-ifs
        </h2>
        <p className="text-xs text-muted">
          {hasOverrides ? "Using this listing's own terms." : `Starting from your ${conditionLabel} defaults.`} Moving a slider saves nothing.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <TermsControls value={t} onChange={setT} idPrefix="wi" />
        <div className="space-y-3 max-md:order-first">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Monthly" value={`${usd(cost.monthly)}`} sub="/mo" delta={moved ? delta(cost.monthly, now.monthly) : null} big />
            <Stat label="Total interest" value={usd(cost.totalInterest)} delta={moved ? delta(cost.totalInterest, now.totalInterest) : null} />
            <Stat label="Total cost" value={usd(cost.totalCost)} delta={moved ? delta(cost.totalCost, now.totalCost) : null} />
          </div>
          {askingPrice == null && t.price === 0 && <p className="text-sm text-muted">Enter a price to see a payment.</p>}
          {quotes.some((q) => q.otd_price != null || q.apr_offered != null) && (
            <div>
              <p className="text-sm font-medium">Try a quote</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {quotes
                  .filter((q) => q.otd_price != null || q.apr_offered != null)
                  .map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setT({ ...t, price: q.otd_price ?? t.price, apr: q.apr_offered ?? t.apr })}
                      className="btn-secondary min-h-9 px-3 text-sm"
                    >
                      {[q.otd_price != null ? usd(q.otd_price) : null, q.apr_offered != null ? `${q.apr_offered}%` : null].filter(Boolean).join(" at ")}
                    </button>
                  ))}
              </div>
              {fin.include_tax_fees && (
                <p className="mt-1 text-xs text-muted">Quotes are out-the-door, so tax and fees get added again here. Turn them off in Preferences to compare quotes exactly.</p>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" className="btn-primary min-h-10 px-4 text-sm" disabled={pending || !termsChanged} onClick={() => save(t)}>
              {pending ? "Saving…" : "Save these terms"}
            </button>
            {moved && (
              <button type="button" className="btn-secondary min-h-10 px-4 text-sm" disabled={pending} onClick={() => setT(base)}>
                Undo changes
              </button>
            )}
            {hasOverrides && (
              <button
                type="button"
                className="btn-secondary min-h-10 px-4 text-sm"
                disabled={pending}
                onClick={() => {
                  setT({ ...t, ...defaults });
                  save(null);
                }}
              >
                Back to my defaults
              </button>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, sub, delta, big = false }: { label: string; value: string; sub?: string; delta: React.ReactNode; big?: boolean }) {
  return (
    <div className="rounded-xl bg-surface-2 p-3" aria-live="polite">
      <p className="text-xs text-muted">{label}</p>
      <p className={`font-bold tabular-nums ${big ? "text-2xl" : "text-lg"}`}>
        {value}
        {sub && <span className="text-sm font-normal text-muted">{sub}</span>}
      </p>
      <p className="min-h-4">{delta}</p>
    </div>
  );
}
