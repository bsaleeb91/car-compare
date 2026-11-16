"use client";

import { useActionState, useState } from "react";
import { updatePreferencesAction } from "@/app/compare-actions";
import type { ActionState } from "@/app/actions";
import { CRITERIA } from "@/lib/calc";
import type { Preferences } from "@/lib/data";
import { SubmitButton } from "@/components/SubmitButton";
import { FormMessage } from "@/components/FormMessage";

function Field({
  name,
  label,
  value,
  suffix,
  prefix,
  step = "any",
  optional,
}: {
  name: string;
  label: string;
  value: number | null;
  suffix?: string;
  prefix?: string;
  step?: string;
  optional?: boolean;
}) {
  return (
    <div>
      <label htmlFor={name} className="label">
        {label}
      </label>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-muted">{prefix}</span>}
        <input
          id={name}
          name={name}
          type="number"
          inputMode="decimal"
          step={step}
          min={0}
          required={!optional}
          defaultValue={value ?? ""}
          className={`input ${prefix ? "pl-7" : ""} ${suffix ? "pr-14" : ""}`}
        />
        {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-sm text-muted">{suffix}</span>}
      </div>
    </div>
  );
}

function Section({ title, color, children, note }: { title: string; color: string; children: React.ReactNode; note?: string }) {
  return (
    <section className="card space-y-4">
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          <span className={`h-4 w-1.5 rounded-full ${color}`} />
          {title}
        </h2>
        {note && <p className="mt-1 text-sm text-muted">{note}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

const WEIGHT_COLORS = ["bg-accent", "bg-teal", "bg-amber", "bg-coral", "bg-success", "bg-[#0ea5e9]", "bg-[#a855f7]"];

export function PreferencesForm({ prefs: p }: { prefs: Preferences }) {
  const [state, action] = useActionState<ActionState, FormData>(updatePreferencesAction, {});
  const [weights, setWeights] = useState(() => Object.fromEntries(CRITERIA.map((c) => [c.key, p.weights[c.key] ?? 0])));
  const total = Object.values(weights).reduce((a, b) => a + (Number(b) || 0), 0);

  return (
    <form action={action} className="space-y-4">
      <Section title="Budget & financing" color="bg-coral">
        <Field name="budget_min" label="Budget from" prefix="$" value={p.budget_min} step="500" />
        <Field name="budget_max" label="Budget up to" prefix="$" value={p.budget_max} step="500" />
        <Field name="down_payment" label="Down payment" prefix="$" value={p.down_payment} step="500" />
        <Field name="loan_months" label="Loan length" suffix="months" value={p.loan_months} step="1" />
        <Field name="apr_used" label="APR, used" suffix="%" value={p.apr_used} />
        <Field name="apr_cpo" label="APR, certified pre-owned" suffix="%" value={p.apr_cpo} />
        <Field name="apr_new" label="APR, new" suffix="%" value={p.apr_new} />
        <Field name="sales_tax_pct" label="Sales tax" suffix="%" value={p.sales_tax_pct} />
        <Field name="fees" label="Dealer & registration fees" prefix="$" value={p.fees} step="50" />
        <label className="flex items-center gap-3 self-end rounded-xl border border-border p-3">
          <input type="checkbox" name="include_tax_fees" defaultChecked={p.include_tax_fees} className="size-5 accent-[var(--accent)]" />
          <span className="text-sm">Include tax and fees in payments</span>
        </label>
      </Section>

      <Section title="Driving" color="bg-amber">
        <Field name="miles_per_year" label="Miles per year" value={p.miles_per_year} step="500" />
        <Field name="gas_price" label="Gas price" prefix="$" suffix="/gal" value={p.gas_price} step="0.01" />
      </Section>

      <Section title="Garage" color="bg-teal" note="Inside measurements. Leave blank if you park outside.">
        <Field name="garage_depth_in" label="Depth" suffix="in" value={p.garage_depth_in} optional />
        <Field name="garage_door_width_in" label="Door width" suffix="in" value={p.garage_door_width_in} optional />
        <Field name="garage_door_height_in" label="Door height" suffix="in" value={p.garage_door_height_in} optional />
        <Field name="min_walkaround_in" label="Walk-around room you need" suffix="in" value={p.min_walkaround_in} />
      </Section>

      <section className="card space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <span className="h-4 w-1.5 rounded-full bg-accent" />
              What matters most
            </h2>
            <p className="mt-1 text-sm text-muted">Weights for the score. They must total 100%.</p>
          </div>
          <span className={`chip shrink-0 text-sm ${total === 100 ? "bg-best text-best-foreground" : "bg-coral-soft text-coral"}`}>
            {total}% / 100%
          </span>
        </div>
        <div className="flex h-3 overflow-hidden rounded-full bg-surface-2" aria-hidden>
          {CRITERIA.map((c, i) => (
            <span key={c.key} className={WEIGHT_COLORS[i]} style={{ width: `${Math.min(100, Number(weights[c.key]) || 0)}%` }} />
          ))}
        </div>
        <ul className="space-y-3">
          {CRITERIA.map((c, i) => (
            <li key={c.key} className="grid grid-cols-[1fr_auto] items-center gap-3">
              <label htmlFor={`w_${c.key}`} className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span className={`size-2.5 shrink-0 rounded-full ${WEIGHT_COLORS[i]}`} />
                  {c.label}
                </span>
                <span className="ml-4.5 block text-xs text-muted">{c.hint}</span>
              </label>
              <div className="relative w-24">
                <input
                  id={`w_${c.key}`}
                  name={`w_${c.key}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  step={5}
                  required
                  value={weights[c.key]}
                  onChange={(e) => setWeights((w) => ({ ...w, [c.key]: e.target.value === "" ? 0 : Number(e.target.value) }))}
                  className="input pr-8 text-right"
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-sm text-muted">%</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="sticky bottom-3 z-10 card flex items-center justify-between gap-3 border-accent/30">
        <FormMessage state={state} />
        <SubmitButton className="btn-primary ml-auto shrink-0" pendingText="Saving…">
          Save preferences
        </SubmitButton>
      </div>
    </form>
  );
}
