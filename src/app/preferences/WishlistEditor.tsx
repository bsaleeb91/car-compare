"use client";

import { useState, useTransition } from "react";
import { addCustomFeatureAction, deleteCustomFeatureAction, setTierAction } from "@/app/compare-actions";
import type { Tier, WishItem } from "@/lib/features";

const TIERS: { tier: Tier; label: string; on: string }[] = [
  { tier: "must_have", label: "Must", on: "bg-coral text-white" },
  { tier: "nice_to_have", label: "Nice", on: "bg-teal text-white" },
  { tier: "dont_care", label: "—", on: "bg-surface text-foreground shadow-sm" },
];

/** Tap to sort each feature into must-have, nice-to-have or don't care. Saves on every tap. */
export function WishlistEditor({ items: initial }: { items: WishItem[] }) {
  const [items, setItems] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const categories = [...new Set(items.map((i) => i.category))];
  const count = (t: Tier) => items.filter((i) => i.tier === t).length;

  function setTier(id: string, tier: Tier) {
    const prev = items.find((i) => i.id === id)?.tier;
    setItems((xs) => xs.map((i) => (i.id === id ? { ...i, tier } : i)));
    setError(null);
    start(async () => {
      const res = await setTierAction({ id, tier });
      if (res.error && prev) {
        setError(res.error);
        setItems((xs) => xs.map((i) => (i.id === id ? { ...i, tier: prev } : i)));
      }
    });
  }

  return (
    <section className="card space-y-4" id="must-haves">
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          <span className="h-4 w-1.5 rounded-full bg-coral" />
          Must-haves & nice-to-haves
        </h2>
        <p className="mt-1 text-sm text-muted">
          Tap to sort. Cars missing a must-have get flagged in Compare. Saves as you go, for everyone in your household.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <span className="chip bg-coral-soft text-coral">{count("must_have")} must-have</span>
        <span className="chip bg-teal-soft text-teal">{count("nice_to_have")} nice-to-have</span>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="divide-y divide-border rounded-2xl border border-border">
        {categories.map((cat) => {
          const inCat = items.filter((i) => i.category === cat);
          const picked = inCat.filter((i) => i.tier !== "dont_care").length;
          const isOpen = open === cat;
          return (
            <div key={cat}>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : cat)}
                className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-surface-2/60"
              >
                <span className="font-medium">{cat}</span>
                <span className="flex items-center gap-2 text-xs text-muted">
                  {picked > 0 && <span className="chip bg-accent-soft text-accent">{picked} picked</span>}
                  {inCat.length} <span aria-hidden>{isOpen ? "▴" : "▾"}</span>
                </span>
              </button>
              {isOpen && (
                <ul className="space-y-1 px-3 pb-3">
                  {inCat.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-3 py-1">
                      <span className="min-w-0 text-sm">
                        {i.name}
                        {!i.catalog_key && (
                          <button
                            type="button"
                            className="ml-2 text-xs text-muted hover:text-coral"
                            disabled={pending}
                            onClick={() =>
                              start(async () => {
                                const res = await deleteCustomFeatureAction({ id: i.id });
                                if (res.error) setError(res.error);
                                else setItems((xs) => xs.filter((x) => x.id !== i.id));
                              })
                            }
                          >
                            Delete
                          </button>
                        )}
                      </span>
                      <span className="flex shrink-0 rounded-xl bg-surface-2 p-0.5" role="radiogroup" aria-label={i.name}>
                        {TIERS.map((t) => (
                          <button
                            key={t.tier}
                            type="button"
                            role="radio"
                            aria-checked={i.tier === t.tier}
                            aria-label={t.tier === "dont_care" ? "Don't care" : t.label}
                            onClick={() => setTier(i.id, t.tier)}
                            className={`min-h-9 min-w-12 rounded-lg px-2 text-xs font-semibold transition ${
                              i.tier === t.tier ? t.on : "text-muted hover:text-foreground"
                            }`}
                          >
                            {t.label}
                          </button>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            setError(null);
            const res = await addCustomFeatureAction({ name, tier: "must_have" });
            if (res.error || !res.item) setError(res.error ?? "Couldn't add that feature.");
            else {
              setItems((xs) => [...xs, res.item]);
              setName("");
              setOpen("Custom");
            }
          });
        }}
      >
        <label htmlFor="custom-feature" className="sr-only">
          Add your own feature
        </label>
        <input
          id="custom-feature"
          className="input"
          placeholder="Something missing? e.g. Black interior"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
        />
        <button type="submit" className="btn-secondary shrink-0" disabled={pending || !name.trim()}>
          Add
        </button>
      </form>
    </section>
  );
}
