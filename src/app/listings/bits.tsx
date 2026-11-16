import { LISTING_STATUSES } from "@/lib/listings";
import { daysUntil } from "@/lib/calc";

export function StatusChip({ status }: { status: string }) {
  const s = LISTING_STATUSES.find((x) => x.key === status) ?? LISTING_STATUSES[0];
  return <span className={`chip shrink-0 ${s.cls}`}>{s.label}</span>;
}

/** "Follow up today" / "in 3 days" / "2 days overdue", colored by urgency. */
export function FollowUpBadge({ date, today }: { date: string; today: string }) {
  const d = daysUntil(date, today);
  const label =
    d < 0 ? `Follow-up ${-d} day${d === -1 ? "" : "s"} overdue` : d === 0 ? "Follow up today" : d === 1 ? "Follow up tomorrow" : `Follow up in ${d} days`;
  const cls = d < 0 ? "bg-coral text-white" : d <= 1 ? "bg-amber text-white" : "bg-surface-2 text-muted";
  return <span className={`chip ${cls}`}>{label}</span>;
}
