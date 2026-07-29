"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Loader2, Mail } from "lucide-react";
import { createAuthClient } from "better-auth/react";

const client = createAuthClient();

/* Mirrors `emailAndPassword.minPasswordLength` in src/lib/auth.ts. Checked here
   only so the rule is stated before the round trip; the server is the rule. */
const MIN_PASSWORD = 12;

/* The second half of the invite landing: two fields and a button.
 *
 * Reached only behind a live invite — the page above resolves the token and
 * renders a closed door otherwise. It is still not the enforcement: that is the
 * `user.create.before` hook in src/lib/auth.ts, which sits inside the account
 * creation and so also catches a POST aimed straight at the auth endpoint. */
export function InviteSignupForm({
  name,
  email,
  token,
}: {
  name: string;
  email: string;
  token: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const data = new FormData(e.currentTarget);
    const studioName = String(data.get("name") ?? "").trim();
    const password = String(data.get("password") ?? "");

    if (password.length < MIN_PASSWORD) {
      setError(`Passwords need at least ${MIN_PASSWORD} characters.`);
      return;
    }

    setPending(true);
    // The invited address, never a form field: the account has to be created
    // for the address the invite names, or the hook refuses it.
    const { error } = await client.signUp.email({
      email,
      password,
      name: studioName,
    }, {
      // Better Auth's generated signup type only exposes persisted user fields.
      // Request options are merged into the JSON body, where the server hook
      // can verify this non-persisted invite credential.
      body: { inviteToken: token },
    });

    if (error) {
      setError(
        error.status === 422
          ? "That email already has a Cue studio. Try signing in instead."
          : error.status === 403
            ? "This invite is no longer open. Ask for a new link."
            : "We couldn't create the studio. Check the details and try again.",
      );
      setPending(false);
      return;
    }
    window.location.href = "/app";
  }

  return (
    <form className="ci-form" onSubmit={onSubmit}>
      <p className="ci-rule">Create your studio</p>

      <label className="cue-auth-field">
        <span>Studio name</span>
        <input
          className="cue-input"
          name="name"
          type="text"
          required
          maxLength={120}
          autoComplete="organization"
          defaultValue={name}
          placeholder="Harper Studio"
        />
        <small className="ci-hint">
          What your clients see at the top of an agreement. Change it any time.
        </small>
      </label>

      <div className="cue-auth-field">
        {/* Not an <input readOnly>: there is nothing to edit, and a disabled or
            read-only field still invites a click and then refuses it. Rendering
            it as the fact it is says "this invite is for you" in one line. */}
        <span>Email</span>
        <p className="ci-locked">
          <Mail size={14} strokeWidth={2} aria-hidden />
          {email}
        </p>
        {/* <small>, not <span>: `.cue-auth-field > span` is the field label. */}
        <small className="ci-hint">The address your invite was sent to.</small>
      </div>

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
        <small className="ci-hint">At least {MIN_PASSWORD} characters.</small>
      </label>

      {error ? (
        <p className="cue-auth-err" role="alert">
          <AlertCircle size={15} strokeWidth={2} />
          {error}
        </p>
      ) : null}

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

      <p className="ci-foot">
        Already set this up? <Link href="/app/login">Sign in</Link>
      </p>
    </form>
  );
}
