/* Cue lifecycle rules. Pure, and deliberately separate from the database layer:
   what a creator may still change after a client has signed is the one piece of
   logic in this product that must be right, so it lives where a test can reach
   it without a Postgres connection. */

export const CUE_STATUSES = [
  "draft",
  "sent",
  "opened",
  "partially_signed",
  "signed",
  "voided",
  "declined",
] as const;

export type CueStatus = (typeof CUE_STATUSES)[number];

export function isCueStatus(value: unknown): value is CueStatus {
  return typeof value === "string" && (CUE_STATUSES as readonly string[]).includes(value);
}

/* Display vocabulary. `signed` reads as "Signed" and carries the sealed record;
   there is no separate "sealed" status because sealing happens in the same
   transaction as the final signature — a row that is signed but unsealed would
   be a bug, not a state. */
export const STATUS_LABEL: Record<CueStatus, string> = {
  draft: "Draft",
  sent: "Awaiting",
  opened: "Opened",
  partially_signed: "Partly signed",
  signed: "Signed",
  voided: "Voided",
  declined: "Declined",
};

export const STATUS_TONE: Record<CueStatus, "neutral" | "wait" | "ok" | "warn"> = {
  draft: "neutral",
  sent: "wait",
  opened: "wait",
  partially_signed: "wait",
  signed: "ok",
  voided: "warn",
  declined: "warn",
};

/* ── Filter groups ──
   A creator does not think in seven statuses. They think in "waiting on them",
   "done", and "not sent yet" — so "Awaiting" is one chip covering three states.

   This lives here, not in the workspace page, because three surfaces have to
   agree on it: the filter chips, the sidebar counts, and the mobile tab bar.
   When they disagree the symptom is quiet and confusing — a sidebar reading
   "Awaiting 2" next to a list showing four rows.

   A group's key is the primary status it stands for rather than a name of its
   own, so `?status=sent` is a URL every surface can both produce and light up. */
export type StatusGroup = { key: string; label: string; statuses: readonly CueStatus[] };

export const STATUS_GROUP_ALL: StatusGroup = {
  key: "all",
  label: "All",
  statuses: CUE_STATUSES,
};

export const STATUS_GROUPS: readonly StatusGroup[] = [
  STATUS_GROUP_ALL,
  { key: "sent", label: "Awaiting", statuses: ["sent", "opened", "partially_signed"] },
  { key: "signed", label: "Signed", statuses: ["signed"] },
  { key: "draft", label: "Drafts", statuses: ["draft"] },
];

/** Resolves a `?status=` value, falling back to a bare status, then to All. */
export function resolveStatusGroup(raw: string): StatusGroup {
  const known = STATUS_GROUPS.find((g) => g.key === raw);
  if (known) return known;
  // A link from elsewhere in the app may name a status with no chip of its own
  // (?status=voided from a detail page). Honour it rather than showing everything.
  if (isCueStatus(raw)) return { key: raw, label: STATUS_LABEL[raw], statuses: [raw] };
  return STATUS_GROUP_ALL;
}

/** Sums a per-status count map over a group. The one way any surface counts. */
export function groupCount(
  group: StatusGroup,
  counts: Readonly<Record<string, number>>,
): number {
  return group.statuses.reduce((n, s) => n + (counts[s] ?? 0), 0);
}

/* ── Transitions ──
   The only legal moves. Everything that writes a status goes through
   `canTransition`, so an unexpected one fails at the boundary rather than
   quietly reviving a voided agreement. */
const TRANSITIONS: Record<CueStatus, readonly CueStatus[]> = {
  draft: ["sent", "voided"],
  sent: ["opened", "partially_signed", "signed", "voided", "declined"],
  opened: ["partially_signed", "signed", "voided", "declined"],
  partially_signed: ["signed", "voided", "declined"],
  // Terminal. A signed record is never edited, reopened, or un-voided; the
  // creator's remedy is a new Cue that supersedes it.
  signed: [],
  voided: [],
  declined: [],
};

