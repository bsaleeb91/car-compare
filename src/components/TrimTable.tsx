import Link from "next/link";
import { TypeChip, UnverifiedBadge } from "@/components/chips";
import { TrimTargetButton } from "@/components/TrimTargetButton";
import { usd } from "@/components/CompareTable";
import type { Preferences, Vehicle } from "@/lib/data";
import type { Trim, TrimStatus } from "@/lib/trims";
import { matchFeatures, trimChecks, type WishItem } from "@/lib/features";
import { amountFinanced, bestIndexes, budgetFit, monthlyPayment } from "@/lib/calc";

export type TrimCol = { trim: Trim; vehicle: Vehicle; status: TrimStatus | null };

const FIT = {
  in: { label: "In budget", cls: "bg-best text-best-foreground" },
  over: { label: "Over budget", cls: "bg-coral-soft text-coral" },
  under: { label: "Under budget", cls: "bg-surface-2 text-muted" },
} as const;

const mid = (t: Trim) => (t.price_low != null && t.price_high != null ? (t.price_low + t.price_high) / 2 : (t.price_low ?? t.price_high));

/** Side-by-side trims, across models: price, payment, budget fit, and each wishlist feature the trim does or doesn't have. */
export function TrimTable({ prefs, cols, wishlist }: { prefs: Preferences; cols: TrimCol[]; wishlist: WishItem[] }) {
  const wanted = wishlist.filter((w) => w.tier !== "dont_care");
  const matches = cols.map((c) => matchFeatures(c.vehicle, wishlist, trimChecks(c.trim.features, wishlist)));
  const pay = cols.map((c) => {
    const p = mid(c.trim);
    return p == null ? null : monthlyPayment(amountFinanced(p, prefs), prefs.apr_used, prefs.loan_months);
  });
  const bestPay = new Set(bestIndexes(pay, "low"));
  const th = "sticky left-0 z-10 border-t border-border bg-surface p-3 text-left align-top font-medium group-hover:bg-surface-2";
  const td = "border-l border-t border-border p-3 align-top group-hover:bg-surface-2/50";

  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 w-40 min-w-36 bg-surface p-3 text-left align-bottom text-xs font-medium uppercase tracking-wide text-muted">
              {cols.length} trims
            </th>
            {cols.map((c) => (
              <th key={c.trim.id} className={`min-w-40 border-l border-border p-3 text-left align-top font-normal ${c.status === "target" ? "bg-accent-soft" : ""}`}>
                <TypeChip type={c.vehicle.type} />
                <Link href={`/cars/${c.vehicle.id}`} className="group/name mt-2 block">
                  <span className="block text-xs text-muted">
                    {c.vehicle.make} {c.vehicle.model}
                  </span>
                  <span className="block text-base font-semibold leading-tight text-accent group-hover/name:underline">{c.trim.name}</span>
                </Link>
                <span className="block text-xs text-muted">{c.trim.model_years}</span>
                {!c.trim.specs_verified && <UnverifiedBadge />}
                <div className="mt-2">
                  <TrimTargetButton trimId={c.trim.id} target={c.status === "target"} />
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="group">
            <th className={th}>Used price</th>
            {cols.map((c) => {
              const f = budgetFit(c.trim, prefs.budget_min, prefs.budget_max);
              const none = c.trim.price_low == null && c.trim.price_high == null;
              return (
                <td key={c.trim.id} className={`${td} tabular-nums`}>
                  {none ? "—" : `${c.trim.price_low != null ? usd(c.trim.price_low) : "?"}–${c.trim.price_high != null ? usd(c.trim.price_high) : "?"}`}
                  {f && <span className={`chip mt-1 block w-fit ${FIT[f].cls}`}>{FIT[f].label}</span>}
                </td>
              );
            })}
          </tr>
          <tr className="group">
            <th className={th}>
              Monthly payment
              <span className="block text-xs font-normal text-muted">At the middle of the range</span>
            </th>
            {cols.map((c, i) => (
              <td key={c.trim.id} className={`${td} tabular-nums ${bestPay.has(i) ? "bg-best font-semibold text-best-foreground" : ""}`}>
                {pay[i] == null ? "—" : `${usd(pay[i]!)}/mo`}
              </td>
            ))}
          </tr>
          <tr className="group">
            <th className={th}>Adds</th>
            {cols.map((c) => (
              <td key={c.trim.id} className={`${td} text-xs`}>
                {c.trim.key_features.length ? c.trim.key_features.join(" · ") : "—"}
              </td>
            ))}
          </tr>
          <tr className="group">
            <th className={th}>
              Must-haves
              <span className="block text-xs font-normal text-muted">From your Preferences</span>
            </th>
            {matches.map((mt, i) => (
              <td key={cols[i].trim.id} className={td}>
                {mt.mustTotal === 0 ? (
                  <Link href="/preferences#must-haves" className="text-xs font-medium text-accent hover:underline">
                    Pick must-haves
                  </Link>
                ) : mt.missingMust.length ? (
                  <span className="font-semibold text-coral">Missing: {mt.missingMust.map((x) => x.name).join(", ")}</span>
                ) : (
                  <span>
                    <span className="font-semibold text-success">None missing</span>
                    {mt.mustToCheck.length > 0 && <span className="block text-xs text-muted">{mt.mustToCheck.length} to check on the car</span>}
                  </span>
                )}
              </td>
            ))}
          </tr>
          {wanted.length > 0 && (
            <tr>
              <th colSpan={cols.length + 1} className="sticky left-0 bg-surface px-3 pb-1 pt-5 text-left text-xs font-semibold uppercase tracking-wide">
                Your features
              </th>
            </tr>
          )}
          {wanted.map((w) => (
            <tr key={w.id} className="group">
              <th className={th}>
                {w.name}
                <span className={`block text-xs font-normal ${w.tier === "must_have" ? "text-coral" : "text-teal"}`}>
                  {w.tier === "must_have" ? "must" : "nice"}
                </span>
              </th>
              {matches.map((mt, i) => {
                const s = mt.statuses[w.id];
                return (
                  <td key={cols[i].trim.id} className={td}>
                    {s === "yes" ? (
                      <span className="font-medium text-success">Yes</span>
                    ) : s === "no" ? (
                      <span className="text-muted">No</span>
                    ) : (
                      <span className="chip bg-surface-2 text-muted">Check car</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
