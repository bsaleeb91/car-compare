import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Member = {
  household_id: string;
  user_id: string;
  display_name: string;
  role: "owner" | "member";
};

export type Membership = {
  userId: string;
  email: string;
  member: Member;
  household: { id: string; name: string };
};

/** The verified signed-in user, or a redirect to /login. */
export const requireUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/login");
  return { userId: claims.sub, email: (claims.email as string | undefined) ?? "" };
});

/** The user's household membership, or null if they haven't joined one yet. */
export const getMembership = cache(async (): Promise<Membership | null> => {
  const { userId, email } = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("household_members")
    .select("household_id, user_id, display_name, role, households(id, name)")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const household = data.households as unknown as { id: string; name: string };
  return {
    userId,
    email,
    member: {
      household_id: data.household_id,
      user_id: data.user_id,
      display_name: data.display_name,
      role: data.role as Member["role"],
    },
    household,
  };
});

/** Membership, or a redirect to onboarding when the user has no household. */
export async function requireMembership(): Promise<Membership> {
  const m = await getMembership();
  if (!m) redirect("/onboarding");
  return m;
}
