/* Pure logic behind the operator console.
   Both of these used to live inline — the auth predicate in
   src/app/api/waitlist/route.ts, the commit machinery in
   src/app/console/dashboard.tsx — where no test could reach either, and both
   are exactly where the shipped defects were. Behaviour is unchanged; only
   the address is. */

import type { GuestStatus } from "./waitlist";

/**
 * True only for a resolved session that actually carries a user.
 *
 * Deliberately not a truthiness check. `auth.api.getSession()` returns a
 * Promise, so a refactor that drops the `await` would hand the gate a thenable
 * — truthy, and therefore an open door on the one endpoint that returns
 * unmasked email addresses. A Promise has no `user`, so this rejects it.
 */
/* Renamed from `isOperator` on 2026-07-26. It never checked whether anyone was
   an operator — it checks that a *resolved session object* is present, which
   was a sufficient gate only while `disableSignUp: true` meant the operator was
   the sole account able to hold one. Opening customer signup turned that into a
   hole on three API routes, and the misleading name is what hid it: two
   different functions called `isOperator`, one a shape check and one a role
   check, with the routes importing the wrong one. The real gate is
   `requireOperator()` in studio.ts, which calls this and then checks the role. */
export function isResolvedSession(session: unknown): boolean {
  if (typeof session !== "object" || session === null) return false;
  const { user } = session as { user?: unknown };
  return typeof user === "object" && user !== null;
}

/* ── Status dropdown commit machinery ──
   A native <select> writes to the database, so it must not PATCH on every
   change event: arrowing from Pending to Blacklisted fires three intermediate
   changes and would persist each one. Keyboard edits are held and committed on
   Enter or blur; mouse selection commits the moment an option is picked. */

export type StatusSelectState = {
  /** Uncommitted keyboard selection. Null means "show the stored status". */
  pending: GuestStatus | null;
  /** Whether the pointer or the keyboard opened this select. */
  keyboard: boolean;
};

export const STATUS_SELECT_INITIAL: StatusSelectState = {
  pending: null,
  keyboard: false,
};

export type StatusSelectEvent =
  | { type: "pointerdown" }
  | { type: "keydown"; key: string }
  | { type: "change"; value: GuestStatus }
  /** Blur, or the deferred half of an Enter press. */
  | { type: "commit" };

export type StatusSelectStep = {
  state: StatusSelectState;
  /** The status to PATCH, or null to write nothing. */
  write: GuestStatus | null;
  /** Enter selects and fires `change` after keydown, so commit a tick later. */
  deferCommit: boolean;
};

const step = (
  state: StatusSelectState,
  write: GuestStatus | null = null,
  deferCommit = false,
): StatusSelectStep => ({ state, write, deferCommit });

export function statusSelectStep(
  state: StatusSelectState,
  stored: GuestStatus,
  event: StatusSelectEvent,
): StatusSelectStep {
  switch (event.type) {
    case "pointerdown":
      return step({ ...state, keyboard: false });

    case "keydown": {
      const keyed = { ...state, keyboard: true };
      if (event.key === "Enter") return step(keyed, null, true);
      /* Escape abandons the selection. Without this the uncommitted value
         survived every 5s poll, so the console could display `blacklisted`
         for a guest the database still had as `pending`, with nothing on
         screen to say so. */
      if (event.key === "Escape") return step({ ...keyed, pending: null });
      return step(keyed);
    }

    case "change":
      return state.keyboard
        ? step({ ...state, pending: event.value })
        : step(state, event.value);

    case "commit": {
      const next = state.pending;
      return step(
        { ...state, pending: null },
        next && next !== stored ? next : null,
      );
    }
  }
}

/** What the dropdown shows: the uncommitted pick, else whatever polling last
    stored. An abandoned selection is gone, so the next poll flows through. */
export function statusSelectValue(
  state: StatusSelectState,
  stored: GuestStatus,
): GuestStatus {
  return state.pending ?? stored;
}
