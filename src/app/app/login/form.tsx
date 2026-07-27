"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { createAuthClient } from "better-auth/react";
import { CueMark } from "@/components/cue-mark";

const client = createAuthClient();

export function LoginForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const data = new FormData(e.currentTarget);
    const { error } = await client.signIn.email({
      email: String(data.get("email") ?? ""),
      password: String(data.get("password") ?? ""),
    });

    if (error) {
      // Never distinguish "no such account" from "wrong password" — one message
      // for both, or this form becomes an account-enumeration oracle.
      setError("Those credentials didn't work.");
      setPending(false);
      return;
    }
    // Hard navigation so the workspace is fetched with the new session cookie
    // rather than from a router cache populated while signed out.
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
          <h1 className="cue-auth-title">Sign in to your studio</h1>
          <p className="cue-auth-sub">Your Cues, your templates, your record.</p>
        </div>

        <label className="cue-auth-field">
          <span>Email</span>
          <input
            className="cue-input"
            name="email"
            type="email"
            required
            autoComplete="email"
            autoFocus
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
            autoComplete="current-password"
            placeholder="••••••••••••"
            aria-invalid={!!error}
          />
        </label>

        {error ? (
          <p className="cue-auth-err" role="alert">
            <AlertCircle size={15} strokeWidth={2} />
            {error}
          </p>
        ) : (
          <span aria-hidden />
        )}

        <div>
          <button
            className="cue-btn cue-btn-dark cue-btn-block cue-auth-submit"
            type="submit"
            disabled={pending}
          >
            {pending ? (
              <Loader2 size={15} strokeWidth={2.25} className="cue-spin" />
            ) : (
              <>
                Sign in
                <ArrowRight size={15} strokeWidth={2.25} />
              </>
            )}
          </button>

          <p className="cue-auth-foot">
            New here? <Link href="/app/signup">Create a studio</Link>
          </p>
        </div>
      </form>
    </main>
  );
}
