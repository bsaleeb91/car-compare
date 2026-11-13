import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/session";

const upcoming = [
  { title: "Preferences", text: "Budget, financing, garage size and what matters most." },
  { title: "Recommend", text: "Ask Claude for a shortlist that fits your household." },
  { title: "Compare", text: "Models, then trims, then real listings, side by side." },
  { title: "Test drive", text: "One-handed scorecards for each of you." },
  { title: "Listings & dealers", text: "Track cars for sale, quotes and follow-ups." },
  { title: "Financing", text: "Live payment what-ifs and lender quotes." },
];

export default async function HomePage() {
  const m = await requireMembership();
  const supabase = await createClient();
  const { count } = await supabase
    .from("household_members")
    .select("user_id", { count: "exact", head: true })
    .eq("household_id", m.household.id);

  return (
    <>
      <AppHeader membership={m} />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-6">
        <h1 className="text-2xl font-semibold">Hi, {m.member.display_name}</h1>

        {(count ?? 1) < 2 && m.member.role === "owner" && (
          <div className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Shopping with someone?</p>
              <p className="text-sm text-muted">Invite them so you share notes and scores in real time.</p>
            </div>
            <Link href="/settings" className="btn-primary shrink-0">
              Invite
            </Link>
          </div>
        )}

        <ul className="grid gap-3 sm:grid-cols-2">
          {upcoming.map((u) => (
            <li key={u.title} className="card opacity-70">
              <p className="font-medium">{u.title}</p>
              <p className="mt-1 text-sm text-muted">{u.text}</p>
              <p className="mt-2 text-xs uppercase tracking-wide text-muted">Coming soon</p>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