export function canTransition(from: CueStatus, to: CueStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** True once the document text is frozen — i.e. a client may have read it. */
export function isFrozen(status: CueStatus): boolean {
  return status !== "draft";
}

/** True once the record is immutable and the audit trail is closed. */
export function isSealed(status: CueStatus): boolean {
  return status === "signed";
}

/** True while the share link should still resolve to a signable document. */
export function isSignable(status: CueStatus): boolean {
  return status === "sent" || status === "opened" || status === "partially_signed";
}

/* ── What the creator may still change ──

   The allowlist is the enforcement, applied server-side in cue-db.ts. Hiding a
   button is a courtesy to the creator; this is the actual rule. Anything not
   named here is editable in `draft` only.

   `notes` is internal-only and never appears in the document or the client
   view, which is exactly why it stays writable forever — a creator annotating
   their own file cannot alter what anyone agreed to. */
const ALWAYS_EDITABLE = ["notes"] as const;

/** Fields that change the document itself. Draft-only, without exception. */
export const CONTENT_FIELDS = [
  "title",
  "client_name",
  "client_email",
  "shoot_date",
  "location",
  "vars",
  "omitted_clauses",
  "template_slug",
] as const;

export function canEditField(field: string, status: CueStatus): boolean {
  if ((ALWAYS_EDITABLE as readonly string[]).includes(field)) return true;
  return status === "draft";
}

/** The subset of a patch a creator is actually allowed to apply right now. */
export function permittedPatch<T extends Record<string, unknown>>(
  patch: T,
  status: CueStatus,
): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (canEditField(key, status)) out[key as keyof T] = value as T[keyof T];
  }
  return out;
}

/* ── Share tokens ──
   128 bits of CSPRNG entropy, base64url so it survives a URL, a QR code, and
   an iMessage without escaping. At 22 characters the link stays short enough
   to read aloud, which matters when a photographer is texting it from a venue.
   Guessing one is 2^128; the rate limiter handles the crawler that tries. */
export const SHARE_TOKEN_BYTES = 16;

export function isShareToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{20,32}$/.test(value);
}

/* ── Audit events ──
   Append-only, and only kinds something actually writes. `downloaded` was defined, labelled and
   given an icon without a single writer — printing is a browser action the
   server never sees — so the trail advertised a category it could never
   contain. Add it back the day a download route exists. */
export const EVENT_KINDS = [
  "created",
  "sent",
  "opened",
  "viewed",
  "consented",
  "signed",
  "sealed",
  "voided",
  "declined",
] as const;

export type EventKind = (typeof EVENT_KINDS)[number];

export const EVENT_LABEL: Record<EventKind, string> = {
  created: "Cue created",
  sent: "Signing link issued",
  opened: "Signing link opened",
  viewed: "Document viewed in browser",
  consented: "Consent to electronic signing recorded",
  signed: "Signature captured",
  sealed: "Record sealed",
  voided: "Cue voided by sender",
  declined: "Declined by recipient",
};

/* ── Parties ── */

export const PARTY_ROLES = ["client", "creator", "additional"] as const;
export type PartyRole = (typeof PARTY_ROLES)[number];

export function isPartyRole(value: unknown): value is PartyRole {
  return typeof value === "string" && (PARTY_ROLES as readonly string[]).includes(value);
}

export const ROLE_LABEL: Record<PartyRole, string> = {
  client: "Client",
  creator: "Photographer / videographer",
  additional: "Additional signer",
};

/* ── Who may sign through the public share link ──

   One link authorises one *side* of the agreement. The client and any
   additional signers are that side — a couple realistically opens the same link
   on the same phone and both sign, which is the intended flow.

   The creator is emphatically NOT on that side. Letting the share link sign a
   `creator` party means the recipient of the link can produce a sealed,
   hash-stamped record showing the photographer signed when they never did —
   forging the counterparty's signature on the one document meant to prove who
   agreed to what. The only trace would be an `ip_hash` on that row, which no
   surface displays.

   ponytail: v1 refuses to create a `creator` party at all (see
   `addPartyAction`), rather than creating one that no built surface can ever
   sign — that would leave a Cue waiting forever on a signature nobody can give.
   Per-party `share_token`s (migration 012) already make each link sign exactly
   one line; the remaining upgrade is an authenticated countersign inside /app. */
export function isPubliclySignable(role: PartyRole): boolean {
  return role === "client" || role === "additional";
}

