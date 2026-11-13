"use client";

import { useActionState, useState } from "react";
import {
  createInviteAction,
  renameHouseholdAction,
  updateDisplayNameAction,
  type ActionState,
} from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { FormMessage } from "@/components/FormMessage";

export function HouseholdNameForm({ name }: { name: string }) {
  const [state, action] = useActionState<ActionState, FormData>(renameHouseholdAction, {});
  return (
    <form action={action} className="space-y-2">
      <label htmlFor="householdName" className="label">
        Household name
      </label>
      <div className="flex gap-2">
        <input id="householdName" name="householdName" defaultValue={name} required maxLength={80} className="input" />
        <SubmitButton className="btn-secondary shrink-0" pendingText="Saving…">
          Save
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function DisplayNameForm({ displayName }: { displayName: string }) {
  const [state, action] = useActionState<ActionState, FormData>(updateDisplayNameAction, {});
  return (
    <form action={action} className="space-y-2">
      <label htmlFor="displayName" className="label">
        Your display name
      </label>
      <div className="flex gap-2">
        <input id="displayName" name="displayName" defaultValue={displayName} required maxLength={40} className="input" />
        <SubmitButton className="btn-secondary shrink-0" pendingText="Saving…">
          Save
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function InviteForm({ householdName }: { householdName: string }) {
  const [state, action] = useActionState<ActionState, FormData>(createInviteAction, {});
  const [copied, setCopied] = useState(false);

  const subject = `Join ${householdName} on Car Compare`;
  const body = state.inviteLink
    ? `I set up Car Compare so we can research cars together. Sign in with this email address to join: ${state.inviteLink}`
    : "";

  async function share() {
    if (!state.inviteLink) return;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: subject, text: body });
        return;
      } catch {
        // Cancelled or unsupported: fall back to copying.
      }
    }
    await navigator.clipboard.writeText(state.inviteLink);
    setCopied(true);
  }

  return (
    <div className="space-y-3">
      <form action={action} className="space-y-2">
        <label htmlFor="inviteEmail" className="label">
          Their email
        </label>
        <div className="flex gap-2">
          <input
            id="inviteEmail"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="off"
            required
            className="input"
            placeholder="partner@example.com"
          />
          <SubmitButton className="btn-primary shrink-0" pendingText="Creating…">
            Invite
          </SubmitButton>
        </div>
        {!state.inviteLink && <FormMessage state={state} />}
      </form>

      {state.inviteLink && (
        <div className="rounded-xl border border-border bg-background p-3">
          <p className="text-sm">Invite ready for {state.inviteEmail}. Send them the link:</p>
          <p className="mt-2 break-all font-mono text-xs text-muted">{state.inviteLink}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a
              className="btn-primary text-sm"
              href={`mailto:${state.inviteEmail ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
            >
              Email it
            </a>
            <button type="button" className="btn-secondary text-sm" onClick={share}>
              {copied ? "Copied" : "Share / copy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
