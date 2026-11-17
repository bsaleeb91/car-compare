import Link from "next/link";
import { TypeChip, FitChip, ScoreBadge } from "@/components/chips";
import { ShortlistButton } from "@/components/ShortlistButton";
import { FinalistButton } from "@/components/FinalistButton";
import type { Vehicle, Preferences } from "@/lib/data";
import type { FeatureMatch } from "@/lib/features";
import { amountFinanced, annualFuelCost, bestIndexes, garageFit, monthlyPayment } from "@/lib/calc";

export type Column = {
  vehicle: Vehicle;
  score: number | null;
  complete: boolean;
  rank: number | null;
  isCurrent: boolean;
  testDrive?: number | null;
  match?: FeatureMatch;
  finalist?: boolean;
};

type Cell = number | string | boolean | null;
type Row = {
  label: string;
  hint?: string;
  get: (v: Vehicle, p: Preferences, c: Column) => Cell;
  fmt?: (x: Cell, v: Vehicle, p: Preferences, c?: Column) => React.ReactNode;
  better?: "high" | "low";
};
type Group = { title: string; color: string; rows: Row[] };

export const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const unit = (u: string) => (x: Cell) => (x == null ? "—" : `${Number(x).toLocaleString()}${u}`);
const yesNo = (x: Cell) =>
  x == null ? "—" : x ? <span className="font-medium text-success">Yes</span> : <span className="text-muted">No</span>;
const mid = (v: Vehicle) => (v.price_low != null && v.price_high != null ? (v.price_low + v.price_high) / 2 : (v.price_low ?? v.price_high));

const names = (xs: { name: string }[]) => xs.map((x) => x.name).join(", ");

const groups: Group[] = [
  {
    title: "Must-haves",
    color: "bg-coral",
    rows: [
      {
        label: "Must-haves",
        hint: "From your Preferences",
        get: (_v, _p, c) => (c.match ? c.match.missingMust.length : null),
        fmt: (_x, _v, _p, c) => {
          const mt = c?.match;
          if (!mt || mt.mustTotal === 0)
            return (
              <Link href="/preferences#must-haves" className="text-xs font-medium text-accent hover:underline">
                Pick must-haves
              </Link>
            );
          if (mt.missingMust.length)
            return <span className="font-semibold text-coral">Missing: {names(mt.missingMust)}</span>;
          return (
            <span>
              <span className="font-semibold text-success">None missing</span>
              {mt.mustToCheck.length > 0 && (
                <span className="block text-xs text-muted" title={names(mt.mustToCheck)}>
                  {mt.mustToCheck.length} to check on the trim
                </span>
              )}
            </span>
          );
        },
      },
      {
        label: "Nice-to-haves",
        get: (_v, _p, c) => (c.match && c.match.niceTotal ? c.match.niceHave : null),
        fmt: (_x, _v, _p, c) => {
          const mt = c?.match;
          if (!mt || mt.niceTotal === 0) return <span className="text-muted">—</span>;
          return (
            <span>
              {mt.niceHave} of {mt.niceTotal}
              {mt.niceToCheck > 0 && <span className="block text-xs font-normal text-muted">{mt.niceToCheck} to check on the trim</span>}
            </span>
          );
        },
        better: "high",
      },
    ],
  },
  {
    title: "Test drive",
    color: "bg-success",
    rows: [
      {
        label: "Test-drive average",
        hint: "Everyone's scorecards, out of 5",
        get: (_v, _p, c) => (c.isCurrent ? null : (c.testDrive ?? null)),
        fmt: (x, v) =>
          x == null ? (
            <Link href={`/cars/${v.id}/test-drive`} className="text-xs font-medium text-accent hover:underline">
              Not driven yet
            </Link>
          ) : (
            `${Number(x).toFixed(1)} / 5`
          ),
        better: "high",
      },
    ],
  },
  {
    title: "Space",
    color: "bg-accent",
    rows: [
      { label: "Cargo behind 3rd row", hint: "The road-trip number", get: (v) => v.cargo_3rd, fmt: unit(" cu ft"), better: "high" },
      { label: "Cargo behind 2nd row", get: (v) => v.cargo_2nd, fmt: unit(" cu ft"), better: "high" },
      { label: "Max cargo", get: (v) => v.cargo_max, fmt: unit(" cu ft"), better: "high" },
      { label: "3rd-row legroom", get: (v) => v.third_row_legroom_in, fmt: unit(" in"), better: "high" },
      { label: "Seats", get: (v) => v.seats, fmt: unit(""), better: "high" },
      { label: "Sliding doors", get: (v) => v.sliding_doors, fmt: yesNo },
    ],
  },
  {
    title: "Garage & size",
    color: "bg-teal",
    rows: [
      {
        label: "Garage fit",
        get: (v, p) => garageFit(p, v).status,
        fmt: (_x, v, p) => {
          const f = garageFit(p, v);
          return (
            <span className="flex flex-col items-start gap-0.5">
              <FitChip status={f.status} />
              {f.depthLeft != null && <span className="text-xs text-muted">{f.depthLeft} in to spare</span>}
            </span>
          );
        },
      },
      { label: "Length", get: (v) => v.length_in, fmt: unit(" in"), better: "low" },
      { label: "Width (no mirrors)", get: (v) => v.width_in, fmt: unit(" in"), better: "low" },
      { label: "Height", get: (v) => v.height_in, fmt: unit(" in"), better: "low" },
      { label: "Ground clearance", get: (v) => v.ground_clearance_in, fmt: unit(" in"), better: "high" },
    ],
  },
  {
    title: "Powertrain",
    color: "bg-amber",
    rows: [
      { label: "MPG (combined)", get: (v) => v.mpg_combined, fmt: unit(""), better: "high" },
      { label: "Horsepower", get: (v) => v.hp, fmt: unit(" hp"), better: "high" },
      { label: "Hybrid available", get: (v) => v.hybrid_available, fmt: yesNo },
      { label: "AWD available", get: (v) => v.awd_available, fmt: yesNo },
      { label: "Max towing", get: (v) => v.towing_lbs, fmt: unit(" lb"), better: "high" },
    ],
  },
  {
    title: "Cost",
    color: "bg-coral",
    rows: [
      {
        label: "Used asking price",
        get: (v) => mid(v),
        fmt: (_x, v) =>
          v.price_low == null && v.price_high == null ? "—" : `${usd(v.price_low ?? v.price_high!)}–${usd(v.price_high ?? v.price_low!)}`,
        better: "low",
      },
      {
        label: "Est. monthly payment",
        hint: "At the middle of the price range",
        get: (v, p) => {
          const price = mid(v);
          return price == null ? null : monthlyPayment(amountFinanced(price, p), p.apr_used, p.loan_months);
        },
        fmt: (x) => (x == null ? "—" : <span className="font-semibold">{usd(Number(x))}/mo</span>),
        better: "low",
      },
      {
        label: "Fuel per year",
        get: (v, p) => annualFuelCost(p.miles_per_year, v.mpg_combined, p.gas_price),
        fmt: (x) => (x == null ? "—" : usd(Number(x))),
        better: "low",
      },
      { label: "Years in budget", get: (v) => v.budget_years, fmt: (x) => (x ? String(x) : "—") },
      { label: "Reliability", get: (v) => v.reliability_note, fmt: (x) => <span className="text-sm">{x ? String(x) : "—"}</span> },
    ],
  },
];

