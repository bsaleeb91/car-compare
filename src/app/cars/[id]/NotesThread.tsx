"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addNoteAction, deleteNoteAction, editNoteAction } from "@/app/compare-actions";

export type Note = { id: string; author_id: string; author: string; body: string; created_at: string; updated_at: string };

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function NotesThread({ vehicleId, notes, myId }: { vehicleId: string; notes: Note[]; myId: string }) {
  const [body, setBody] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const run = (fn: () => Promise<{ error?: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.error) setError(res.error);
      else {
        after?.();
        router.refresh();
      }
    });

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="font-semibold">Notes</h2>
        <p className="text-sm text-muted">Shared with your household. New notes show up for everyone right away.</p>
      </div>

      {notes.length === 0 ? (
        <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">No notes yet. What stood out about this car?</p>
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => {
            const mine = n.author_id === myId;
            return (
              <li key={n.id} className={`rounded-2xl p-3 ${mine ? "bg-accent-soft" : "bg-surface-2"}`}>
                <div className="flex items-baseline justify-between gap-2 text-xs text-muted">
                  <span>
                    <span className="font-semibold text-foreground">{mine ? "You" : n.author}</span> · {when(n.created_at)}
                    {n.updated_at !== n.created_at && " · edited"}
                  </span>
                  {mine && editing !== n.id && (
                    <span className="flex gap-1">
                      <button
                        type="button"
                        className="rounded px-1.5 py-0.5 hover:bg-surface hover:text-foreground"
                        onClick={() => {
                          setEditing(n.id);
                          setDraft(n.body);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        className="rounded px-1.5 py-0.5 hover:bg-coral-soft hover:text-coral"
                        onClick={() => run(() => deleteNoteAction({ id: n.id }))}
                      >
                        Delete
                      </button>
                    </span>
                  )}
                </div>
                {editing === n.id ? (
                  <div className="mt-2 space-y-2">
                    <textarea className="input min-h-20" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={5000} />
                    <div className="flex justify-end gap-2">
                      <button type="button" className="btn-secondary min-h-9 px-3 text-sm" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        className="btn-primary min-h-9 px-3 text-sm"
                        onClick={() => run(() => editNoteAction({ id: n.id, body: draft }), () => setEditing(null))}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 whitespace-pre-wrap text-sm">{n.body}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addNoteAction({ vehicleId, body }), () => setBody(""));
        }}
      >
        <label htmlFor="new-note" className="sr-only">
          Add a note
        </label>
        <textarea
          id="new-note"
          className="input min-h-20"
          placeholder="Add a note…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={5000}
        />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={pending || !body.trim()}>
            {pending ? "Saving…" : "Add note"}
          </button>
        </div>
      </form>
    </section>
  );
}
