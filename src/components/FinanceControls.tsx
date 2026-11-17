"use client";

import { loanCost, type Financing } from "@/lib/calc";

export type Terms = { price: number; apr: number; down: number; months: number };

export const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** Price, APR, down payment and term for a what-if: a typed number plus a slider for each. */
export function TermsControls({
  value,
  onChange,
  idPrefix,
  hidePrice = false,
}: {
  value: Terms;
  onChange: (t: Terms) => void;
  idPrefix: string;
  hidePrice?: boolean;
}) {
  const set = (k: keyof Terms, raw: string) => onChange({ ...value, [k]: raw === "" ? 0 : Number(raw) });
  const priceMax = Math.max(80000, Math.ceil((value.price + 20000) / 10000) * 10000);
  const downMax = Math.max(value.price, 1000);
  const rows: { k: keyof Terms; label: string; min: number; max: number; step: number; suffix: string; hide?: boolean }[] = [
    { k: "price", label: "Price", min: 0, max: priceMax, step: 100, suffix: "$", hide: hidePrice },
    { k: "apr", label: "APR", min: 0, max: 15, step: 0.1, suffix: "%" },
    { k: "down", label: "Down payment", min: 0, max: downMax, step: 500, suffix: "$" },
    { k: "months", label: "Term (months)", min: 12, max: 96, step: 6, suffix: "mo" },
  ];
  return (
    <div className="space-y-3">
      {rows
        .filter((r) => !r.hide)
        .map((r) => {
          const id = `${idPrefix}-${r.k}`;
          return (
            <div key={r.k}>
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={id} className="text-sm font-medium">
                  {r.label}
                </label>
                <span className="flex items-center gap-1 text-sm">
                  {r.suffix === "$" && <span className="text-muted">$</span>}
                  <input
                    id={id}
                    type="number"
                    inputMode="decimal"
                    min={r.min}
                    step={r.step}
                    value={value[r.k]}
                    onChange={(e) => set(r.k, e.target.value)}
                    className="input !min-h-9 w-24 !px-2 !py-1 text-right tabular-nums"
                  />
                  {r.suffix !== "$" && <span className="w-5 text-muted">{r.suffix}</span>}
                </span>
              </div>
              <input
                type="range"
                aria-label={r.label}
                min={r.min}
                max={r.max}
                step={r.step}
                value={Math.min(Math.max(value[r.k], r.min), r.max)}
                onChange={(e) => set(r.k, e.target.value)}
                className="mt-1 w-full accent-accent"
              />
            </div>
          );
        })}
    </div>
  );
}

export function costOf(t: Terms, p: Financing) {
  return loanCost(t.price, t.apr, t.down, t.months, p);
}