/** Side-by-side spec table. The current car (if any) is shown for reference and never "wins" a row. */
export function CompareTable({ prefs, cols }: { prefs: Preferences; cols: Column[] }) {
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 w-40 min-w-36 bg-surface p-3 text-left align-bottom text-xs font-medium uppercase tracking-wide text-muted">
              {cols.length} vehicles
            </th>
            {cols.map((c) => (
              <th
                key={c.vehicle.id}
                className={`min-w-36 border-l border-border p-3 text-left align-top font-normal ${c.isCurrent ? "bg-surface-2" : c.finalist ? "bg-teal-soft" : c.rank === 1 ? "bg-accent-soft" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  {c.isCurrent ? (
                    <span className="chip bg-surface text-muted ring-1 ring-border">Current car</span>
                  ) : (
                    <span className={`chip ${c.rank === 1 ? "bg-amber text-white" : "bg-surface-2 text-muted"}`}>
                      {c.rank === 1 ? "★ #1" : c.rank ? `#${c.rank}` : "Unscored"}
                    </span>
                  )}
                  <TypeChip type={c.vehicle.type} />
                </div>
                <Link href={`/cars/${c.vehicle.id}`} className="group/name mt-2 block">
                  <span className="block text-xs text-muted">{c.vehicle.make}</span>
                  <span className="block text-base font-semibold leading-tight text-accent group-hover/name:underline">{c.vehicle.model}</span>
                </Link>
                {!c.isCurrent && (
                  <>
                    <div className="mt-2">
                      <ScoreBadge score={c.score} complete={c.complete} />
                    </div>
                    {c.match && c.match.missingMust.length > 0 && (
                      <span className="chip mt-2 bg-coral-soft text-coral" title={names(c.match.missingMust)}>
                        Missing a must-have
                      </span>
                    )}
                    <div className="mt-2">
                      <FinalistButton vehicleId={c.vehicle.id} name={`${c.vehicle.make} ${c.vehicle.model}`} finalist={c.finalist === true} />
                    </div>
                    <ShortlistButton vehicleId={c.vehicle.id} name={`${c.vehicle.make} ${c.vehicle.model}`} className="-ml-2 mt-1" />
                  </>
                )}
              </th>
            ))}
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.title}>
            <tr>
              <th colSpan={cols.length + 1} className="sticky left-0 bg-surface px-3 pb-1 pt-5 text-left">
                <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
                  <span className={`h-3 w-1.5 rounded-full ${g.color}`} />
                  {g.title}
                </span>
              </th>
            </tr>
            {g.rows.map((row) => {
              const values = cols.map((c) => row.get(c.vehicle, prefs, c));
              // The current car is for reference: it never wins a row.
              const numeric = values.map((x, i) => (cols[i].isCurrent || typeof x !== "number" ? null : x));
              const best = new Set(row.better ? bestIndexes(numeric, row.better) : []);
              return (
                <tr key={row.label} className="group">
                  <th className="sticky left-0 z-10 border-t border-border bg-surface p-3 text-left align-top font-medium group-hover:bg-surface-2">
                    {row.label}
                    {row.hint && <span className="block text-xs font-normal text-muted">{row.hint}</span>}
                  </th>
                  {cols.map((c, i) => (
                    <td
                      key={c.vehicle.id}
                      className={`border-l border-t border-border p-3 align-top tabular-nums ${
                        best.has(i) ? "bg-best font-semibold text-best-foreground" : c.isCurrent ? "bg-surface-2/60 text-muted" : "group-hover:bg-surface-2/50"
                      }`}
                    >
                      {row.fmt ? row.fmt(values[i], c.vehicle, prefs, c) : String(values[i] ?? "—")}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}
