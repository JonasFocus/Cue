/* Pure waitlist rules, deliberately kept out of actions.ts.
   A "use server" module may only export async functions, so nothing in it can
   be unit tested directly. These live here so they can be. */

/* Launch traffic is bursty: a launch email or a creator sharing the page can
   send hundreds of people to the form at once. These limits leave room for
   that while retaining a meaningful backstop against one client filling the
   database with junk. The global ceiling counts only newly inserted rows, so
   a duplicate submission does not consume the launch budget. */
export const WAITLIST_IP_ATTEMPT_LIMIT = 100;
export const WAITLIST_RATE_WINDOW_SECONDS = 60 * 60;
export const WAITLIST_HOURLY_SIGNUP_CEILING = 10_000;

/* The single source of truth for guest status. The database CHECK constraint,
   the PATCH endpoint's allowlist, and the console dropdown all derive from
   this, so adding a stage means editing one list plus one migration. */
export const GUEST_STATUSES = [
  "pending",
  "screening",
  "approved",
  "suspended",
  "blacklisted",
] as const;

export type GuestStatus = (typeof GUEST_STATUSES)[number];

export function isGuestStatus(value: unknown): value is GuestStatus {
  return (
    typeof value === "string" && (GUEST_STATUSES as readonly string[]).includes(value)
  );
}

/* Deliberately permissive. The job is to catch typos and obvious junk, not to
   adjudicate RFC 5322 — an address is only truly validated by delivering to
   it, and we are not sending mail. */
const EMAIL = /^[^\s@]+@[^\s@,]+\.[a-z]{2,}$/i;

export const MAX_EMAIL_LENGTH = 254;

export function isValidEmail(email: string): boolean {
  return email.length <= MAX_EMAIL_LENGTH && EMAIL.test(email);
}

export function normaliseEmail(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase();
}

/* The form only started collecting names later, so older rows have none.
   "jonas.bubela@x.com" → "Jonas Bubela" reads better than an empty cell. */
export function nameFromEmail(email: string): string {
  return (
    email
      .split("@")[0]!
      .replace(/[._-]+/g, " ")
      .replace(/\d+/g, "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ") || "—"
  );
}

export type StatusPatch =
  | { ok: true; id: number; status: GuestStatus }
  | { ok: false; error: "invalid id" | "invalid status" };

/**
 * Validates a guest-status PATCH body.
 *
 * Lives here rather than inline in the route so it can be tested without a
 * Request, a session, or a database — the route is I/O and status-code mapping
 * only. The column also has a CHECK constraint, but a rejected write must read
 * as 400, not as a 500 from Postgres.
 */
export function parseStatusPatch(body: unknown): StatusPatch {
  const { id, status } = (body ?? {}) as { id?: unknown; status?: unknown };

  if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) {
    return { ok: false, error: "invalid id" };
  }
  if (!isGuestStatus(status)) {
    return { ok: false, error: "invalid status" };
  }
  return { ok: true, id, status };
}

/* ── When someone joined ──

   Rendered in one named zone rather than the viewer's local time, for the same
   reason the audit stamps are: a list of arrival times that reads differently
   depending on who is looking is not much of a record. Central because the one
   operator is US Central.

   Seconds are included on purpose. A launch or a shared link puts people on the
   list in bursts, and "5:45 PM" three times over tells you nothing about the
   order they arrived in.

   Components are spelled out individually rather than using `timeStyle`:
   ECMA-402 forbids combining the style shorthands with `timeZoneName`, and the
   combination throws at runtime while type-checking cleanly. See the same note
   on formatStamp in agreement.ts — do not "simplify" this. */
export function joinedStamp(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return `${at.toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  })} CT`;
}
