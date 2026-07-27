import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isResolvedSession,
  STATUS_SELECT_INITIAL,
  statusSelectStep,
  statusSelectValue,
  type StatusSelectEvent,
  type StatusSelectState,
} from "./console.ts";
import type { GuestStatus } from "./waitlist.ts";

/* ── The auth gate ── */

test("isResolvedSession rejects every shape that is not a session with a user", () => {
  for (const value of [
    null,
    undefined,
    {}, // session-shaped object with no user
    { user: null },
    { user: undefined },
    { session: { id: "s1" } }, // a session envelope that lost its user
    "session",
    0,
    1,
    true,
    [],
  ]) {
    assert.equal(isResolvedSession(value), false, JSON.stringify(value) ?? String(value));
  }
});

test("isResolvedSession accepts a resolved session carrying a user", () => {
  assert.equal(isResolvedSession({ user: { id: "u1", email: "op@krevo.io" } }), true);
  assert.equal(isResolvedSession({ session: { id: "s1" }, user: { id: "u1" } }), true);
});

/* The bug this rename exists to prevent. Until 2026-07-26 this function was
   called `isOperator`, and /api/waitlist, /api/changelog and /api/health gated
   on it. That was a real gate only while `disableSignUp: true` made the seeded
   operator the sole account able to hold a session. Opening customer signup
   turned all three into "any stranger who registers can read every waitlist
   email". Nothing about the function changed — only the world around it.

   So: this asserts the function is NOT an authorisation check, and must never
   be used as one on its own. `requireOperator()` in studio.ts is the gate. */
test("isResolvedSession is a shape check, not an authorisation check", () => {
  const creatorSession = { user: { id: "creator-1", email: "stranger@example.com" } };
  assert.equal(
    isResolvedSession(creatorSession),
    true,
    "a self-registered creator's session passes this — which is exactly why it cannot gate an operator route alone",
  );
});

test("isResolvedSession rejects a Promise — a dropped `await` must not open the gate", () => {
  const unawaited = Promise.resolve({ user: { id: "u1" } });
  assert.equal(!!unawaited, true, "the bug's premise: a Promise is truthy");
  assert.equal(isResolvedSession(unawaited), false);
  void unawaited;
});

/* ── The status dropdown commit machinery ──
   `run` threads events through the machine the way the component does,
   including the deferred commit an Enter press schedules, and records every
   write that would have been PATCHed. */

function run(
  events: StatusSelectEvent[],
  stored: GuestStatus = "pending",
  initial: StatusSelectState = STATUS_SELECT_INITIAL,
) {
  let state = initial;
  const writes: GuestStatus[] = [];
  const queue = [...events];

  while (queue.length) {
    const step = statusSelectStep(state, stored, queue.shift()!);
    state = step.state;
    if (step.write) writes.push(step.write);
    // The component runs this on a 0ms timeout; ordering is what matters.
    if (step.deferCommit) queue.unshift({ type: "commit" });
  }

  return { state, writes, shown: statusSelectValue(state, stored) };
}

const mouse = (value: GuestStatus): StatusSelectEvent[] => [
  { type: "pointerdown" },
  { type: "change", value },
];

const keys = (value: GuestStatus): StatusSelectEvent[] => [
  { type: "keydown", key: "ArrowDown" },
  { type: "change", value },
];

test("mouse selection writes immediately", () => {
  const { writes, state } = run(mouse("approved"));
  assert.deepEqual(writes, ["approved"]);
  assert.equal(state.pending, null, "nothing is left uncommitted");
});

test("keyboard selection does not write on change", () => {
  // Arrowing from Pending to Blacklisted passes through three statuses; each
  // one used to be a PATCH.
  const { writes, state, shown } = run([
    ...keys("screening"),
    { type: "change", value: "approved" },
    { type: "change", value: "suspended" },
    { type: "change", value: "blacklisted" },
  ]);
  assert.deepEqual(writes, []);
  assert.equal(state.pending, "blacklisted");
  assert.equal(shown, "blacklisted", "the pick is shown while it is uncommitted");
});

test("Enter commits the held selection, exactly once", () => {
  const { writes, state } = run([...keys("approved"), { type: "keydown", key: "Enter" }]);
  assert.deepEqual(writes, ["approved"]);
  assert.equal(state.pending, null);
});

test("blur commits the held selection", () => {
  const { writes, state } = run([...keys("suspended"), { type: "commit" }]);
  assert.deepEqual(writes, ["suspended"]);
  assert.equal(state.pending, null);
});

test("Escape abandons the selection and reverts to the stored status", () => {
  const { writes, state, shown } = run([
    ...keys("blacklisted"),
    { type: "keydown", key: "Escape" },
  ]);
  assert.deepEqual(writes, [], "an abandoned pick is never written");
  assert.equal(state.pending, null);
  assert.equal(shown, "pending", "the dropdown snaps back to the stored value");
});

test("blur after Escape writes nothing", () => {
  // The select is still focused after Escape; the eventual blur must not
  // resurrect the abandoned value.
  const { writes } = run([
    ...keys("blacklisted"),
    { type: "keydown", key: "Escape" },
    { type: "commit" },
  ]);
  assert.deepEqual(writes, []);
});

test("an abandoned selection does not survive a subsequent poll", () => {
  // THE SHIPPED DEFECT: the console displayed `blacklisted` for a guest the
  // database still held as `pending`, and every 5s poll left it there.
  const escaped = run([...keys("blacklisted"), { type: "keydown", key: "Escape" }]).state;

  // Poll lands: the row still says pending, then a later poll says approved.
  assert.equal(statusSelectValue(escaped, "pending"), "pending");
  assert.equal(statusSelectValue(escaped, "approved"), "approved");
});

test("committing the same value as stored is a no-op", () => {
  const { writes } = run([...keys("pending"), { type: "keydown", key: "Enter" }], "pending");
  assert.deepEqual(writes, []);
});

test("committing with nothing pending is a no-op", () => {
  // Every blur off an untouched dropdown lands here.
  assert.deepEqual(run([{ type: "commit" }]).writes, []);
  assert.deepEqual(run([{ type: "pointerdown" }, { type: "commit" }]).writes, []);
});

test("a keyboard edit followed by a mouse pick writes immediately", () => {
  // Whichever device is used last decides. The stale keyboard flag must not
  // hold a mouse selection hostage.
  const { writes, state } = run([...keys("screening"), ...mouse("approved")]);
  assert.deepEqual(writes, ["approved"]);
  assert.equal(state.keyboard, false);
});

test("a mouse pick equal to the stored status still writes", () => {
  // Faithful to the component: the mouse path does not diff. The browser does
  // not fire change for an unchanged option, so this is unreachable in the
  // DOM — pinned here so the behaviour cannot drift silently.
  assert.deepEqual(run(mouse("pending"), "pending").writes, ["pending"]);
});

test("Enter with nothing pending writes nothing", () => {
  assert.deepEqual(run([{ type: "keydown", key: "Enter" }]).writes, []);
});
