"use client";

import Link from "next/link";
import { useState } from "react";
import { TermsControls, costOf, usd, type Terms } from "@/components/FinanceControls";
import { bestIndexes, type Financing } from "@/lib/calc";

export type FinanceListing = { id: string; title: string; sub: string; status: string; terms: Terms };

const MAX = 4;

/**
 * Pick 2-4 listings and tweak each one's price, APR, down payment and term to see monthly payment,
 * total interest and total cost side by side, with the gap to the cheapest highlighted.
 * Nothing here is saved: it's for answering "what if the new one is 2.9% and the used one 7.5%?".
 */
export function FinanceCompare({ listings, fin }: { listings: FinanceListing[]; fin: Financing }) {
  const priced = listings.filter((l) => l.terms.price > 0);
  const [picked, setPicked] = useState<string[]>(priced.slice(0, MAX).map((l) => l.id));
  const [edits, setEdits] = useState<Record<string, Terms>>({});

  const cols = picked.flatMap((id) => {
    const l = listings.find((x) => x.id === id);
    if (!l) return [];
    const t = edits[id] ?? l.terms;
    return [{ l, t, cost: costOf(t, fin), edited: edits[id] != null }];
  });
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX ? p : [...p, id]));

  const rows = [
    { label: "Monthly payment", get: (c: (typeof cols)[number]) => c.cost.monthly, suffix: "/mo" },
    { label: "Total interest", get: (c: (typeof cols)[number]) => c.cost.totalInterest, suffix: "" },
    { label: "Total cost", get: (c: (typeof cols)[number]) => c.cost.totalCost, suffix: "" },
  ];

  if (priced.length < 2)
    return (
      <p className="card text-sm text-muted">
        Add an asking price to at least two active listings to compare how they finance. You have {priced.length} so far.
      </p>
    );

  return (
    <div className="space-y-4">
      <fieldset className="card space-y-2">
        <legend className="px-1 text-sm font-semibold">Pick 2 to {MAX} listings</legend>
        <ul className="grid gap-1 sm:grid-cols-2">
          {priced.map((l) => {
            const on = picked.includes(l.id);
            const full = !on && picked.length >= MAX;
            return (
              <li key={l.id}>
                <label className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 ${full ? "opacity-50" : "hover:bg-surface-2"}`}>
                  <input type="checkbox" className="size-4 accent-accent" checked={on} disabled={full} onChange={() => toggle(l.id)} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{l.title}</span>
                    <span className="block truncate text-xs text-muted">{l.sub}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      {cols.length < 2 ? (
        <p className="card text-sm text-muted">Pick at least two listings.</p>
      ) : (
        <>
          <div className={`grid gap-4 ${cols.length === 2 ? "md:grid-cols-2" : cols.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2 lg:grid-cols-4"}`}>
            {cols.map((c) => (
              <section key={c.l.id} className="card space-y-3">
                <div>
                  <Link href={`/listings/${c.l.id}`} className="font-semibold text-accent hover:underline">
                    {c.l.title}
                  </Link>
                  <p className="text-xs text-muted">{c.l.sub}</p>
                </div>
                <TermsControls value={c.t} onChange={(t) => setEdits((e) => ({ ...e, [c.l.id]: t }))} idPrefix={`fc-${c.l.id}`} />
                {c.edited && (
                  <button
                    type="button"
                    className="text-sm font-medium text-accent hover:underline"
                    onClick={() =>
                      setEdits((e) => {
                        const { [c.l.id]: _gone, ...rest } = e;
                        void _gone;
                        return rest;
                      })
                    }
                  >
                    Reset to its saved terms
                  </button>
                )}
              </section>
            ))}
          </div>

          <div className="card overflow-x-auto p-0" aria-live="polite">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-surface p-3 text-left text-xs font-medium uppercase tracking-wide text-muted">Over the loan</th>
                  {cols.map((c) => (
                    <th key={c.l.id} className="min-w-32 border-l border-border p-3 text-left font-semibold">
                      {c.l.title}
                      <span className="block text-xs font-normal text-muted">
                        {c.t.apr}% · {c.t.months} mo · {usd(c.t.down)} down
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const vals = cols.map(r.get);
                  const best = new Set(bestIndexes(vals, "low"));
                  const min = Math.min(...vals);
                  return (
                    <tr key={r.label}>
                      <th className="sticky left-0 z-10 border-t border-border bg-surface p-3 text-left font-medium">{r.label}</th>
                      {vals.map((v, i) => (
                        <td key={cols[i].l.id} className={`border-l border-t border-border p-3 tabular-nums ${best.has(i) ? "bg-best font-semibold text-best-foreground" : ""}`}>
                          {usd(v)}
                          {r.suffix}
                          {!best.has(i) && Math.round(v - min) > 0 && <span className="block text-xs font-normal text-coral">+{usd(v - min)} vs cheapest</span>}
                          {best.has(i) && <span className="block text-xs font-normal">Cheapest</span>}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
