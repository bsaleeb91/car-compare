import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { FitChip, ScoreBadge, TypeChip, UnverifiedBadge, scoreClass } from "@/components/chips";
import { LiveRefresh } from "@/components/LiveRefresh";
import { ShortlistButton } from "@/components/ShortlistButton";
import { usd } from "@/components/CompareTable";
import { requireMembership } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getComparison } from "@/lib/data";
import { CRITERIA, TEST_DRIVE, amountFinanced, annualFuelCost, garageFit, monthlyPayment } from "@/lib/calc";
import { NotesThread, type Note } from "./NotesThread";

export default async function CarPage({ params }: PageProps<"/cars/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const m = await requireMembership();
  const { prefs, ranked, removed, current, scoreRows, members } = await getComparison(m.household.id);

  const r = ranked.find((x) => x.vehicle.id === id);
  const v = r?.vehicle ?? removed.find((x) => x.id === id) ?? (current?.id === id ? current : null);
  if (!v) notFound();
  const isRemoved = !r && removed.some((x) => x.id === id);
  const isCurrent = current?.id === id;

  const supabase = await createClient();
  const { data: noteRows } = await supabase
    .from("notes")
    .select("id, author_id, body, created_at, updated_at")
    .eq("household_id", m.household.id)
    .eq("vehicle_id", id)
    .order("created_at", { ascending: true });
  const names = Object.fromEntries(members.map((x) => [x.user_id, x.display_name]));
  const notes: Note[] = (noteRows ?? []).map((n) => ({ ...n, author: names[n.author_id] ?? "Former member" }));

  const fit = garageFit(prefs, v);
  const pay = (price: number | null) =>
    price == null ? null : monthlyPayment(amountFinanced(price, prefs), prefs.apr_used, prefs.loan_months);
  const fuel = annualFuelCost(prefs.miles_per_year, v.mpg_combined, prefs.gas_price);
  const name = `${v.make} ${v.model}`;

  const specs: [string, string | null][] = [
    ["Seats", v.seats?.toString() ?? null],
    ["Sliding doors", v.sliding_doors == null ? null : v.sliding_doors ? "Yes" : "No"],
    ["Cargo behind 3rd row", v.cargo_3rd != null ? `${v.cargo_3rd} cu ft` : null],
    ["Cargo behind 2nd row", v.cargo_2nd != null ? `${v.cargo_2nd} cu ft` : null],
    ["Max cargo", v.cargo_max != null ? `${v.cargo_max} cu ft` : null],
    ["3rd-row legroom", v.third_row_legroom_in != null ? `${v.third_row_legroom_in} in` : null],
    ["Length × width × height", v.length_in ? `${v.length_in} × ${v.width_in ?? "?"} × ${v.height_in ?? "?"} in` : null],
    ["Ground clearance", v.ground_clearance_in != null ? `${v.ground_clearance_in} in` : null],
    ["MPG (combined)", v.mpg_combined?.toString() ?? null],
    ["Horsepower", v.hp != null ? `${v.hp} hp` : null],
    ["Hybrid available", v.hybrid_available == null ? null : v.hybrid_available ? "Yes" : "No"],
    ["AWD available", v.awd_available == null ? null : v.awd_available ? "Yes" : "No"],
    ["Max towing", v.towing_lbs != null ? `${v.towing_lbs.toLocaleString()} lb` : null],
    ["Brand origin", v.brand_origin],
    ["Reliability", v.reliability_note],
    ["Years in budget", v.budget_years],
  ];

  return (
    <>
      <AppHeader membership={m} />
      <LiveRefresh householdId={m.household.id} tables={["notes", "scores", "shortlist", "preferences"]} />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 px-4 py-6">
        <Link href="/compare" className="text-sm font-medium text-accent hover:underline">
          ← Compare
        </Link>

        <section className="card flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {isCurrent ? (
                <span className="chip bg-surface-2 text-muted">Current car</span>
              ) : isRemoved ? (
                <span className="chip bg-coral-soft text-coral">Removed</span>
              ) : (
                r?.rank && <span className={`chip ${r.rank === 1 ? "bg-amber text-white" : "bg-surface-2 text-muted"}`}>#{r.rank}</span>
              )}
              <TypeChip type={v.type} />
              {!v.specs_verified && <UnverifiedBadge />}
            </div>
            <p className="mt-2 text-sm text-muted">{v.make}</p>
            <h1 className="text-3xl font-bold leading-tight">{v.model}</h1>
            {v.generation_years && <p className="text-sm text-muted">{v.generation_years}</p>}
          </div>
          {!isCurrent && (
            <div className="flex w-40 flex-col items-end gap-1">
              {r && <ScoreBadge score={r.score} complete={r.complete} />}
              <ShortlistButton vehicleId={v.id} name={name} removed={isRemoved} className="-mr-2 items-end" />
            </div>
          )}
        </section>

        <div className="grid gap-4 md:grid-cols-3">
          <section className="card space-y-2">
            <h2 className="flex items-center justify-between font-semibold">
              Garage fit <FitChip status={fit.status} />
            </h2>
            {fit.status === "unknown" && prefs.garage_depth_in == null ? (
              <p className="text-sm text-muted">
                Add your garage size in <Link href="/preferences" className="underline">Preferences</Link>.
              </p>
            ) : (
              <dl className="space-y-1 text-sm">
                <Row label="Depth to spare" value={fit.depthLeft} min={prefs.min_walkaround_in} />
                <Row label="Door width margin" value={fit.widthMargin} min={12} />
                <Row label="Door height margin" value={fit.heightMargin} min={3} />
              </dl>
            )}
          </section>

          <section className="card space-y-2">
            <h2 className="font-semibold">Monthly payment</h2>
            {v.price_low == null && v.price_high == null ? (
              <p className="text-sm text-muted">No price range yet.</p>
            ) : (
              <>
                <p className="text-2xl font-bold tabular-nums">
                  {usd(pay(v.price_low ?? v.price_high)!)}–{usd(pay(v.price_high ?? v.price_low)!)}
                  <span className="text-sm font-normal text-muted">/mo</span>
                </p>
                <p className="text-sm text-muted">
                  For {usd(v.price_low ?? v.price_high!)}–{usd(v.price_high ?? v.price_low!)} at {prefs.apr_used}% over{" "}
                  {prefs.loan_months} months, {usd(prefs.down_payment)} down.
                </p>
              </>
            )}
          </section>

          <section className="card space-y-2">
            <h2 className="font-semibold">Fuel per year</h2>
            <p className="text-2xl font-bold tabular-nums">{fuel == null ? "—" : usd(fuel)}</p>
            <p className="text-sm text-muted">
              {prefs.miles_per_year.toLocaleString()} miles at ${prefs.gas_price.toFixed(2)}/gal
              {v.mpg_combined ? `, ${v.mpg_combined} MPG` : ""}.
            </p>
          </section>
        </div>

        {!isCurrent && (
          <section className="card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Test drive</h2>
                <p className="text-sm text-muted">
                  {r?.testDrive != null
                    ? `Average ${r.testDrive.toFixed(1)} / 5 across everyone's scorecards.`
                    : "Nobody has driven it yet. Open the scorecard on your phone at the dealer."}
                </p>
              </div>
              <Link href={`/cars/${v.id}/test-drive`} className="btn-primary">
                {scoreRows.some((s) => s.vehicle_id === id && s.user_id === m.userId && s.criterion.startsWith("td_"))
                  ? "Continue my scorecard"
                  : "Start test drive"}
              </Link>
            </div>
            {r?.testDrive != null && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th className="py-1 font-medium" />
                      {members.map((mem) => (
                        <th key={mem.user_id} className="py-1 text-center font-medium">
                          {mem.display_name.split(" ")[0]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  {TEST_DRIVE.map((g) => (
                    <tbody key={g.title} className="divide-y divide-border">
                      <tr>
                        <th colSpan={members.length + 1} className="pb-1 pt-3 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                          {g.title}
                        </th>
                      </tr>
                      {g.items.map((item) => (
                        <tr key={item.key}>
                          <td className="py-1.5">{item.label}</td>
                          {members.map((mem) => {
                            const s = scoreRows.find((x) => x.vehicle_id === id && x.user_id === mem.user_id && x.criterion === item.key)?.score;
                            return (
                              <td key={mem.user_id} className="py-1 text-center">
                                <span className={`inline-grid size-8 place-items-center rounded-lg font-semibold ${scoreClass(s)}`}>{s ?? "–"}</span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  ))}
                </table>
              </div>
            )}
          </section>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <section className="card">
            <h2 className="mb-2 font-semibold">Specs</h2>
            <dl className="divide-y divide-border text-sm">
              {specs.map(([k, val]) => (
                <div key={k} className="flex justify-between gap-3 py-2">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right font-medium">{val ?? "—"}</dd>
                </div>
              ))}
            </dl>
          </section>

          {!isCurrent && (
            <section className="card">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-semibold">Weighted scores</h2>
                <Link href="/scores" className="text-sm font-medium text-accent hover:underline">
                  Edit
                </Link>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="py-1 font-medium">Factor</th>
                    {members.map((mem) => (
                      <th key={mem.user_id} className="py-1 text-center font-medium">
                        {mem.display_name.split(" ")[0]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {CRITERIA.map((c) => (
                    <tr key={c.key}>
                      <td className="py-2">
                        {c.short} <span className="text-xs text-muted">{prefs.weights[c.key] ?? 0}%</span>
                      </td>
                      {members.map((mem) => {
                        const s = scoreRows.find((x) => x.vehicle_id === id && x.user_id === mem.user_id && x.criterion === c.key)?.score;
                        return (
                          <td key={mem.user_id} className="py-1 text-center">
                            <span className={`inline-grid size-8 place-items-center rounded-lg font-semibold ${scoreClass(s)}`}>{s ?? "–"}</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>

        <NotesThread vehicleId={v.id} notes={notes} myId={m.userId} />
      </main>
    </>
  );
}

function Row({ label, value, min }: { label: string; value: number | null; min: number }) {
  const cls = value == null ? "text-muted" : value <= 0 ? "text-coral" : value < min ? "text-amber" : "text-success";
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className={`font-semibold tabular-nums ${cls}`}>{value == null ? "—" : `${value} in`}</dd>
    </div>
  );
}
