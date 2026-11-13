import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getMembership, requireUser } from "@/lib/session";
import { AcceptInviteForm } from "./AcceptInviteForm";

type InviteInfo = {
  household_name: string;
  invited_by_name: string | null;
  email: string;
  expired: boolean;
  accepted: boolean;
};

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const { email } = await requireUser();
  const membership = await getMembership();

  let invite: InviteInfo | null = null;
  if (/^[0-9a-f]{64}$/.test(token)) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("get_invite", { p_token: token });
    invite = (data as InviteInfo[] | null)?.[0] ?? null;
  }

  let body: React.ReactNode;
  if (!invite) {
    body = <p>This invite link is not valid. Ask for a new one.</p>;
  } else if (membership && invite.accepted) {
    body = (
      <>
        <p>You&apos;re already in {membership.household.name}.</p>
        <Link href="/" className="btn-primary mt-4 w-full">
          Go to Car Compare
        </Link>
      </>
    );
  } else if (invite.accepted) {
    body = <p>This invite has already been used.</p>;
  } else if (invite.expired) {
    body = <p>This invite has expired. Ask {invite.invited_by_name ?? "the sender"} for a new one.</p>;
  } else if (membership) {
    body = (
      <p>
        You already belong to {membership.household.name}. Leave that household in Settings before joining another
        one.
      </p>
    );
  } else if (invite.email.toLowerCase() !== email.toLowerCase()) {
    body = (
      <>
        <p>
          This invite was sent to <span className="font-medium">{invite.email}</span>, but you&apos;re signed in as{" "}
          <span className="font-medium">{email}</span>.
        </p>
        <form action="/auth/signout" method="post" className="mt-4">
          <button className="btn-secondary w-full">Sign out and use the invited email</button>
        </form>
      </>
    );
  } else {
    body = (
      <>
        <p>
          {invite.invited_by_name ?? "Someone"} invited you to join <span className="font-medium">{invite.household_name}</span>.
        </p>
        <AcceptInviteForm token={token} />
      </>
    );
  }

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-10">
      <h1 className="text-2xl font-semibold">Join a household</h1>
      <div className="card mt-6">{body}</div>
    </main>
  );
}
