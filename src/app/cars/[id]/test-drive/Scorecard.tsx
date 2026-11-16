"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { TEST_DRIVE, TEST_DRIVE_KEYS } from "@/lib/calc";
import { scoreClass } from "@/components/chips";
import { addNoteAction, setScoreAction } from "@/app/compare-actions";

export function Scorecard({
  vehicleId,
  initial,
  rollover,
  overall,
  searchName,
}: {
  vehicleId: string;
  initial: Record<string, number>;
  rollover: number | null;
  overall: number | null;
  searchName: string;
}) {
  const [mine, setMine] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [felt, setFelt] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const done = TEST_DRIVE_KEYS.filter((k) => mine[k]).length;

  function set(criterion: string, score: number) {
    const prev = mine[criterion];
    const next = prev === score ? null : score;
    setMine((m) => {
      const c = { ...m };
      if (next == null) delete c[criterion];
      else c[criterion] = next;
      return c;
    });
    setError(null);
    start(async () => {
      const res = await setScoreAction({ vehicleId, criterion, score: next });
      if (res.error) {
        setError(res.error);
        setMine((m) => ({ ...m, [criterion]: prev }));
      }
    });
  }

  function saveFelt() {
    start(async () => {
      const res = await addNoteAction({ vehicleId, body: `Test drive: ${felt.trim()}` });
      if (res.error) setError(res.error);
      else {
        setFelt("");
        setSaved(true);
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-success transition-all" style={{ width: `${(done / TEST_DRIVE_KEYS.length) * 100}%` }} />
        </div>
        <span className="text-sm tabular-nums text-muted">
          {done}/{TEST_DRIVE_KEYS.length}
        </span>
      </div>

      {error && (
        <p role="alert" className="card border-danger/40 text-sm text-danger">
          {error}
        </p>
      )}

      {TEST_DRIVE.map((group) => (
        <section key={group.title} className="card space-y-4">
          <h2 className="text-lg font-semibold">{group.title}</h2>

          {group.title.startsWith("Driving") && (
            <>
              <p className="rounded-xl bg-amber-soft p-3 text-sm">
                Judge these at normal, legal speeds on the test route. Don&apos;t drive aggressively to test them.
              </p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <Stars label="Rollover rating" value={rollover} />
                <Stars label="Overall crash rating" value={overall} />
              </div>
              {(rollover == null || overall == null) && (
                <p className="text-xs text-muted">
                  Crash ratings aren&apos;t added yet. Look up the {searchName} on{" "}
                  <a href="https://www.nhtsa.gov/ratings" target="_blank" rel="noreferrer" className="underline">
                    nhtsa.gov/ratings
                  </a>
                  .
                </p>
              )}
            </>
          )}

          <ul className="space-y-4">
            {group.items.map((item) => (
              <li key={item.key}>
                <p className="font-medium">{item.label}</p>
                {"hint" in item && <p className="text-xs text-muted">{item.hint}</p>}
                <div className="mt-2 grid grid-cols-5 gap-2" role="radiogroup" aria-label={item.label}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={mine[item.key] === n}
                      onClick={() => set(item.key, n)}
                      className={`h-14 rounded-2xl text-lg font-bold tabular-nums transition active:scale-95 ${
                        mine[item.key] === n ? `${scoreClass(n)} ring-2 ring-current` : "bg-surface-2 text-muted"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">How it felt</h2>
        <textarea
          className="input min-h-28"
          placeholder="Anything you'd tell each other on the drive home…"
          value={felt}
          onChange={(e) => {
            setFelt(e.target.value);
            setSaved(false);
          }}
          maxLength={4900}
        />
        {saved && <p className="text-sm text-success">Saved to this car&apos;s notes.</p>}
        <button type="button" className="btn-secondary w-full" disabled={pending || !felt.trim()} onClick={saveFelt}>
          Save to notes
        </button>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface/95 p-3 backdrop-blur">
        <div className="mx-auto max-w-xl">
          <Link href={`/cars/${vehicleId}`} className="btn-primary w-full">
            Done
          </Link>
        </div>
      </div>
    </div>
  );
}

function Stars({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 font-semibold">
        {value == null ? (
          <span className="text-muted">Not added</span>
        ) : (
          <span className="text-amber">
            {"★".repeat(Math.round(value))}
            <span className="text-border">{"★".repeat(5 - Math.round(value))}</span>
          </span>
        )}
      </p>
    </div>
  );
}
