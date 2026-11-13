"use client";

import { useActionState } from "react";
import { createHouseholdAction, type ActionState } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { FormMessage } from "@/components/FormMessage";

export function CreateHouseholdForm() {
  const [state, action] = useActionState<ActionState, FormData>(createHouseholdAction, {});
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="householdName" className="label">
          Household name
        </label>
        <input id="householdName" name="householdName" required maxLength={80} className="input" placeholder="The Smith family" />
      </div>
      <div>
        <label htmlFor="displayName" className="label">
          Your name
        </label>
        <input id="displayName" name="displayName" required maxLength={40} autoComplete="given-name" className="input" />
        <p className="mt-1 text-xs text-muted">Shown next to your notes and scores.</p>
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingText="Creating…">Create household</SubmitButton>
    </form>
  );
}
