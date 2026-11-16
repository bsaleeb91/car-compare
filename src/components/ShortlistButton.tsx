"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setShortlistAction } from "@/app/compare-actions";

/** Remove a car from the shortlist (reversible), or put a removed one back. */
export function ShortlistButton({
  vehicleId,
  name,
  removed = false,
  className = "",
}: {
  vehicleId: string;
  name: string;
  removed?: boolean;
  className?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function go() {
    setError(null);
    start(async () => {
      const res = await setShortlistAction({ vehicleId, removed: !removed });
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <span className={`inline-flex flex-col items-start ${className}`}>
      {removed ? (
        <button type="button" onClick={go} disabled={pending} className="btn-secondary min-h-9 px-3 text-sm">
          {pending ? "Restoring…" : "Put back"}
        </button>
      ) : (
        <button
          type="button"
          onClick={go}
          disabled={pending}
          aria-label={`Remove ${name} from your list`}
          title={`Remove ${name} from your list`}
          className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted transition hover:bg-coral-soft hover:text-coral disabled:opacity-50"
        >
          <span aria-hidden className="text-sm leading-none">✕</span>
          {pending ? "Removing…" : "Remove"}
        </button>
      )}
      {error && (
        <span role="alert" className="mt-1 text-xs text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
