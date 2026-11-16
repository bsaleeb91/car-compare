"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionState } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { FormMessage } from "@/components/FormMessage";
import { ListingForm, type ListingDefaults } from "../ListingForm";
import {
  addLogAction,
  addQuoteAction,
  clearFollowUpAction,
  deleteListingAction,
  deleteLogAction,
  deleteQuoteAction,
  saveContactAction,
  setFeatureCheckAction,
  setListingStatusAction,
} from "../actions";

const STATUSES = [
  { key: "watching", label: "Watching", on: "bg-foreground text-background" },
  { key: "contacted", label: "Contacted", on: "bg-accent text-accent-foreground" },
  { key: "test-drive", label: "Test drive", on: "bg-amber text-white" },
  { key: "offer", label: "Offer", on: "bg-teal text-white" },
  { key: "passed", label: "Passed", on: "bg-coral text-white" },
];

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function useRun() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  // Server actions return { error } or { ok }; a redirect throws and navigates.
  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      setError(null);
      const res = (await fn()) as { error?: string } | undefined;
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  return { pending, error, run };
}

function Err({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-sm text-danger">
      {error}
    </p>
  ) : null;
}

export function StatusPicker({ id, status }: { id: string; status: string }) {
  const [cur, setCur] = useState(status);
  const { error, run } = useRun();
  return (
    <div>
      <div className="flex gap-1 overflow-x-auto rounded-2xl bg-surface-2 p-1 [scrollbar-width:none]" role="radiogroup" aria-label="Status">
        {STATUSES.map((s) => (
          <button
            key={s.key}
            type="button"
            role="radio"
            aria-checked={cur === s.key}
            onClick={() => {
              const prev = cur;
              setCur(s.key);
              run(async () => {
                const res = await setListingStatusAction({ id, status: s.key });
                if ("error" in res) setCur(prev);
                return res;
              });
            }}
            className={`flex-1 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition ${cur === s.key ? s.on : "text-muted hover:text-foreground"}`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <Err error={error} />
    </div>
  );
}

type Contact = { dealership: string; salesperson: string | null; phone: string | null; email: string | null } | null;

export function ContactCard({ listingId, contact, fallbackDealer }: { listingId: string; contact: Contact; fallbackDealer: string | null }) {
  const [editing, setEditing] = useState(!contact);
  const [state, action] = useActionState<ActionState, FormData>(async (prev, form) => {
    const res = await saveContactAction(prev, form);
    if (res.ok) setEditing(false);
    return res;
  }, {});

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Dealer contact</h2>
        {contact && !editing && (
          <button type="button" className="text-sm font-medium text-accent hover:underline" onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
      </div>
      {contact && !editing ? (
        <div className="space-y-2">
          <p className="font-medium">
            {contact.salesperson ? `${contact.salesperson} · ` : ""}
            {contact.dealership}
          </p>
          <div className="flex flex-wrap gap-2">
            {contact.phone && (
              <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} className="btn-secondary min-h-10 px-3 text-sm">
                📞 {contact.phone}
              </a>
            )}
            {contact.email && (
              <a href={`mailto:${contact.email}`} className="btn-secondary min-h-10 px-3 text-sm">
                ✉ {contact.email}
              </a>
            )}
          </div>
        </div>
      ) : (
        <form action={action} className="space-y-3">
          <input type="hidden" name="listing_id" value={listingId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <input name="dealership" required maxLength={120} className="input" placeholder="Dealership" defaultValue={contact?.dealership ?? fallbackDealer ?? ""} aria-label="Dealership" />
            <input name="salesperson" maxLength={80} className="input" placeholder="Salesperson" defaultValue={contact?.salesperson ?? ""} aria-label="Salesperson" />
            <input name="phone" type="tel" inputMode="tel" maxLength={30} className="input" placeholder="Phone" defaultValue={contact?.phone ?? ""} aria-label="Phone" />
            <input name="email" type="email" inputMode="email" className="input" placeholder="Email" defaultValue={contact?.email ?? ""} aria-label="Email" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <FormMessage state={state} />
            <span className="ml-auto flex gap-2">
              {contact && (
                <button type="button" className="btn-secondary min-h-10 px-3 text-sm" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              )}
              <SubmitButton className="btn-primary min-h-10 px-3 text-sm" pendingText="Saving…">
                Save contact
              </SubmitButton>
            </span>
          </div>
        </form>
      )}
    </section>
  );
}

type LogEntry = { id: string; logged_on: string; channel: string; summary: string; author: string; mine: boolean };

export function LogCard({ listingId, log, followUp, today }: { listingId: string; log: LogEntry[]; followUp: string | null; today: string }) {
  const [state, action] = useActionState<ActionState, FormData>(addLogAction, {});
  const { pending, error, run } = useRun();
  const [formKey, setFormKey] = useState(0);
  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Contact log</h2>
        {followUp && (
          <button type="button" disabled={pending} className="text-xs text-muted hover:text-foreground" onClick={() => run(() => clearFollowUpAction({ id: listingId }))}>
            Clear follow-up ({day(followUp)})
          </button>
        )}
      </div>
      <form
        key={formKey}
        action={async (form) => {
          await action(form);
          setFormKey((k) => k + 1);
        }}
        className="space-y-2"
      >
        <input type="hidden" name="listing_id" value={listingId} />
        <div className="grid grid-cols-2 gap-2">
          <select name="channel" className="input" defaultValue="call" aria-label="How">
            <option value="call">Call</option>
            <option value="text">Text</option>
            <option value="email">Email</option>
            <option value="in person">In person</option>
          </select>
          <input name="logged_on" type="date" required className="input" defaultValue={today} aria-label="Date" />
        </div>
        <textarea name="summary" required maxLength={2000} className="input min-h-16" placeholder="What did they say?" aria-label="Summary" />
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-muted">
            Next follow-up
            <input name="follow_up_on" type="date" className="input w-auto py-2" />
          </label>
          <SubmitButton className="btn-primary ml-auto min-h-10 px-3 text-sm" pendingText="Saving…">
            Log it
          </SubmitButton>
        </div>
        {state.error && <FormMessage state={state} />}
      </form>
      <Err error={error} />
      {log.length > 0 && (
        <ul className="space-y-2 border-t border-border pt-3">
          {log.map((e) => (
            <li key={e.id} className="text-sm">
              <div className="flex items-baseline justify-between gap-2 text-xs text-muted">
                <span>
                  <span className="font-semibold capitalize text-foreground">{e.channel}</span> · {day(e.logged_on)} · {e.mine ? "You" : e.author}
                </span>
                {e.mine && (
                  <button type="button" className="hover:text-coral" disabled={pending} onClick={() => run(() => deleteLogAction({ id: e.id, listingId }))}>
                    Delete
                  </button>
                )}
              </div>
              <p className="whitespace-pre-wrap">{e.summary}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type Quote = { id: string; quoted_on: string; otd_price: number | null; apr_offered: number | null; includes: string | null; expires_on: string | null };

export function QuotesCard({ listingId, quotes, today }: { listingId: string; quotes: Quote[]; today: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionState, FormData>(async (prev, form) => {
    const res = await addQuoteAction(prev, form);
    if (res.ok) setOpen(false);
    return res;
  }, {});
  const { pending, error, run } = useRun();
  const best = quotes.reduce<number | null>((b, q) => (q.otd_price != null && (b == null || q.otd_price < b) ? q.otd_price : b), null);

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Quotes</h2>
        {!open && (
          <button type="button" className="text-sm font-medium text-accent hover:underline" onClick={() => setOpen(true)}>
            + Add quote
          </button>
        )}
      </div>
      {open && (
        <form action={action} className="space-y-2 rounded-xl bg-surface-2 p-3">
          <input type="hidden" name="listing_id" value={listingId} />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted">
              Out-the-door price
              <input name="otd_price" inputMode="decimal" className="input mt-1" placeholder="$34,200" />
            </label>
            <label className="text-xs text-muted">
              APR offered
              <input name="apr_offered" type="number" step="0.01" min={0} max={40} inputMode="decimal" className="input mt-1" placeholder="5.9" />
            </label>
            <label className="text-xs text-muted">
              Quoted on
              <input name="quoted_on" type="date" required defaultValue={today} className="input mt-1" />
            </label>
            <label className="text-xs text-muted">
              Expires
              <input name="expires_on" type="date" className="input mt-1" />
            </label>
          </div>
          <input name="includes" maxLength={300} className="input" placeholder="What's included (fees, warranty, mats…)" aria-label="What's included" />
          <div className="flex items-center justify-between gap-2">
            <FormMessage state={state} />
            <span className="ml-auto flex gap-2">
              <button type="button" className="btn-secondary min-h-10 px-3 text-sm" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <SubmitButton className="btn-primary min-h-10 px-3 text-sm" pendingText="Saving…">
                Save quote
              </SubmitButton>
            </span>
          </div>
        </form>
      )}
      <Err error={error} />
      {quotes.length === 0 ? (
        !open && <p className="text-sm text-muted">No quotes yet. Ask for an out-the-door price in writing.</p>
      ) : (
        <ul className="divide-y divide-border">
          {quotes.map((q) => {
            const expired = q.expires_on != null && q.expires_on < today;
            return (
              <li key={q.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold tabular-nums">
                    {q.otd_price != null ? usd(q.otd_price) : "—"}
                    {q.otd_price != null && q.otd_price === best && quotes.length > 1 && <span className="chip ml-2 bg-best text-best-foreground">Best</span>}
                    {q.apr_offered != null && <span className="ml-2 font-normal text-muted">{q.apr_offered}% APR</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {day(q.quoted_on)}
                    {q.expires_on && <span className={expired ? "text-coral" : ""}> · {expired ? "expired" : "expires"} {day(q.expires_on)}</span>}
                  </p>
                  {q.includes && <p className="text-xs">{q.includes}</p>}
                </div>
                <button type="button" className="text-xs text-muted hover:text-coral" disabled={pending} onClick={() => run(() => deleteQuoteAction({ id: q.id, listingId }))}>
                  Delete
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

type Check = { id: string; name: string; tier: string; status: string | undefined; checked: boolean | undefined };

/** Tick off must-haves and nice-to-haves on this specific car; a tick overrides what the model's specs say. */
export function FeatureChecks({ listingId, items }: { listingId: string; items: Check[] }) {
  const [state, setState] = useState(() => Object.fromEntries(items.map((i) => [i.id, i.checked])) as Record<string, boolean | undefined>);
  const { error, run } = useRun();
  const set = (id: string, v: boolean) => {
    const next = state[id] === v ? null : v;
    setState((s) => ({ ...s, [id]: next ?? undefined }));
    run(() => setFeatureCheckAction({ listingId, itemId: id, hasIt: next }));
  };
  return (
    <section className="card space-y-3">
      <div>
        <h2 className="font-semibold">Does this car have…</h2>
        <p className="text-sm text-muted">Check on the lot or in the listing photos.</p>
      </div>
      <Err error={error} />
      {items.length === 0 ? (
        <p className="text-sm text-muted">Pick must-haves in Preferences to check them here.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((i) => {
            const v = state[i.id];
            const fromSpecs = v === undefined && i.status !== "trim";
            return (
              <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0">
                  {i.name}
                  <span className={`ml-1.5 text-xs ${i.tier === "must_have" ? "text-coral" : "text-teal"}`}>{i.tier === "must_have" ? "must" : "nice"}</span>
                  {fromSpecs && <span className="ml-1.5 text-xs text-muted">({i.status === "yes" ? "yes" : "no"} per specs)</span>}
                </span>
                <span className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    aria-pressed={v === true}
                    onClick={() => set(i.id, true)}
                    className={`min-h-9 rounded-lg px-3 text-xs font-semibold ${v === true ? "bg-success text-white" : "bg-surface-2 text-muted"}`}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    aria-pressed={v === false}
                    onClick={() => set(i.id, false)}
                    className={`min-h-9 rounded-lg px-3 text-xs font-semibold ${v === false ? "bg-coral text-white" : "bg-surface-2 text-muted"}`}
                  >
                    No
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function DetailsCard({ cars, listing }: { cars: { id: string; name: string }[]; listing: ListingDefaults }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="card space-y-3">
      <button type="button" aria-expanded={open} className="flex w-full items-center justify-between font-semibold" onClick={() => setOpen(!open)}>
        Edit details <span aria-hidden className="text-sm text-muted">{open ? "▴" : "▾"}</span>
      </button>
      {open && <ListingForm cars={cars} defaults={listing} onDone={() => setOpen(false)} />}
    </section>
  );
}

export function DeleteListing({ id }: { id: string }) {
  const [sure, setSure] = useState(false);
  const { pending, error, run } = useRun();
  return (
    <div className="flex flex-col items-end gap-1">
      {sure ? (
        <span className="flex items-center gap-2 text-sm">
          Delete this listing, its quotes, contact log and notes?
          <button type="button" className="btn-secondary min-h-9 px-3 text-sm" onClick={() => setSure(false)}>
            Keep
          </button>
          <button type="button" disabled={pending} className="btn-danger min-h-9 px-3 text-sm" onClick={() => run(() => deleteListingAction({ id }))}>
            {pending ? "Deleting…" : "Delete"}
          </button>
        </span>
      ) : (
        <button type="button" className="text-sm text-muted hover:text-coral" onClick={() => setSure(true)}>
          Delete listing
        </button>
      )}
      <Err error={error} />
      <p className="text-xs text-muted">Tip: mark it &quot;Passed&quot; instead to keep its history.</p>
    </div>
  );
}
