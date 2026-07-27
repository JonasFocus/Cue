"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { createAuthClient } from "better-auth/react";
import { CueMark } from "@/components/cue-mark";

const client = createAuthClient();

/* Mirrors `emailAndPassword.minPasswordLength` in src/lib/auth.ts. Checked here
   only so the rule is stated before the round trip; the server is the rule. */
const MIN_PASSWORD = 12;

export function SignupForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const data = new FormData(e.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");

    if (password.length < MIN_PASSWORD) {
      setError(`Passwords need at least ${MIN_PASSWORD} characters.`);
      return;
    }

    setPending(true);
    const { error } = await client.signUp.email({ email, password, name });

    if (error) {
      /* A signup form cannot hide that an address is taken — the account either
         gets created or it does not. So say it plainly and neutrally, and point
         at sign-in rather than implying anything about who owns it. Matched on
         the status rather than the error code so a Better Auth upgrade that
         renames the code degrades to the generic message instead of failing to
         compile. */
      setError(
        error.status === 422
          ? "That email already has a Cue studio. Try signing in instead."
          : "We couldn't create the studio. Check the details and try again.",
      );
      setPending(false);
      return;
    }
    window.location.href = "/app";
  }

  return (
    <main className="cue-auth">
      <div className="cue-hero-orb" aria-hidden />
      <div className="cue-hero-grid" aria-hidden />

      <form className="cue-auth-card" onSubmit={onSubmit}>
        <div className="cue-auth-head">
          <span className="cue-brand">
            <span className="cue-brand-mark">
              <CueMark size={15} />
            </span>
            Cue
          </span>
          <span className="cue-auth-chip">Studio</span>
        </div>

        <div>
          <h1 className="cue-auth-title">Create your studio</h1>
          <p className="cue-auth-sub">
            Five sent Cues on the free plan. No card required.
          </p>
        </div>

        <label className="cue-auth-field">
          <span>Studio name</span>
          <input
            className="cue-input"
            name="name"
            type="text"
            required
            maxLength={120}
            autoComplete="name"
            autoFocus
            placeholder="Harper Studio"
          />
        </label>

        <label className="cue-auth-field">
          <span>Email</span>
          <input
            className="cue-input"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@studio.com"
            aria-invalid={!!error}
          />
        </label>

        <label className="cue-auth-field">
          <span>Password</span>
          <input
            className="cue-input"
            name="password"
            type="password"
            required
            minLength={MIN_PASSWORD}
            autoComplete="new-password"
            placeholder="••••••••••••"
            aria-invalid={!!error}
          />
          {/* <small>, not <span>: `.cue-auth-field > span` is the field label. */}
          <small
            style={{
              display: "block",
              marginTop: 7,
              fontSize: 12.5,
              lineHeight: 1.45,
              color: "var(--cue-muted)",
            }}
          >
            At least {MIN_PASSWORD} characters.
          </small>
        </label>

        {error ? (
          <p className="cue-auth-err" role="alert">
            <AlertCircle size={15} strokeWidth={2} />
            {error}
          </p>
        ) : (
          <span aria-hidden />
        )}

        {/* The card staggers its children with :nth-child rules that stop at
            six; this form has seven, so the last one carries its own delay. */}
        <div style={{ animationDelay: "450ms" }}>
          <button
            className="cue-btn cue-btn-dark cue-btn-block cue-auth-submit"
            type="submit"
            disabled={pending}
          >
            {pending ? (
              <Loader2 size={15} strokeWidth={2.25} className="cue-spin" />
            ) : (
              <>
                Create studio
                <ArrowRight size={15} strokeWidth={2.25} />
              </>
            )}
          </button>

          <p className="cue-auth-foot">
            Already have a studio? <Link href="/app/login">Sign in</Link>
          </p>
        </div>
      </form>
    </main>
  );
}
