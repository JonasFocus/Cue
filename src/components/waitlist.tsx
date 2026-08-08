"use client";

import { Suspense, useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { joinWaitlist, type WaitlistState } from "@/app/actions";
import { PLAN_LABEL } from "@/lib/cue";

const INITIAL: WaitlistState = { status: "idle", message: "" };

/* The pricing CTAs link to /?plan=pro#waitlist so the signup records which
   plan the visitor reached for. Reading the URL suspends static prerender, so
   it lives in its own component under Suspense — the form itself stays in the
   static HTML and only this hidden field waits for the client. */
function PlanField() {
  const plan = useSearchParams().get("plan");
  if (!plan) return null;
  return <input type="hidden" name="plan" value={plan} />;
}

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

          <Suspense fallback={null}>
            <PlanField />
          </Suspense>

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
              {state.plan ? (
                <>
                  <strong>
                    You&rsquo;re on the waitlist &mdash; noted for{" "}
                    {PLAN_LABEL[state.plan]}.
                  </strong>
                  <p>
                    When billing opens you&rsquo;ll get the launch offer first.
                    Nothing to pay until then.
                  </p>
                </>
              ) : (
                <>
                  <strong>You&rsquo;re on the waitlist.</strong>
                  <p>We&rsquo;ll be in touch when Cue is ready for you.</p>
                </>
              )}
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
