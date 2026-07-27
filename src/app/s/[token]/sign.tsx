"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { ArrowDown, Check, Loader2, Printer, TriangleAlert } from "lucide-react";
import { isValidSignerName, MAX_SIGNATURE_BYTES, ROLE_LABEL, type PartyRole } from "@/lib/cue";
import { declineAgreement, signAgreement, type SignState } from "./actions";
import { SignaturePad, type SignaturePadHandle } from "./signature-pad";

/* The route's only client module.
 *
 * Everything above it on the page — the masthead, the agreement itself, the
 * sealed record — is server-rendered markup with no JavaScript attached. The
 * document has to paint on a phone on venue wifi before any of this arrives. */

const IDLE: SignState = { status: "idle", message: "" };

export type Signer = { id: number; name: string; role: PartyRole };

export function SignPanel({
  token,
  signers,
  signedCount,
  totalCount,
}: {
  token: string;
  /** Parties who have not signed yet. Derived server-side; never from the URL. */
  signers: Signer[];
  signedCount: number;
  totalCount: number;
}) {
  const ids = useId();
  const consentId = `${ids}-consent`;
  const gateHintId = `${ids}-gate`;
  const nameId = `${ids}-name`;
  const padHintId = `${ids}-padhint`;

  const [reachedEnd, setReachedEnd] = useState(false);
  const [actionsInView, setActionsInView] = useState(false);
  /* Pre-selected only when there is nobody else it could be. With two or more
     outstanding signers this stays 0 until someone picks, because a signature
     attributed to the wrong party by a default is worse than one more tap. */
  const [partyId, setPartyId] = useState(() => (signers.length === 1 ? signers[0]!.id : 0));
  const [consent, setConsent] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  /* A server action that REJECTS — rather than returning an error state — is
     re-thrown by React during the next render, and with no error.tsx under /s
     the root boundary replaces the whole page. On this page that means the
     agreement, the typed name and the drawn mark all vanish, and the boundary's
     copy ("Nothing you sent was lost") is true of the record and false of the
     client's work.

     Venue wifi dropping mid-POST is the single most likely failure on this
     page, so a transport failure has to become a `SignState` instead. Next's
     own control-flow signals (redirect, notFound) travel as thrown objects
     carrying `digest` and must be re-thrown untouched. */
  const survive = useCallback(
    (action: typeof signAgreement) =>
      async (prev: SignState, formData: FormData): Promise<SignState> => {
        try {
          return await action(prev, formData);
        } catch (err) {
          if (err && typeof err === "object" && "digest" in err) throw err;
          return {
            status: "error",
            message:
              "Your connection dropped before that went through. Nothing was signed — your signature is still here. Try again.",
          };
        }
      },
    [],
  );

  const [state, dispatch, pending] = useActionState(survive(signAgreement), IDLE);
  const [declineState, declineDispatch, decliningNow] = useActionState(
    survive(declineAgreement),
    IDLE,
  );

  const endRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const consentRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const padRef = useRef<SignaturePadHandle>(null);

  /* The consent gate. A sentinel at the foot of the document rather than a
     scroll listener: one callback when it crosses the viewport, no work on
     every frame of a scroll on a mid-range Android. */
  useEffect(() => {
    const sentinel = endRef.current;
    // No observer, no gate. Locking someone out of signing because their
    // browser is old would be a worse failure than not enforcing the read.
    if (!sentinel || typeof IntersectionObserver === "undefined") {
      setReachedEnd(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setReachedEnd(true);
        observer.disconnect();
      }
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  /* The floating bar is a prompt to come down and sign, so it has no business
     covering the controls it is pointing at. */
  useEffect(() => {
    const actions = actionsRef.current;
    if (!actions || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      setActionsInView(entries.some((entry) => entry.isIntersecting));
    });
    observer.observe(actions);
    return () => observer.disconnect();
  }, []);

  const message = localError ?? (state.message || declineState.message);

  useEffect(() => {
    if (message) errorRef.current?.focus();
  }, [message]);

  const jumpToConsent = useCallback(() => {
    const target = consentRef.current;
    if (!target) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
    // Focus after the scroll starts, not before: focusing first makes the
    // browser jump, then the smooth scroll fights it.
    window.setTimeout(() => target.focus({ preventScroll: true }), reduced ? 0 : 320);
  }, []);

  const unlocked = reachedEnd && consent;
  const nameOk = isValidSignerName(typedName);
  /* `hasMark` is deliberately NOT part of this. The typed legal name is the
     signature; the drawn mark is optional. Gating on a drawn glyph would mean
     only someone able to drag a pointer could sign — excluding blind,
     keyboard-only, switch, voice-control and tremor-affected clients from a
     legally meaningful document. The server agrees (`isOptionalSignature`). */
  const ready = unlocked && nameOk && partyId > 0;
  const showBar = reachedEnd && !actionsInView && !pending;

  function submit(formData: FormData) {
    setLocalError(null);

    const png = padRef.current?.toDataURL();

    if (png) {
      // Checked here as well as on the server so a 4 MB post never leaves a
      // phone on 3G just to be refused at the other end.
      if (png.length > MAX_SIGNATURE_BYTES) {
        setLocalError("That signature is too detailed to send. Clear it and sign a little simpler.");
        return;
      }
      formData.set("signature", png);
    } else {
      // No drawn mark: the typed legal name stands alone, which is a complete
      // signature. Send nothing rather than an empty string.
      formData.delete("signature");
    }

    dispatch(formData);
  }

  return (
    <>
      {/* The foot of the document. Everything below this line is the act of
          signing rather than the thing being signed. */}
      <div id="agreement-end" className="sg-sentinel" ref={endRef} tabIndex={-1} />

      <section
        className="sg-panel doc-no-print"
        aria-labelledby={`${ids}-heading`}
        // A keyboard or screen-reader user who tabs this far has reached the
        // end by any honest reading of the word, even if the observer never
        // fired. The gate must not be passable only with a mouse.
        onFocusCapture={() => setReachedEnd(true)}
      >
        <header className="sg-panel-head">
          <h2 id={`${ids}-heading`} className="sg-panel-title">
            Sign this agreement
          </h2>
          <p className="sg-panel-sub">
            {totalCount > 1
              ? `${signedCount} of ${totalCount} signatures collected.`
              : "One signature is needed to complete this agreement."}
          </p>
        </header>

        <form action={submit} className="sg-form">
          <input type="hidden" name="token" value={token} />

          {signers.length > 1 ? (
            <fieldset className="sg-field sg-who">
              <legend className="sg-label">Who is signing?</legend>
              {signers.map((signer) => (
                <label className="sg-radio" key={signer.id}>
                  <input
                    type="radio"
                    name="party"
                    value={signer.id}
                    checked={partyId === signer.id}
                    onChange={() => setPartyId(signer.id)}
                  />
                  <span>
                    <strong>{signer.name}</strong>
                    <span className="sg-radio-role">{ROLE_LABEL[signer.role]}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : (
            <input type="hidden" name="party" value={partyId} />
          )}

          <div className="sg-field">
            <label className="sg-consent" htmlFor={consentId}>
              <input
                id={consentId}
                ref={consentRef}
                type="checkbox"
                name="consent"
                value="agreed"
                checked={consent}
                disabled={!reachedEnd}
                aria-describedby={reachedEnd ? undefined : gateHintId}
                onChange={(event) => setConsent(event.target.checked)}
              />
              <span>
                I have read and reviewed this agreement, and I agree to sign it
                electronically.
              </span>
            </label>

            {/* Always mounted so the change of text is what gets announced —
                mounting a live region together with its own content is read
                out unreliably. */}
            <p className="sg-gate" id={gateHintId} role="status" data-open={reachedEnd || undefined}>
              {reachedEnd ? (
                <>
                  <Check size={13} strokeWidth={2.75} aria-hidden />
                  You&rsquo;ve reached the end of the agreement.
                </>
              ) : (
                /* The escape hatch for this lives above the document, in the
                   page's masthead — a "jump to the end" link rendered here,
                   below the document, would only ever be seen by someone who
                   had already reached the end. */
                "Read to the end of the agreement to continue."
              )}
            </p>
          </div>

          <div className="sg-field" data-locked={!unlocked || undefined}>
            <label className="sg-label" htmlFor={nameId}>
              Your full legal name
            </label>
            <input
              id={nameId}
              className="sg-input"
              type="text"
              name="name"
              autoComplete="name"
              enterKeyHint="done"
              spellCheck={false}
              placeholder="Dana Reyes"
              maxLength={120}
              value={typedName}
              disabled={!unlocked}
              aria-invalid={typedName.length > 0 && !nameOk}
              onChange={(event) => setTypedName(event.target.value)}
            />

            <p className="sg-hint" id={padHintId}>
              Your typed name is your signature. Drawing a mark below is
              optional — both are stored with the record.
            </p>

            <SignaturePad
              ref={padRef}
              disabled={!unlocked}
              describedBy={padHintId}
            />
          </div>

          <div className="sg-actions" ref={actionsRef}>
            <button type="submit" className="sg-submit" disabled={!ready || pending}>
              {pending ? (
                <>
                  <Loader2 size={16} strokeWidth={2.25} className="sg-spin" aria-hidden />
                  Recording your signature
                </>
              ) : (
                "Sign and complete"
              )}
            </button>
            <p className="sg-legal">
              Signing records your name, the mark you drew, the time, and a
              one-way hash of your IP address as evidence of consent.
            </p>
          </div>
        </form>

        {/* Deliberately outside the signing form — a nested form is invalid
            HTML, and a decline button that can be reached by an errant Enter
            key on a contract is not a mistake worth risking. */}
        <details className="sg-decline">
          <summary>I don&rsquo;t want to sign this</summary>
          <form action={declineDispatch} className="sg-decline-form">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="party" value={partyId} />
            <label className="sg-label" htmlFor={`${ids}-reason`}>
              Anything you want them to know? (optional)
            </label>
            <textarea
              id={`${ids}-reason`}
              className="sg-input sg-textarea"
              name="reason"
              rows={3}
              maxLength={500}
              placeholder="The date no longer works for us."
            />
            <p className="sg-hint">
              This closes the agreement and tells the sender you declined. It
              cannot be undone from this link.
            </p>
            <button type="submit" className="sg-ghost sg-decline-btn" disabled={decliningNow}>
              {decliningNow ? "Sending" : "Decline this agreement"}
            </button>
          </form>
        </details>

        <p
          className="sg-error"
          role="alert"
          ref={errorRef}
          tabIndex={-1}
          data-shown={message ? true : undefined}
        >
          {message ? (
            <>
              <TriangleAlert size={15} strokeWidth={2.25} aria-hidden />
              {message}
            </>
          ) : null}
        </p>
      </section>

      {/* Kept mounted rather than conditionally rendered, so it can transition
          in on transform/opacity instead of popping. It steps out of the way
          the moment the controls it points at are on screen themselves —
          a floating prompt covering its own target is the usual way this
          pattern goes wrong. */}
      <div
        className="sg-bar doc-no-print"
        data-show={showBar || undefined}
        aria-hidden={!showBar}
        // Hidden and inert must agree: a bar that is aria-hidden but still in
        // the tab order traps a keyboard user on a control they cannot see.
        {...(showBar ? {} : { inert: true })}
      >
        <div className="sg-bar-in">
          <span className="sg-bar-text">Ready when you are.</span>
          <button type="button" className="sg-bar-btn" onClick={jumpToConsent}>
            Go to signature
            <ArrowDown size={15} strokeWidth={2.25} aria-hidden />
          </button>
        </div>
      </div>
    </>
  );
}

/* The sealed record's download control. `window.print()` needs a client
   component, and this route has exactly one, so it lives here rather than
   becoming an eighth file for a single onClick. The print stylesheet is
   already in agreement.css; everything not the document carries .doc-no-print. */
export function PrintButton({ label = "Download or print" }: { label?: string }) {
  return (
    <button type="button" className="sg-print doc-no-print" onClick={() => window.print()}>
      <Printer size={15} strokeWidth={2.25} aria-hidden />
      {label}
    </button>
  );
}
