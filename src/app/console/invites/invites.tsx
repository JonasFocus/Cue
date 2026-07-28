"use client";

import { useActionState, useState } from "react";
import { Check, Copy, Trash2, UserPlus } from "lucide-react";
import { Feedback } from "../studios/studios";
import {
  createInviteAction,
  manageInviteAction,
  type InviteActionState,
} from "./actions";

/* The three interactive things on the invites surface, and the only "use
   client" in it. The list, the states and the dates are all server-rendered.

   Nothing here imports a runtime value from @/lib/invite, and it must stay that
   way. That module reaches node:crypto and dynamically imports the Postgres
   pool, and the bundler follows a client component's import graph all the way
   down — including through a dynamic import() — so one value pulled across this
   boundary sends it looking for `dns`, `fs` and `net` in the browser and fails
   the build. Same rule admin.ts documents at length; the labels and states this
   file would want are rendered on the server instead.

   Both forms post to server actions that re-check requireOperator(). The markup
   is a courtesy; the action is the enforcement. */

const INITIAL: InviteActionState = { status: "idle", message: "" };

/** Today, as the value a native `<input type="date">` wants. */
function todayInput(): string {
  return new Date().toISOString().slice(0, 10);
}

export function InviteComposer() {
  const [state, action, pending] = useActionState(createInviteAction, INITIAL);

  /* ponytail: no code to clear the fields after a successful create. React
     resets an uncontrolled form once its action settles, and mirroring five
     inputs into state purely to empty them would be more machinery than the
     feature. If a submit ever leaves stale text behind, reach for
     requestFormReset() rather than five useStates. */
  return (
    <form className="ci-compose" action={action}>
      <div className="cs-form-grid">
        <label className="cs-field">
          <span>Their name</span>
          <input name="name" type="text" required maxLength={120} autoComplete="off" />
        </label>

        <label className="cs-field">
          <span>Email</span>
          <input name="email" type="email" required maxLength={254} autoComplete="off" />
        </label>

        {/* Native date inputs: a calendar, keyboard entry, and the platform's
            own locale formatting, for no dependency and no code. */}
        <label className="cs-field">
          <span>Access from</span>
          <input name="startsAt" type="date" defaultValue={todayInput()} />
        </label>

        <label className="cs-field">
          <span>Access until</span>
          <input name="expiresAt" type="date" />
          <small className="ci-field-note">Leave blank for no end date.</small>
        </label>

        <label className="cs-field cs-field-wide">
          <span>Note (optional)</span>
          <input
            name="note"
            type="text"
            maxLength={200}
            autoComplete="off"
            placeholder="Wedding photographer, met at the meetup"
          />
        </label>
      </div>

      <div className="cs-form-foot">
        <button className="cs-button" type="submit" disabled={pending}>
          <UserPlus size={13} strokeWidth={2} aria-hidden />
          Create invite
        </button>
        <Feedback state={state} pending={pending} />
      </div>
    </form>
  );
}

/**
 * One row's controls: move the end date, withdraw or restore access, delete.
 *
 * A single form with four submit buttons rather than four forms, because a
 * submit button carries its own name and value into the FormData — so the
 * server action reads `intent` from whichever button was pressed. HTML forbids
 * nesting forms anyway, and one form means one piece of pending state instead
 * of four fighting over the same row.
 */
export function InviteControls({
  inviteId,
  expiresAt,
  revoked,
  accepted,
  personLabel,
}: {
  inviteId: number;
  expiresAt: string;
  revoked: boolean;
  accepted: boolean;
  personLabel: string;
}) {
  const [state, action, pending] = useActionState(manageInviteAction, INITIAL);

  return (
    <form className="ci-controls" action={action}>
      <input type="hidden" name="inviteId" value={inviteId} />

      <label className="cs-field ci-until">
        <span>Access until</span>
        <input
          name="expiresAt"
          type="date"
          defaultValue={expiresAt}
          aria-label={`Access until, for ${personLabel}`}
        />
        {/* The "blank clears the end date" caveat is stated once above the list
            rather than under every row: repeated per row it is six copies of
            the same sentence, and it pushed the buttons out of line with the
            field they belong to. */}
      </label>

      <button
        className="cs-button"
        type="submit"
        name="intent"
        value="period"
        disabled={pending}
      >
        Save
      </button>

      <button
        className={`cs-button${revoked ? "" : " ci-danger"}`}
        type="submit"
        name="intent"
        value={revoked ? "restore" : "revoke"}
        disabled={pending}
      >
        {revoked ? "Restore access" : "Revoke access"}
      </button>

      {/* Only for an invite nobody has taken up. Once an account stands on it,
          the row is the reason that account is allowed in — revoking says what
          happened and can be undone; deleting would just lock somebody out. */}
      {!accepted && (
        <button
          className="cs-button ci-danger"
          type="submit"
          name="intent"
          value="delete"
          disabled={pending}
          aria-label={`Delete the invite for ${personLabel}`}
          onClick={(e) => {
            // No undo and no audit story for the row itself, so the browser's
            // own confirm is the whole safety net — and enough of one. Same
            // call the changelog makes.
            if (!window.confirm(`Delete the invite for ${personLabel}?`)) {
              e.preventDefault();
            }
          }}
        >
          <Trash2 size={12} strokeWidth={2.25} aria-hidden />
          Delete
        </button>
      )}

      <Feedback state={state} pending={pending} />
    </form>
  );
}

/**
 * Copy the invite link.
 *
 * There is no email provider — sharing the link is the only delivery, exactly
 * as it is for a Cue — so this button is how an invite actually reaches
 * anybody, and it says so on the page.
 */
export function CopyInviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      className="cs-button ci-copy"
      type="button"
      data-copied={copied || undefined}
      title={url}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          // Clipboard access can be refused (an insecure origin, a permission
          // policy). Select the text so the operator can copy it by hand rather
          // than being told nothing happened.
          window.prompt("Copy the invite link", url);
        }
      }}
    >
      {copied ? (
        <>
          <Check size={12} strokeWidth={2.5} aria-hidden />
          Copied
        </>
      ) : (
        <>
          <Copy size={12} strokeWidth={2.25} aria-hidden />
          Copy link
        </>
      )}
    </button>
  );
}
