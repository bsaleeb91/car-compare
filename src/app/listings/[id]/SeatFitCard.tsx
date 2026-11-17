"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addSeatCheckAction, deleteSeatCheckAction } from "@/app/seat-actions";
import { POSITIONS, RESULTS, SEAT_TYPES, positionResults, type FitCheck, type PositionKey, type Result } from "@/lib/seatfit";

type Seat = { id: string; name: string; type: string };
type Names = Record<string, string>;

const tri = (v: boolean | null) => (v == null ? "" : v ? "yes" : "no");
const fromTri = (v: string) => (v === "" ? null : v === "yes");
const resultMeta = (r: Result) => RESULTS.find((x) => x.key === r)!;

/**
 * Car-seat fit for one listing: a seat map (worst result per position), the form to record how a seat
 * went in on the test drive, and the history. Tap a position on the map to pre-fill the form.
 */
export function SeatFitCard({
  listingId,
  seats,
  checks,
  names,
  third,
}: {
  listingId: string;
  seats: Seat[];
  checks: FitCheck[];
  names: Names;
  third: boolean;
}) {
  const [seat, setSeat] = useState(seats[0]?.id ?? "");
  const [position, setPosition] = useState<PositionKey>("row2_left");
  const [install, setInstall] = useState("latch");
  const [result, setResult] = useState<Result>("pass");
  const [front, setFront] = useState("");
  const [thirdPax, setThirdPax] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const byPos = positionResults(checks);
  const rows = third ? [2, 3] : [2];
  const seatName = (id: string) => seats.find((s) => s.id === id)?.name ?? names[id] ?? "Removed seat";

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await addSeatCheckAction({
        listingId,
        carSeatId: seat,
        position,
        installMethod: install || null,
        result,
        frontRoomOk: fromTri(front),
        thirdPassengerFit: fromTri(thirdPax),
        notes: notes || null,
      });
      if ("error" in res && res.error) setError(res.error);
      else {
        setNotes("");
        router.refresh();
      }
    });
  }

  return (
    <section className="card space-y-4" aria-labelledby="seatfit-h">
      <div>
        <h2 id="seatfit-h" className="font-semibold">
          Car-seat fit
        </h2>
        <p className="text-sm text-muted">Fill this in on the test drive. Each spot shows the worst result among your seats.</p>
      </div>

      <div className="space-y-2" role="group" aria-label="Seat map">
        <p className="text-center text-xs font-medium uppercase tracking-wide text-muted">Front</p>
        {rows.map((row) => (
          <div key={row} className="grid grid-cols-3 gap-2">
            {POSITIONS.filter((p) => p.row === row).map((p) => {
              const r = byPos[p.key];
              const meta = r.worst ? resultMeta(r.worst) : null;
              const on = position === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPosition(p.key)}
                  aria-pressed={on}
                  className={`min-h-16 rounded-xl p-2 text-left text-xs ring-1 transition ${meta ? meta.cls : "bg-surface-2 text-muted"} ${on ? "ring-2 ring-accent" : "ring-border"}`}
                >
                  <span className="block font-medium">{p.label.replace(/^\d\w+ row, /, "")}</span>
                  <span className="block text-[11px] opacity-80">Row {row}</span>
                  {meta ? (
                    <span className="mt-1 block font-semibold">
                      {meta.mark} {meta.label}
                    </span>
                  ) : (
                    <span className="mt-1 block">Not tested</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {seats.length === 0 ? (
        <p className="rounded-xl bg-surface-2 p-3 text-sm">
          Add your car seats first.{" "}
          <Link href="/preferences#car-seats" className="font-medium text-accent underline">
            Car seats in Preferences
          </Link>
        </p>
      ) : (
        <form onSubmit={save} className="space-y-3 rounded-xl bg-surface-2 p-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="sf-seat" className="label">
                Car seat
              </label>
              <select id="sf-seat" className="input" value={seat} onChange={(e) => setSeat(e.target.value)}>
                {seats.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({SEAT_TYPES.find((t) => t.key === s.type)?.label.toLowerCase()})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="sf-pos" className="label">
                Position
              </label>
              <select id="sf-pos" className="input" value={position} onChange={(e) => setPosition(e.target.value as PositionKey)}>
                {POSITIONS.filter((p) => third || p.row === 2).map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="sf-inst" className="label">
                Installed with
              </label>
              <select id="sf-inst" className="input" value={install} onChange={(e) => setInstall(e.target.value)}>
                <option value="latch">LATCH</option>
                <option value="seat_belt">Seat belt</option>
                <option value="">Didn&apos;t install</option>
              </select>
            </div>
          </div>

          <fieldset>
            <legend className="label">How did it go?</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup">
              {RESULTS.map((r) => (
                <label
                  key={r.key}
                  className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-xl px-3 text-sm font-medium ring-1 ${result === r.key ? `${r.cls} ring-2 ring-accent` : "bg-surface ring-border"}`}
                >
                  <input type="radio" name="sf-result" className="sr-only" checked={result === r.key} onChange={() => setResult(r.key)} />
                  {r.mark} {r.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="sf-front" className="label">
                Front seat still comfortable?
              </label>
              <select id="sf-front" className="input" value={front} onChange={(e) => setFront(e.target.value)}>
                <option value="">Didn&apos;t check</option>
                <option value="yes">Yes</option>
                <option value="no">No, cramped</option>
              </select>
            </div>
            <div>
              <label htmlFor="sf-third" className="label">
                Third person fits beside two seats?
              </label>
              <select id="sf-third" className="input" value={thirdPax} onChange={(e) => setThirdPax(e.target.value)}>
                <option value="">Didn&apos;t check</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="sf-notes" className="label">
              Notes
            </label>
            <input id="sf-notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Buckle was hard to reach, base needed a pool noodle…" />
          </div>

          <div className="flex items-center gap-3">
            <button className="btn-primary min-h-10 px-4 text-sm" disabled={pending || !seat}>
              {pending ? "Saving…" : "Save this check"}
            </button>
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
          </div>
        </form>
      )}

      {checks.length > 0 && (
        <ul className="divide-y divide-border">
          {[...checks]
            .sort((a, b) => b.checked_at.localeCompare(a.checked_at))
            .map((c) => {
              const meta = resultMeta(c.result);
              return (
                <li key={c.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className={`chip mr-2 ${meta.cls}`}>
                      {meta.mark} {meta.label}
                    </span>
                    <span className="font-medium">{seatName(c.car_seat_id)}</span>
                    <span className="text-muted">
                      {" · "}
                      {POSITIONS.find((p) => p.key === c.position)?.label}
                      {c.install_method ? ` · ${c.install_method === "latch" ? "LATCH" : "seat belt"}` : ""}
                    </span>
                    {(c.front_room_ok != null || c.third_passenger_fit != null) && (
                      <span className="block text-xs text-muted">
                        {[
                          c.front_room_ok != null ? `Front seat ${tri(c.front_room_ok) === "yes" ? "comfortable" : "cramped"}` : null,
                          c.third_passenger_fit != null ? `Third person ${c.third_passenger_fit ? "fits" : "doesn't fit"}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                    {c.notes && <span className="block text-xs text-muted">{c.notes}</span>}
                  </span>
                  <button
                    type="button"
                    className="shrink-0 text-xs text-muted hover:text-coral"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const res = await deleteSeatCheckAction({ id: c.id, listingId });
                        if ("error" in res && res.error) setError(res.error);
                        else router.refresh();
                      })
                    }
                  >
                    Delete
                  </button>
                </li>
              );
            })}
        </ul>
      )}
    </section>
  );
}
