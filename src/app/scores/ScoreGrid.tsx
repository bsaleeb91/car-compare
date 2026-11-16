"use client";

import { useState, useTransition } from "react";
import { CRITERIA, weightedScore, type Weights } from "@/lib/calc";
import { ScoreBadge, TypeChip, scoreClass } from "@/components/chips";
import { setScoreAction } from "@/app/compare-actions";
import { ShortlistButton } from "@/components/ShortlistButton";

type V = { id: string; make: string; model: string; type: string; avg: Partial<Record<string, number>>; rank: number | null };

export function ScoreGrid({
  vehicles,
  mine: initial,
  weights,
  showAverage,
}: {
  vehicles: V[];
  mine: Record<string, number>;
  weights: Weights;
  showAverage: boolean;
}) {
  const [mine, setMine] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function set(vehicleId: string, criterion: string, score: number) {
    const key = `${vehicleId}:${criterion}`;
    const prev = mine[key];
    const next = prev === score ? null : score; // tapping your current score clears it
    setMine((m) => {
      const copy = { ...m };
      if (next == null) delete copy[key];
      else copy[key] = next;
      return copy;
    });
    setError(null);
    startTransition(async () => {
      const res = await setScoreAction({ vehicleId, criterion, score: next });
      if (res.error) {
        setError(res.error);
        setMine((m) => ({ ...m, [key]: prev }));
      }
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="card border-danger/40 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {vehicles.map((v) => {
          const myAvg = Object.fromEntries(CRITERIA.flatMap((c) => (mine[`${v.id}:${c.key}`] ? [[c.key, mine[`${v.id}:${c.key}`]]] : [])));
          const me = weightedScore(myAvg, weights);
          return (
            <section key={v.id} className="card space-y-3">
              <header className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    {v.rank && <span className={`chip ${v.rank === 1 ? "bg-amber text-white" : "bg-surface-2 text-muted"}`}>#{v.rank}</span>}
                    <TypeChip type={v.type} />
                  </div>
                  <h2 className="mt-1 text-lg font-semibold leading-tight">
                    <span className="text-sm font-normal text-muted">{v.make}</span> {v.model}
                  </h2>
                </div>
                <div className="flex w-28 shrink-0 flex-col items-end">
                  <ScoreBadge score={me.score} complete={me.complete} />
                  <ShortlistButton vehicleId={v.id} name={`${v.make} ${v.model}`} className="-mr-2 mt-1 items-end" />
                </div>
              </header>
              <ul className="space-y-2">
                {CRITERIA.map((c) => {
                  const cur = mine[`${v.id}:${c.key}`];
                  return (
                    <li key={c.key} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 text-sm">
                        <span className="font-medium">{c.short}</span>
                        <span className="ml-1 text-xs text-muted">{weights[c.key] ?? 0}%</span>
                        {showAverage && v.avg[c.key] != null && (
                          <span className="ml-1 text-xs text-muted">· avg {v.avg[c.key]!.toFixed(1)}</span>
                        )}
                      </span>
                      <span className="flex shrink-0 gap-1" role="radiogroup" aria-label={`${c.label} for ${v.make} ${v.model}`}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            type="button"
                            role="radio"
                            aria-checked={cur === n}
                            onClick={() => set(v.id, c.key, n)}
                            className={`size-9 rounded-lg text-sm font-semibold tabular-nums transition ${
                              cur === n ? `${scoreClass(n)} ring-2 ring-current` : "bg-surface-2 text-muted hover:bg-accent-soft hover:text-accent"
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
