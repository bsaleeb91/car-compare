import Link from "next/link";
import { buildStages, type StageCounts, type StageKey } from "@/lib/flow";

/**
 * The three-stage flow at a glance: Models, then Trims, then Listings. Shows what has been chosen at
 * each stage and which one you are in. Locked stages still link (you can always look), they just say what opens them.
 */
export function StageProgress({ counts, current }: { counts: StageCounts; current?: StageKey }) {
  const stages = buildStages(counts, current);
  return (
    <nav aria-label="Where you are in the search" className="card p-3">
      <ol className="grid gap-2 sm:grid-cols-3">
        {stages.map((s) => (
          <li key={s.key}>
            <Link
              href={s.href}
              aria-current={s.state === "current" ? "step" : undefined}
              title={s.lockedHint ?? undefined}
              className={`flex min-h-14 items-center gap-3 rounded-xl p-3 ring-1 transition ${
                s.state === "current"
                  ? "bg-accent-soft ring-2 ring-accent"
                  : s.locked
                    ? "bg-surface-2/60 text-muted ring-border hover:bg-surface-2"
                    : "bg-surface ring-border hover:bg-surface-2"
              }`}
            >
              <span
                aria-hidden
                className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ${
                  s.state === "done" ? "bg-teal text-white" : s.state === "current" ? "bg-accent text-accent-foreground" : "bg-surface-2 text-muted ring-1 ring-border"
                }`}
              >
                {s.state === "done" ? "✓" : s.locked ? "🔒" : s.number}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-tight">
                  {s.label}
                  {s.state === "done" && <span className="sr-only"> (done)</span>}
                  {s.locked && <span className="sr-only"> (locked)</span>}
                </span>
                <span className="block truncate text-xs text-muted">{s.summary}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