/** Roles a creator may add to a Cue. Excludes `client` (created with the Cue). */
export const ADDABLE_ROLES = PARTY_ROLES.filter(
  (r) => r !== "client" && isPubliclySignable(r),
);

/* ── Free-plan allowance ──
   docs/solution.md: five *total* sent Cues, not a monthly reset. Counted on send,
   never on create — a draft costs nothing and a creator experimenting with the
   builder should not burn their allowance. */
export const FREE_SENT_ALLOWANCE = 5;

/* The plan vocabulary lives here, beside the type, rather than in admin.ts —
   admin.ts reaches the database module, so a client component importing a plan
   label from it would pull `pg` into the browser bundle. This file imports
   nothing, which is what makes it safe for both sides. */
export const PLANS = ["free", "pro", "studio"] as const;

export type Plan = (typeof PLANS)[number];

export const PLAN_LABEL: Record<Plan, string> = {
  free: "Free",
  pro: "Pro",
  studio: "Studio",
};

export function isPlan(value: unknown): value is Plan {
  return typeof value === "string" && (PLANS as readonly string[]).includes(value);
}

export function canSend(plan: Plan, sentCount: number): boolean {
  return plan !== "free" || sentCount < FREE_SENT_ALLOWANCE;
}

/* ── Signing rate limits ──
   The signing endpoint is the only unauthenticated *write* in the product once
   the app ships, so it gets the tighter budget the waitlist form does not need.
   Reads of a share link are limited separately and far more loosely: a client
   refreshing a contract on bad venue wifi must never be locked out of it. */
export const SIGN_ATTEMPT_LIMIT = 10;
export const SIGN_RATE_WINDOW_SECONDS = 60 * 10;
export const VIEW_ATTEMPT_LIMIT = 240;
export const VIEW_RATE_WINDOW_SECONDS = 60 * 10;

/* ── Signature capture ──
   A drawn signature is stored as a PNG data URL from a <canvas>. The cap is a
   guard on the request body, not an aesthetic judgement: a 600x200 signature
   at 2x DPR is well under 100 KB, and anything an order of magnitude larger is
   someone posting an image, not a signature. */
export const MAX_SIGNATURE_BYTES = 512 * 1024;
export const SIGNATURE_PREFIX = "data:image/png;base64,";

export function isSignatureImage(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith(SIGNATURE_PREFIX) &&
    value.length <= MAX_SIGNATURE_BYTES &&
    // Reject anything with characters base64 cannot contain, so a crafted data
    // URL cannot smuggle markup into a page that renders it as an <img src>.
    /^[A-Za-z0-9+/=]*$/.test(value.slice(SIGNATURE_PREFIX.length))
  );
}

/** A typed legal name must look like a name a person would sign. */
export function isValidSignerName(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const name = value.trim();
  return name.length >= 2 && name.length <= 120;
}

/* ── How a signature was made ──

   The typed legal name is the signature. The drawn mark is optional decoration
   on top of it.

   That is a correctness requirement, not a preference. Requiring a drawn glyph
   means a signature can only be produced by dragging a pointer, which excludes
   blind clients, keyboard-only clients, switch and voice control users, and
   anyone with a tremor — from signing a legally meaningful document. Neither
   ESIGN nor eIDAS has ever required a drawn glyph; intent plus attribution is
   the substance, and the typed name, the consent timestamp, the IP hash and the
   event trail carry all of it.

   The method is recorded on the audit event so the record stays honest about
   which one happened. */
export const SIGNATURE_METHODS = ["typed", "drawn"] as const;
export type SignatureMethod = (typeof SIGNATURE_METHODS)[number];

/**
 * Validates the optional drawn mark.
 *
 * Absent is valid — that is the whole point. Present-but-malformed is not: a
 * value that reaches an `<img src>` on the sealed record still has to be a real
 * PNG data URL, so `isSignatureImage`'s checks apply whenever there is anything
 * to check.
 */
export function isOptionalSignature(value: unknown): value is string | null {
  if (value === null || value === undefined || value === "") return true;
  return isSignatureImage(value);
}

export function signatureMethod(png: string | null): SignatureMethod {
  return png ? "drawn" : "typed";
}
