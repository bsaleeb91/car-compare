"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTrimTargetAction } from "@/app/compare-actions";

/** Mark a trim as a target for the listings stage, or clear it. */
export function TrimTargetButton({ trimId, target }: { trimId: string; target: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        aria-pressed={target}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await setTrimTargetAction({ trimId, target: !target });
            if (res.error) setError(res.error);
            else router.refresh();
          })
        }
        className={`min-h-9 rounded-xl px-3 text-sm font-medium transition disabled:opacity-50 ${
          target ? "bg-teal text-white" : "btn-secondary"
        }`}
      >
        {target ? "★ Target" : "Make target"}
      </button>
      {error && (
        <span role="alert" className="mt-1 text-xs text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
