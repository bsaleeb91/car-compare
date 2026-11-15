"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { APP_TAG } from "@/lib/supabase/env";

type Step = "email" | "code";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");

export function LoginForm({ next }: { next: string }) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim(),
      // `data` is stored on the account only when it's first created. The redirect URL is
      // sent with every request, so a shared email template can tell which app asked even
      // for an account another app created. (It must be on the project's redirect allow-list.)
      options: {
        shouldCreateUser: true,
        data: { app: APP_TAG },
        ...(SITE_URL ? { emailRedirectTo: SITE_URL } : {}),
      },
    });
    setBusy(false);
    if (error) {
      setError(error.status === 429 ? "Too many requests. Wait a minute and try again." : "We couldn't send a code. Check the email address and try again.");
      return;
    }
    setCode("");
    setStep("code");
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    const token = code.replace(/\s/g, "");
    if (!/^\d{6,8}$/.test(token)) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.verifyOtp({ email: email.trim(), token, type: "email" });
    if (error) {
      setBusy(false);
      setError("That code didn't work. Check it and try again, or send a new one.");
      return;
    }
    // Full navigation so server components see the new session cookie.
    window.location.assign(next);
  }

  if (step === "code") {
    return (
      <form onSubmit={verifyCode} className="space-y-4">
        <p className="text-sm text-muted">
          We emailed a sign-in code to <span className="font-medium text-foreground">{email}</span>.
        </p>
        <div>
          <label htmlFor="code" className="label">
            Code
          </label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={9}
            required
            autoFocus
            className="input tracking-widest"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? "Checking…" : "Sign in"}
        </button>
        <button
          type="button"
          className="btn-secondary w-full"
          onClick={() => {
            setStep("email");
            setError(null);
          }}
        >
          Use a different email or resend
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={sendCode} className="space-y-4">
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
      <button type="submit" className="btn-primary w-full" disabled={busy}>
        {busy ? "Sending…" : "Email me a sign-in code"}
      </button>
    </form>
  );
}
