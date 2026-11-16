import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/session";
import { removeMemberAction, revokeInviteAction } from "@/app/actions";
import { DisplayNameForm, HouseholdNameForm, InviteForm } from "./forms";

export default async function SettingsPage() {
  const m = await requireMembership();
  const isOwner = m.member.role === "owner";
  const supabase = await createClient();

  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase
      .from("household_members")
      .select("user_id, display_name, role, joined_at")
      .eq("household_id", m.household.id)
      .order("joined_at"),
    supabase
      .from("invites")
      .select("id, email, created_at, expires_at")
      .eq("household_id", m.household.id)
      .is("accepted_at", null)
      .order("created_at", { ascending: false }),
  ]);
  const now = new Date();

  return (
    <>
      <AppHeader membership={m} />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-6">
        <h1 className="text-2xl font-bold">Settings</h1>

        <section className="card space-y-4">
          <h2 className="font-semibold">Household</h2>
          {isOwner ? (
            <HouseholdNameForm name={m.household.name} />
          ) : (
            <p>
              <span className="text-muted">Name:</span> {m.household.name}
            </p>
          )}
        </section>

        <section className="card space-y-3">
          <h2 className="font-semibold">Members</h2>
          <ul className="divide-y divide-border">
            {(members ?? []).map((mem) => {
              const isMe = mem.user_id === m.userId;
              const canRemove = isOwner && !isMe;
              const canLeave = !isOwner && isMe;
              return (
                <li key={mem.user_id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">
                      {mem.display_name}
                      {isMe && <span className="text-muted"> (you)</span>}
                    </p>
                    <p className="text-sm text-muted">{mem.role === "owner" ? "Owner" : "Member"}</p>
                  </div>
                  {(canRemove || canLeave) && (
                    <form action={removeMemberAction}>
                      <input type="hidden" name="userId" value={mem.user_id} />
                      <button className="btn-danger min-h-10 px-3 text-sm">{canLeave ? "Leave" : "Remove"}</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {isOwner && (
          <section className="card space-y-4">
            <div>
              <h2 className="font-semibold">Invite a member</h2>
              <p className="text-sm text-muted">
                They sign in with this email to join your household. Links expire after 14 days.
              </p>
            </div>
            <InviteForm householdName={m.household.name} />
            {invites && invites.length > 0 && (
              <div>
                <h3 className="mb-1 text-sm font-medium text-muted">Pending invites</h3>
                <ul className="divide-y divide-border">
                  {invites.map((inv) => (
                    <li key={inv.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate">{inv.email}</p>
                        <p className="text-xs text-muted">
                          {new Date(inv.expires_at) < now
                            ? "Expired"
                            : `Expires ${new Date(inv.expires_at).toLocaleDateString()}`}
                        </p>
                      </div>
                      <form action={revokeInviteAction}>
                        <input type="hidden" name="id" value={inv.id} />
                        <button className="btn-secondary min-h-10 px-3 text-sm">Revoke</button>
                      </form>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        <section className="card space-y-4">
          <h2 className="font-semibold">You</h2>
          <p className="text-sm text-muted">Signed in as {m.email}</p>
          <DisplayNameForm displayName={m.member.display_name} />
        </section>

        <Link href="/preferences" className="card flex items-center justify-between gap-3 hover:bg-accent-soft">
          <span>
            <span className="block font-semibold">Preferences</span>
            <span className="mt-1 block text-sm text-muted">Budget, financing, garage and priority weights.</span>
          </span>
          <span aria-hidden className="text-accent">→</span>
        </Link>
      </main>
    </>
  );
}
