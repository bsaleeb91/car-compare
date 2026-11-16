import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { getComparison } from "@/lib/data";
import { TEST_DRIVE_KEYS } from "@/lib/calc";
import { Scorecard } from "./Scorecard";

export const metadata = { title: "Test drive · Car Compare" };

/**
 * Full-screen, one-handed scorecard for use in the car. Deliberately has no app header:
 * just a way back, so it's hard to tap the wrong thing while walking around a lot.
 */
export default async function TestDrivePage({ params }: PageProps<"/cars/[id]/test-drive">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const m = await requireMembership();
  const { ranked, removed, scoreRows } = await getComparison(m.household.id);
  const v = ranked.find((r) => r.vehicle.id === id)?.vehicle ?? removed.find((x) => x.id === id);
  if (!v) notFound();

  const mine = Object.fromEntries(
    scoreRows
      .filter((s) => s.vehicle_id === id && s.user_id === m.userId && TEST_DRIVE_KEYS.includes(s.criterion))
      .map((s) => [s.criterion, s.score]),
  );

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-28 pt-4">
      <header className="hero sticky top-0 z-10 -mx-4 mb-4 flex items-center justify-between gap-3 px-4 py-3 shadow-lg shadow-accent/20 sm:rounded-b-2xl">
        <Link href={`/cars/${id}`} className="btn min-h-10 px-2 text-sm text-white/85 hover:bg-white/10">
          ← Back
        </Link>
        <div className="min-w-0 text-right">
          <p className="text-xs text-white/75">Test drive · {m.member.display_name}</p>
          <p className="truncate font-semibold">
            {v.make} {v.model}
          </p>
        </div>
      </header>
      <Scorecard
        vehicleId={id}
        initial={mine}
        rollover={v.nhtsa_rollover_stars ?? null}
        overall={v.nhtsa_overall_stars ?? null}
        searchName={`${v.make} ${v.model}`}
      />
    </main>
  );
}
