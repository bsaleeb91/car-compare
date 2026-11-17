"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setFinalistAction } from "@/app/compare-actions";

/** Mark a car as a finalist (it moves on to the Trims stage), or take it back to "considering". */
export function FinalistButton({ vehicleId, name, finalist, className = "" }: { vehicleId: string; name: string; finalist: boolean; className?: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <span className={`inline-flex flex-col items-start ${className}`}>
      <button
        type="button"
        aria-pressed={finalist}
        aria-label={finalist ? `${name} is a finalist. Click to undo` : `Make ${name} a finalist`}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await setFinalistAction({ vehicleId, finalist: !finalist });
            if ("error" in res && res.error) setError(res.error);
            else router.refresh();
          })
        }
        className={`min-h-9 rounded-xl px-3 text-sm font-medium transition disabled:opacity-50 ${finalist ? "bg-teal text-white" : "btn-secondary"}`}
      >
        {finalist ? "★ Finalist" : "Make finalist"}
      </button>
      {error && (
        <span role="alert" className="mt-1 text-xs text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
