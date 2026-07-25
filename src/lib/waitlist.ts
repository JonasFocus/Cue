/* Pure waitlist rules, deliberately kept out of actions.ts.
   A "use server" module may only export async functions, so nothing in it can
   be unit tested directly. These live here so they can be. */

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

/* Used by the overview feed, which is glanceable rather than a contact list.
   The guest list tab shows the real address — that is its whole job. */
export function maskEmail(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  const head = user.slice(0, 2);
  return `${head}${"•".repeat(Math.max(user.length - 2, 1))}@${domain}`;
}
