"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addCarSeatAction, deleteCarSeatAction } from "@/app/seat-actions";
import { SEAT_TYPES } from "@/lib/seatfit";
import type { CarSeat } from "@/lib/seats";

/** The household's car seats. Listings use these for the fit check, so name them the way you would say them. */
export function CarSeatsEditor({ seats }: { seats: CarSeat[] }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("infant");
  const [width, setWidth] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await addCarSeatAction({ name, type, widthIn: width === "" ? null : Number(width) });
      if ("error" in res && res.error) setError(res.error);
      else {
        setName("");
        setWidth("");
        router.refresh();
      }
    });
  }

  return (
    <section id="car-seats" className="card space-y-4">
      <div>
        <h2 className="font-semibold">Car seats</h2>
        <p className="text-sm text-muted">The seats you need to fit. On a test drive you record where each one went in.</p>
      </div>

      {seats.length > 0 && (
        <ul className="divide-y divide-border">
          {seats.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 py-2">
              <span>
                <span className="font-medium">{s.name}</span>
                <span className="ml-2 text-xs text-muted">
                  {SEAT_TYPES.find((t) => t.key === s.type)?.label}
                  {s.width_in != null ? ` · ${s.width_in} in wide` : ""}
                </span>
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await deleteCarSeatAction({ id: s.id });
                    if ("error" in res && res.error) setError(res.error);
                    else router.refresh();
                  })
                }
                className="text-sm text-muted hover:text-coral"
                aria-label={`Remove ${s.name}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="grid gap-3 sm:grid-cols-[1fr_9rem_6rem_auto] sm:items-end">
        <div>
          <label htmlFor="seat-name" className="label">
            Name
          </label>
          <input id="seat-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Infant carrier" required />
        </div>
        <div>
          <label htmlFor="seat-type" className="label">
            Type
          </label>
          <select id="seat-type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
            {SEAT_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="seat-width" className="label">
            Width (in)
          </label>
          <input id="seat-width" className="input" type="number" inputMode="decimal" min={5} max={30} step={0.5} value={width} onChange={(e) => setWidth(e.target.value)} placeholder="17.5" />
        </div>
        <button className="btn-primary min-h-11 px-4" disabled={pending || name.trim() === ""}>
          {pending ? "Adding…" : "Add seat"}
        </button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
