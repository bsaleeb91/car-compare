import { AppHeader } from "@/components/AppHeader";
import { requireMembership } from "@/lib/session";
import { getComparison } from "@/lib/data";
import { ScoreGrid } from "./ScoreGrid";

export const metadata = { title: "Scores · Car Compare" };

export default async function ScoresPage() {
  const m = await requireMembership();
  const { ranked, scoreRows, members, prefs } = await getComparison(m.household.id);
  const order = [...ranked].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const mine = Object.fromEntries(
    scoreRows.filter((s) => s.user_id === m.userId).map((s) => [`${s.vehicle_id}:${s.criterion}`, s.score]),
  );
  const others = members.length > 1;

  return (
    <>
      <AppHeader membership={m} />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold">Scores</h1>
          <p className="text-sm text-muted">
            Rate each car 1–5 on what matters to you: 5 = best in the group, 3 = acceptable, 1 = weak. Your starting
            scores came from the specs, so overwrite them after test drives.
            {others && " Everyone scores separately, and the ranking uses the household average."}
          </p>
        </div>
        <ScoreGrid
          vehicles={order.map((r) => ({
            id: r.vehicle.id,
            make: r.vehicle.make,
            model: r.vehicle.model,
            type: r.vehicle.type,
            avg: r.avg,
            rank: r.rank,
          }))}
          mine={mine}
          weights={prefs.weights}
          showAverage={others}
        />
      </main>
    </>
  );
}
