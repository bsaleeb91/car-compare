import type { Vehicle } from "@/lib/data";
import { TypeChip } from "@/components/chips";
import { ShortlistButton } from "@/components/ShortlistButton";

/** Cars taken off the list. Their scores are kept, so putting one back restores everything. */
export function RemovedList({ removed }: { removed: Vehicle[] }) {
  return (
    <section className="card space-y-3 border-dashed">
      <div>
        <h2 className="font-semibold">Removed cars</h2>
        <p className="text-sm text-muted">Hidden from Compare and Scores. Your scores are kept if you put one back.</p>
      </div>
      <ul className="divide-y divide-border">
        {removed.map((v) => (
          <li key={v.id} className="flex items-center justify-between gap-3 py-2">
            <span className="flex min-w-0 items-center gap-2">
              <TypeChip type={v.type} />
              <span className="truncate">
                <span className="text-sm text-muted">{v.make}</span> <span className="font-medium">{v.model}</span>
              </span>
            </span>
            <ShortlistButton vehicleId={v.id} name={`${v.make} ${v.model}`} removed />
          </li>
        ))}
      </ul>
    </section>
  );
}
