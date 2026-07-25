/* Pure waitlist rules, deliberately kept out of actions.ts.
   A "use server" module may only export async functions, so nothing in it can
   be unit tested directly. These live here so they can be. */

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
