"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireMembership, requireUser } from "@/lib/session";

export type ActionState = { error?: string; ok?: string; inviteLink?: string; inviteEmail?: string };

const name = z.string().trim().min(1, "Required").max(80, "Too long");
const displayName = z.string().trim().min(1, "Required").max(40, "Too long");

/** Postgres RAISE messages from our RPCs are written for users; everything else is generic. */
function friendly(error: { code?: string; message: string }) {
  if (error.code === "P0001" || error.code === "P0002") return error.message;
  console.error(error);
  return "Something went wrong. Please try again.";
}

async function siteOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function createHouseholdAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = z
    .object({ householdName: name, displayName })
    .safeParse({ householdName: form.get("householdName"), displayName: form.get("displayName") });
  if (!parsed.success) return { error: "Please enter a household name and your name." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_household", {
    p_name: parsed.data.householdName,
    p_display_name: parsed.data.displayName,
  });
  if (error) return { error: friendly(error) };
  redirect("/");
}

export async function acceptInviteAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = z
    .object({ token: z.string().regex(/^[0-9a-f]{64}$/), displayName })
    .safeParse({ token: form.get("token"), displayName: form.get("displayName") });
  if (!parsed.success) return { error: "Please enter your name." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_invite", {
    p_token: parsed.data.token,
    p_display_name: parsed.data.displayName,
  });
  if (error) return { error: friendly(error) };
  redirect("/");
}

export async function createInviteAction(_: ActionState, form: FormData): Promise<ActionState> {
  const m = await requireMembership();
  if (m.member.role !== "owner") return { error: "Only the household owner can send invites." };
  const parsed = z.email().safeParse(String(form.get("email") ?? "").trim().toLowerCase());
  if (!parsed.success) return { error: "Enter a valid email address." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invites")
    .insert({ household_id: m.household.id, email: parsed.data })
    .select("token")
    .single();
  if (error) return { error: friendly(error) };

  revalidatePath("/settings");
  return {
    ok: "Invite created.",
    inviteLink: `${await siteOrigin()}/invite/${data.token}`,
    inviteEmail: parsed.data,
  };
}

export async function revokeInviteAction(form: FormData) {
  const m = await requireMembership();
  const id = z.uuid().parse(form.get("id"));
  const supabase = await createClient();
  await supabase.from("invites").delete().eq("id", id).eq("household_id", m.household.id);
  revalidatePath("/settings");
}

export async function renameHouseholdAction(_: ActionState, form: FormData): Promise<ActionState> {
  const m = await requireMembership();
  if (m.member.role !== "owner") return { error: "Only the owner can rename the household." };
  const parsed = name.safeParse(form.get("householdName"));
  if (!parsed.success) return { error: "Enter a household name." };
  const supabase = await createClient();
  const { error } = await supabase.from("households").update({ name: parsed.data }).eq("id", m.household.id);
  if (error) return { error: friendly(error) };
  revalidatePath("/", "layout");
  return { ok: "Saved." };
}

export async function updateDisplayNameAction(_: ActionState, form: FormData): Promise<ActionState> {
  const m = await requireMembership();
  const parsed = displayName.safeParse(form.get("displayName"));
  if (!parsed.success) return { error: "Enter your name." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("household_members")
    .update({ display_name: parsed.data })
    .eq("user_id", m.userId);
  if (error) return { error: friendly(error) };
  revalidatePath("/", "layout");
  return { ok: "Saved." };
}

export async function removeMemberAction(form: FormData) {
  const m = await requireMembership();
  const userId = z.uuid().parse(form.get("userId"));
  const supabase = await createClient();
  await supabase.from("household_members").delete().eq("household_id", m.household.id).eq("user_id", userId);
  if (userId === m.userId) redirect("/onboarding");
  revalidatePath("/settings");
}
