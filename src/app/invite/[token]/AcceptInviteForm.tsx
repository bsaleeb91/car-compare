"use client";

import { useActionState } from "react";
import { acceptInviteAction, type ActionState } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { FormMessage } from "@/components/FormMessage";

export function AcceptInviteForm({ token }: { token: string }) {
  const [state, action] = useActionState<ActionState, FormData>(acceptInviteAction, {});
  return (
    <form action={action} className="mt-4 space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="displayName" className="label">
          Your name
        </label>
        <input id="displayName" name="displayName" required maxLength={40} autoComplete="given-name" className="input" />
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingText="Joining…">Join household</SubmitButton>
    </form>
  );
}
