"use client";

import { useState } from "react";
import { ListingForm } from "./ListingForm";

/** Collapsed "Add a listing" card; opens pre-set to a car when linked from that car's page. */
export function AddListing({ cars, openFor }: { cars: { id: string; name: string }[]; openFor?: string }) {
  const [open, setOpen] = useState(Boolean(openFor));
  if (!open)
    return (
      <button type="button" className="btn-primary w-full sm:w-auto" onClick={() => setOpen(true)}>
        + Add a listing
      </button>
    );
  return (
    <section className="card space-y-3 border-accent/30">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Add a listing</h2>
        <button type="button" className="text-sm text-muted hover:text-foreground" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {cars.length === 0 ? (
        <p className="text-sm text-muted">Your list is empty. Put a car back on your list first.</p>
      ) : (
        <ListingForm cars={cars} defaults={{ vehicle_id: openFor && cars.some((c) => c.id === openFor) ? openFor : undefined }} />
      )}
    </section>
  );
}
