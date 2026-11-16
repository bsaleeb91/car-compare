"use client";

import { useActionState } from "react";
import { saveListingAction } from "./actions";
import type { ActionState } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { FormMessage } from "@/components/FormMessage";

export type ListingDefaults = {
  id?: string;
  vehicle_id?: string;
  year?: number | null;
  trim_label?: string | null;
  miles?: number | null;
  asking_price?: number | null;
  dealer?: string | null;
  url?: string | null;
  vin?: string | null;
  condition?: string;
  accidents_owners?: string | null;
  status?: string;
  follow_up_on?: string | null;
};

/** Quick add (only the car is required) and full edit for a listing. */
export function ListingForm({
  cars,
  defaults = {},
  onDone,
}: {
  cars: { id: string; name: string }[];
  defaults?: ListingDefaults;
  onDone?: () => void;
}) {
  const [state, action] = useActionState<ActionState, FormData>(async (prev, form) => {
    const res = await saveListingAction(prev, form);
    if (res.ok) onDone?.();
    return res;
  }, {});
  const d = defaults;
  const v = (x: unknown) => (x == null ? "" : String(x));

  return (
    <form action={action} className="space-y-4">
      {d.id && <input type="hidden" name="id" value={d.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="url" className="label">
            Link to the listing
          </label>
          <input id="url" name="url" type="url" inputMode="url" className="input" placeholder="https://…" defaultValue={v(d.url)} />
        </div>
        <div>
          <label htmlFor="vehicle_id" className="label">
            Car
          </label>
          <select id="vehicle_id" name="vehicle_id" required className="input" defaultValue={v(d.vehicle_id)}>
            <option value="" disabled>
              Pick a car
            </option>
            {cars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="year" className="label">
              Year
            </label>
            <input id="year" name="year" type="number" inputMode="numeric" min={1980} max={2100} className="input" defaultValue={v(d.year)} />
          </div>
          <div>
            <label htmlFor="trim_label" className="label">
              Trim
            </label>
            <input id="trim_label" name="trim_label" maxLength={60} className="input" placeholder="EX-L" defaultValue={v(d.trim_label)} />
          </div>
        </div>
        <div>
          <label htmlFor="asking_price" className="label">
            Asking price
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-muted">$</span>
            <input id="asking_price" name="asking_price" inputMode="decimal" className="input pl-7" placeholder="32,500" defaultValue={v(d.asking_price)} />
          </div>
        </div>
        <div>
          <label htmlFor="miles" className="label">
            Miles
          </label>
          <input id="miles" name="miles" type="number" inputMode="numeric" min={0} className="input" defaultValue={v(d.miles)} />
        </div>
        <div>
          <label htmlFor="dealer" className="label">
            Dealer
          </label>
          <input id="dealer" name="dealer" maxLength={120} className="input" defaultValue={v(d.dealer)} />
        </div>
        <div>
          <label htmlFor="condition" className="label">
            Condition
          </label>
          <select id="condition" name="condition" className="input" defaultValue={d.condition ?? "used"}>
            <option value="used">Used</option>
            <option value="cpo">Certified pre-owned</option>
            <option value="new">New</option>
          </select>
        </div>
        {d.id && (
          <>
            <div>
              <label htmlFor="vin" className="label">
                VIN
              </label>
              <input id="vin" name="vin" maxLength={17} className="input font-mono uppercase" defaultValue={v(d.vin)} />
            </div>
            <div>
              <label htmlFor="accidents_owners" className="label">
                Accidents / owners
              </label>
              <input id="accidents_owners" name="accidents_owners" maxLength={200} className="input" placeholder="Clean, 1 owner" defaultValue={v(d.accidents_owners)} />
            </div>
          </>
        )}
        <div>
          <label htmlFor="follow_up_on" className="label">
            Follow up on
          </label>
          <input id="follow_up_on" name="follow_up_on" type="date" className="input" defaultValue={v(d.follow_up_on)} />
        </div>
        <input type="hidden" name="status" value={d.status ?? "watching"} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <FormMessage state={state} />
        <SubmitButton className="btn-primary ml-auto" pendingText="Saving…">
          {d.id ? "Save changes" : "Add listing"}
        </SubmitButton>
      </div>
    </form>
  );
}
