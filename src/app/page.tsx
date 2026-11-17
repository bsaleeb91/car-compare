import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { ScoreBadge, TypeChip } from "@/components/chips";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/session";
import { getComparison } from "@/lib/data";
import { LiveRefresh } from "@/components/LiveRefresh";
import { getListings, listingTitle, today } from "@/lib/listings";
import { daysUntil } from "@/lib/calc";
import { FollowUpBadge } from "@/app/listings/bits";
import { StageProgress } from "@/components/StageProgress";
import { getFlowState } from "@/lib/flow-data";

const tiles = [
  { href: "/compare", title: "Compare", text: "Every spec side by side, with garage fit, payments and fuel.", cls: "bg-accent-soft text-accent", icon: "⇆" },
  { href: "/scores", title: "Scores", text: "Rate each car 1–5 on what matters to your family.", cls: "bg-amber-soft text-amber", icon: "★" },
  { href: "/listings", title: "Listings", text: "Cars for sale, dealer contacts, quotes and follow-ups.", cls: "bg-coral-soft text-coral", icon: "🏷" },
  { href: "/preferences", title: "Preferences", text: "Budget, financing, garage size and priority weights.", cls: "bg-teal-soft text-teal", icon: "⚙" },
];
const upcoming = [
  { title: "Recommend", text: "Ask Claude for a shortlist that fits your household." },
  { title: "Test drive", text: "One-handed scorecards for each of you." },
];

export default async function HomePage() {
  const m = await requireMembership();
  const supabase = await createClient();
  const [{ count }, { ranked }, listings, flow] = await Promise.all([
    supabase.from("household_members").select("user_id", { count: "exact", head: true }).eq("household_id", m.household.id),
    getComparison(m.household.id),
    getListings(m.household.id),
    getFlowState(m.household.id),
  ]);
  const now = today();
  // Due today, overdue, or tomorrow; passed listings don't need chasing.
  const due = listings
    .filter((l) => l.status !== "passed" && l.follow_up_on && daysUntil(l.follow_up_on, now) <= 1)
    .sort((a, b) => a.follow_up_on!.localeCompare(b.follow_up_on!));
  const top = [...ranked].filter((r) => r.rank != null).sort((a, b) => a.rank! - b.rank!).slice(0, 3);
  const medal = ["bg-amber text-white", "bg-[#94a3b8] text-white", "bg-[#c2763a] text-white"];

  return (
    <>
      <AppHeader membership={m} />
      <LiveRefresh householdId={m.household.id} tables={["scores", "shortlist", "preferences", "listings", "trim_shortlist"]} />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-5 px-4 py-6">
        <section className="hero relative overflow-hidden rounded-3xl p-6 shadow-xl shadow-accent/25">
          <div aria-hidden className="absolute -right-10 -top-16 size-56 rounded-full bg-white/10" />
          <div aria-hidden className="absolute -bottom-20 right-24 size-40 rounded-full bg-white/10" />
          <p className="relative text-sm font-medium text-white/80">Welcome back</p>
          <h1 className="relative text-3xl font-bold">Hi, {m.member.display_name}</h1>
          <p className="relative mt-1 max-w-md text-white/85">
            {ranked.length} cars on your shortlist.{" "}
            {top[0] ? `${top[0].vehicle.make} ${top[0].vehicle.model} is leading right now.` : "Score them to see a leader."}
          </p>
          <Link href="/compare" className="btn relative mt-4 bg-white text-[#3b26b8] shadow hover:bg-white/90">
            Open the compare table →
          </Link>
        </section>

        <StageProgress counts={flow.counts} />

        {due.length > 0 && (
          <section className="card space-y-2 border-amber/40">
            <h2 className="font-semibold">Follow-ups due</h2>
            <ul className="divide-y divide-border">
              {due.map((l) => (
                <li key={l.id}>
                  <Link href={`/listings/${l.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2 hover:text-accent">
                    <span className="font-medium">
                      {listingTitle(l)}
                      {l.dealer && <span className="font-normal text-muted"> · {l.dealer}</span>}
                    </span>
                    <FollowUpBadge date={l.follow_up_on!} today={now} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {top.length > 0 && (
          <section className="card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Leaderboard</h2>
              <Link href="/scores" className="text-sm font-medium text-accent hover:underline">
                Edit scores
              </Link>
            </div>
            <ol className="grid gap-3 sm:grid-cols-3">
              {top.map((r, i) => (
                <li key={r.vehicle.id}>
                  <Link href={`/cars/${r.vehicle.id}`} className="block h-full rounded-2xl border border-border bg-surface-2/60 p-3 transition hover:border-accent/40 hover:bg-accent-soft">
                  <div className="flex items-center justify-between">
                    <span className={`grid size-7 place-items-center rounded-full text-sm font-bold ${medal[i] ?? "bg-surface text-muted"}`}>
                      {r.rank}
                    </span>
                    <TypeChip type={r.vehicle.type} />
                  </div>
                  <p className="mt-2 text-xs text-muted">{r.vehicle.make}</p>
                  <p className="font-semibold">{r.vehicle.model}</p>
                  <div className="mt-2">
                    <ScoreBadge score={r.score} complete={r.complete} />
                  </div>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        )}

        {(count ?? 1) < 2 && m.member.role === "owner" && (
          <div className="card flex flex-col gap-3 border-teal/30 bg-teal-soft/60 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Shopping with someone?</p>
              <p className="text-sm text-muted">Invite them so you share notes and scores in real time.</p>
            </div>
            <Link href="/settings" className="btn shrink-0 bg-teal text-white hover:brightness-110">
              Invite
            </Link>
          </div>
        )}

        <ul className="grid gap-3 sm:grid-cols-3">
          {tiles.map((t) => (
            <li key={t.href}>
              <Link href={t.href} className="card block h-full transition hover:-translate-y-0.5 hover:shadow-lg">
                <span className={`grid size-10 place-items-center rounded-xl text-lg ${t.cls}`} aria-hidden>
                  {t.icon}
                </span>
                <p className="mt-3 font-semibold">{t.title}</p>
                <p className="mt-1 text-sm text-muted">{t.text}</p>
              </Link>
            </li>
          ))}
        </ul>

        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Coming soon</h2>
          <ul className="grid gap-3 sm:grid-cols-3">
            {upcoming.map((u) => (
              <li key={u.title} className="rounded-2xl border border-dashed border-border p-4">
                <p className="font-medium">{u.title}</p>
                <p className="mt-1 text-sm text-muted">{u.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </>
  );
}
