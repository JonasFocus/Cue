"use client";

import { useActionState, useEffect, useRef } from "react";
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
          Request access
          <ArrowRight size={15} strokeWidth={2.25} />
        </>
      )}
    </button>
  );
}

export function Waitlist() {
  const [state, action] = useActionState(joinWaitlist, INITIAL);
  const done = state.status === "ok";
  const doneRef = useRef<HTMLDivElement>(null);

  // Success replaces the form, so the focused submit button disappears and
  // focus falls to <body> — the next Tab restarts at the top of the document.
  // Move it onto the confirmation instead, which also reads it out.
  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  return (
    <>
      {!done && (
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
            aria-describedby={
              state.status === "error" ? "cue-waitlist-err" : undefined
            }
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
        </form>
      )}

      {/* Both outcomes live in one region that is always mounted, so the
          announcement comes from a content change AT is already watching.
          Mounting a role="status" together with its own text is announced
          unreliably — that is why neither message was ever read out. */}
      <div className="cue-waitlist-live" role="status" aria-live="polite">
        {done ? (
          <div className="cue-waitlist-done" ref={doneRef} tabIndex={-1}>
            <span className="cue-waitlist-tick">
              <Check size={14} strokeWidth={3} />
            </span>
            <div>
              <strong>Request received.</strong>
              <p>
                We&apos;ll email your invite link as soon as there&apos;s room.
                No spam, no newsletter.
              </p>
            </div>
          </div>
        ) : state.status === "error" ? (
          <p className="cue-waitlist-msg" id="cue-waitlist-err">
            {state.message}
          </p>
        ) : null}
      </div>
    </>
  );
}
