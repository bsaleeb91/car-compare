"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ next, initialError }: { next: string; initialError: string | null }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(
    initialError ? "That sign-in link didn't work or has expired. Request a new one." : null,
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    const supabase = createClient();
    const redirectTo = new URL("/auth/callback", window.location.origin);
    redirectTo.searchParams.set("next", next);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo.toString(), shouldCreateUser: true },
    });
    if (error) {
      setStatus("idle");
      setError(error.status === 429 ? "Too many requests. Wait a minute and try again." : error.message);
      return;
    }
    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <div role="status">
        <p className="font-medium">Check your email</p>
        <p className="mt-1 text-sm text-muted">
          We sent a sign-in link to <span className="font-medium text-foreground">{email}</span>. Open it on this
          device to continue.
        </p>
        <button className="btn-secondary mt-4 w-full" onClick={() => setStatus("idle")}>
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="label">
          Email
        </label>
        <input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button type="submit" className="btn-primary w-full" disabled={status === "sending"}>
        {status === "sending" ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
