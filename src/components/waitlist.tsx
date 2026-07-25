"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { joinWaitlist, type WaitlistState } from "@/app/actions";

const INITIAL: WaitlistState = { status: "idle", message: "" };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="cue-btn cue-btn-dark cue-waitlist-btn"
      disabled={pending}
    >
      {pending ? (
        <Loader2 size={15} strokeWidth={2.25} className="cue-spin" />
      ) : (
        <>
          Join the waitlist
          <ArrowRight size={15} strokeWidth={2.25} />
        </>
      )}
    </button>
  );
}

export function Waitlist() {
  const [state, action] = useActionState(joinWaitlist, INITIAL);

  if (state.status === "ok") {
    return (
      <div className="cue-waitlist-done" role="status">
        <span className="cue-waitlist-tick">
          <Check size={14} strokeWidth={3} />
        </span>
        <div>
          <strong>You&apos;re on the list.</strong>
          <p>We&apos;ll email you when Cue opens up. No spam, no newsletter.</p>
        </div>
      </div>
    );
  }

  return (
    <form className="cue-waitlist" action={action}>
      <label className="cue-sr-only" htmlFor="cue-waitlist-name">
        Your name (optional)
      </label>
      <input
        id="cue-waitlist-name"
        className="cue-input cue-waitlist-name"
        type="text"
        name="name"
        autoComplete="name"
        placeholder="Your name (optional)"
      />

      <label className="cue-sr-only" htmlFor="cue-waitlist-email">
        Email address
      </label>
      <input
        id="cue-waitlist-email"
        className="cue-input cue-waitlist-email"
        type="email"
        name="email"
        required
        autoComplete="email"
        placeholder="you@studio.com"
        aria-invalid={state.status === "error"}
        aria-describedby={state.status === "error" ? "cue-waitlist-err" : undefined}
      />

      {/* Honeypot — hidden from people, irresistible to bots. */}
      <input
        type="text"
        name="cue_ref"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        className="cue-honeypot"
      />

      <Submit />

      {state.status === "error" && (
        <p className="cue-waitlist-msg" id="cue-waitlist-err" role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}
