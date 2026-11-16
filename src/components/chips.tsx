import type { Fit } from "@/lib/calc";

const typeStyle: Record<string, string> = {
  minivan: "bg-accent-soft text-accent",
  suv: "bg-teal-soft text-teal",
  crossover: "bg-teal-soft text-teal",
};

export function TypeChip({ type }: { type: string }) {
  const label = type === "suv" ? "SUV" : type.charAt(0).toUpperCase() + type.slice(1);
  return <span className={`chip ${typeStyle[type] ?? "bg-amber-soft text-amber"}`}>{label}</span>;
}

const fitStyle: Record<Fit["status"], [string, string]> = {
  fits: ["bg-best text-best-foreground", "Fits"],
  tight: ["bg-amber-soft text-amber", "Tight"],
  no: ["bg-coral-soft text-coral", "Won't fit"],
  unknown: ["bg-surface-2 text-muted", "Unknown"],
};

export function FitChip({ status }: { status: Fit["status"] }) {
  const [cls, label] = fitStyle[status];
  return <span className={`chip ${cls}`}>{label}</span>;
}

/** Background/foreground classes for a 1–5 score (rounded). */
export function scoreClass(score: number | null | undefined): string {
  if (score == null) return "bg-surface-2 text-muted";
  const n = Math.min(5, Math.max(1, Math.round(score)));
  return [
    "",
    "bg-score-1 text-score-1-fg",
    "bg-score-2 text-score-2-fg",
    "bg-score-3 text-score-3-fg",
    "bg-score-4 text-score-4-fg",
    "bg-score-5 text-score-5-fg",
  ][n];
}

/** Weighted score out of 5 with a colored meter. */
export function ScoreBadge({ score, complete }: { score: number | null; complete: boolean }) {
  if (score == null) return <span className="text-xs text-muted">No scores yet</span>;
  return (
    <span className="block">
      <span className="flex items-baseline gap-1">
        <span className="text-lg font-bold tabular-nums">{score.toFixed(2)}</span>
        <span className="text-xs text-muted">/ 5{complete ? "" : " · partial"}</span>
      </span>
      <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <span
          className="block h-full rounded-full bg-gradient-to-r from-coral via-amber to-success"
          style={{ width: `${(score / 5) * 100}%` }}
        />
      </span>
    </span>
  );
}
