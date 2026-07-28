import { randomBytes } from "node:crypto";

/* Invites: who is allowed into /app at all, and until when.
 *
 * Cue is pre-launch. The accounts in the system are invited testers, so access
 * is not "did you find the signup URL" but "does your email hold a live invite"
 * — one row per person in the `invite` table added by migration 009.
 *
 * Two gates enforce it, and they are deliberately different gates:
 *
 *   1. Account creation. A `user.create.before` hook in auth.ts refuses to make
 *      an account for an email with no active invite. It sits on the database
 *      hook rather than on the signup form because the form is markup anybody
 *      can skip — POSTing straight at /api/auth/sign-up/email has to fail too.
 *   2. Every request afterwards. `requireStudio()` re-derives the decision on
 *      each page load and each server action, so revoking access at 11:00 takes
 *      effect at 11:00 rather than whenever the session cookie happens to
 *      expire. That is the whole meaning of "restrict their access".
 *
 * Operators never consult this table: /console gates on the `role` column, and
 * an invite is a customer-side artefact.
 *
 * The pure half of this file — the state machine, the access decision, the date
 * parsing — is the part worth being sure about, so it is pure and
 * invite.test.ts is its specification. Everything below the "Queries" heading
 * is I/O over the same rules.
 */

/* The pool is imported on first query, not at module load — the same reasoning
   as admin.ts. Node's test runner resolves the whole static import graph before
   running a line, so a static `import { pool } from "./db"` would build a
   Postgres connection just to check that an expired invite reads as expired. */
async function db() {
  return (await import("./db")).pool;
}

/* ── The state of one invite ──

   Derived from three timestamps rather than stored as a column, because a
   stored status is a lie the moment a clock passes midnight. Nothing writes
   "expired" anywhere; the row simply starts reading that way.

   Order matters: a revoked invite reads as revoked even if its window also
   happens to have ended, because "we withdrew this" and "this lapsed" are
   different answers to give somebody. */
export const INVITE_STATES = ["active", "pending", "expired", "revoked"] as const;
export type InviteState = (typeof INVITE_STATES)[number];

export type InvitePeriod = {
  startsAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
};

export function inviteState(period: InvitePeriod, now: Date): InviteState {
  if (period.revokedAt) return "revoked";
  if (new Date(period.startsAt).getTime() > now.getTime()) return "pending";
  if (period.expiresAt && new Date(period.expiresAt).getTime() <= now.getTime()) {
    return "expired";
  }
  return "active";
}

export const INVITE_STATE_LABEL: Record<InviteState, string> = {
  active: "Active",
  pending: "Starts later",
  expired: "Expired",
  revoked: "Revoked",
};

/* Reuses the tone vocabulary the console already paints Cue statuses with
   (`.cs-tag[data-tone]`), so a new table does not arrive with a new palette. */
export const INVITE_STATE_TONE: Record<InviteState, "ok" | "wait" | "warn"> = {
  active: "ok",
  pending: "wait",
  expired: "warn",
  revoked: "warn",
};

/* ── The access decision ──

   Every "can this person use the app" question in the product resolves here, so
   it is one exhaustive union rather than a boolean: the locked screen needs to
   say *why*, and a boolean would have it guessing. */
export type Access =
  | { allowed: true; reason: "operator" | "active" }
  | { allowed: false; reason: "no-invite" | "pending" | "expired" | "revoked" };

export function accessDecision(
  subject: { role: string; invite: InvitePeriod | null },
  now: Date,
): Access {
  // Checked first and without touching the invite table: the operator is seeded
  // by script, has no invite row, and must never be lockable out of their own
  // product by an expiry date.
  if (subject.role === "operator") return { allowed: true, reason: "operator" };
  if (!subject.invite) return { allowed: false, reason: "no-invite" };

  const state = inviteState(subject.invite, now);
  return state === "active"
    ? { allowed: true, reason: "active" }
    : { allowed: false, reason: state };
}

export const ACCESS_MESSAGE: Record<
  Exclude<Access["reason"], "operator" | "active">,
  string
> = {
  "no-invite": "This account is not on the invite list.",
  pending: "Your access has not started yet.",
  expired: "Your trial access has ended.",
  revoked: "Your access has been withdrawn.",
};

/* ── Dates from the console form ──

   The form uses a native <input type="date">, so what arrives is `YYYY-MM-DD`
   and nothing else.

   Interpreted in UTC, not Central. An access period is measured in days — "let
   Ana try it for a month" — and nobody can perceive a trial ending six hours
   early. What they *can* perceive is a date that reads back differently from
   the one they typed, which is exactly what happens when a local-midnight
   boundary is stored and then rendered somewhere else. `"end"` takes the last
   instant of the named day, so "expires 30 Aug" means access through the 30th.

   Returns null for anything that is not a date, which every caller reads as
   "this field was left blank". */
export function parseAccessDate(
  raw: string | null | undefined,
  edge: "start" | "end",
): Date | null {
  const value = (raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const at = new Date(
    edge === "start" ? `${value}T00:00:00.000Z` : `${value}T23:59:59.999Z`,
  );
  if (Number.isNaN(at.getTime())) return null;
  // Rejects 2026-02-31 and friends: the Date constructor rolls them forward
  // rather than failing, so the round trip is the check.
  return at.toISOString().slice(0, 10) === value ? at : null;
}

/** `YYYY-MM-DD` for a stored timestamp, for round-tripping into a date input. */
export function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

/* 24 bytes, base64url — the same shape and the same source as cue.share_token.
   This one addresses a signup form rather than a contract, but it is still a
   bearer credential and there is no reason to make it a weaker one. */
const INVITE_TOKEN_BYTES = 24;

export function newInviteToken(): string {
  return randomBytes(INVITE_TOKEN_BYTES).toString("base64url");
}

/* ── Queries ── */

export type Invite = {
  id: number;
  email: string;
  name: string;
  token: string;
  startsAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  acceptedUserId: string | null;
  acceptedAt: string | null;
  invitedBy: string | null;
  note: string | null;
  createdAt: string;
};

type InviteRow = {
  id: string;
  email: string;
  name: string;
  token: string;
  starts_at: Date;
  expires_at: Date | null;
  revoked_at: Date | null;
  accepted_user_id: string | null;
  accepted_at: Date | null;
  invited_by: string | null;
  note: string | null;
  created_at: Date;
};

const INVITE_COLUMNS = `id, email, name, token, starts_at, expires_at, revoked_at,
                        accepted_user_id, accepted_at, invited_by, note, created_at`;

function toInvite(row: InviteRow): Invite {
  return {
    id: Number(row.id),
    email: row.email,
    name: row.name,
    token: row.token,
    startsAt: row.starts_at.toISOString(),
    expiresAt: row.expires_at?.toISOString() ?? null,
    revokedAt: row.revoked_at?.toISOString() ?? null,
    acceptedUserId: row.accepted_user_id,
    acceptedAt: row.accepted_at?.toISOString() ?? null,
    invitedBy: row.invited_by,
    note: row.note,
    createdAt: row.created_at.toISOString(),
  };
}

export async function listInvites(limit = 200): Promise<Invite[]> {
  const pool = await db();
  const { rows } = await pool.query<InviteRow>(
    `SELECT ${INVITE_COLUMNS} FROM invite
      ORDER BY created_at DESC, id DESC
      LIMIT $1`,
    [Math.min(Math.max(limit, 1), 500)],
  );
  return rows.map(toInvite);
}

/** Null when the token matches nothing. State is the caller's to judge. */
export async function inviteByToken(token: string): Promise<Invite | null> {
  if (!token) return null;
  const pool = await db();
  const { rows } = await pool.query<InviteRow>(
    `SELECT ${INVITE_COLUMNS} FROM invite WHERE token = $1`,
    [token],
  );
  return rows[0] ? toInvite(rows[0]) : null;
}

export async function inviteByEmail(email: string): Promise<Invite | null> {
  if (!email) return null;
  const pool = await db();
  const { rows } = await pool.query<InviteRow>(
    `SELECT ${INVITE_COLUMNS} FROM invite WHERE email = lower($1)`,
    [email],
  );
  return rows[0] ? toInvite(rows[0]) : null;
}

/** `"duplicate"` when that email already holds an invite — edit that one. */
export async function createInvite(input: {
  name: string;
  email: string;
  startsAt: Date;
  expiresAt: Date | null;
  invitedBy: string;
  note: string | null;
}): Promise<Invite | "duplicate"> {
  const pool = await db();
  const { rows } = await pool.query<InviteRow>(
    `INSERT INTO invite (email, name, token, starts_at, expires_at, invited_by, note)
          VALUES (lower($1), $2, $3, $4, $5, $6, $7)
     ON CONFLICT (email) DO NOTHING
       RETURNING ${INVITE_COLUMNS}`,
    [
      input.email,
      input.name,
      newInviteToken(),
      input.startsAt,
      input.expiresAt,
      input.invitedBy,
      input.note,
    ],
  );
  return rows[0] ? toInvite(rows[0]) : "duplicate";
}

/* The whole of "restrict their access", and the column list is the allowlist —
   the same rule as updateStudio() in studio.ts. Nothing here can reach `email`,
   `token` or `accepted_user_id`: changing who an invite is for is not an edit,
   it is a different invite. */
export async function updateInviteAccess(
  id: number,
  patch: { expiresAt?: Date | null; revoked?: boolean },
): Promise<Invite | null> {
  const assignments: string[] = [];
  const values: unknown[] = [id];

  if (patch.expiresAt !== undefined) {
    values.push(patch.expiresAt);
    assignments.push(`expires_at = $${values.length}`);
  }
  if (patch.revoked !== undefined) {
    // now() rather than a JS timestamp: the database is the clock everything
    // else on this row was stamped by.
    assignments.push(`revoked_at = ${patch.revoked ? "now()" : "NULL"}`);
  }
  if (!assignments.length) return null;

  const pool = await db();
  const { rows } = await pool.query<InviteRow>(
    `UPDATE invite SET ${assignments.join(", ")} WHERE id = $1 RETURNING ${INVITE_COLUMNS}`,
    values,
  );
  return rows[0] ? toInvite(rows[0]) : null;
}

/* Only an invite nobody has taken up. Once an account exists behind it the row
   is the reason that account is allowed in, so deleting it would silently lock
   somebody out through a path with no audit story — revoke instead, which says
   what happened and can be undone. */
export async function deleteUnacceptedInvite(id: number): Promise<boolean> {
  const pool = await db();
  const { rowCount } = await pool.query(
    `DELETE FROM invite WHERE id = $1 AND accepted_user_id IS NULL`,
    [id],
  );
  return (rowCount ?? 0) > 0;
}

/* ── The gate ──

   One query for the whole decision: the account's role and its invite, joined
   on the email. Two round trips would be two chances for a caller to check one
   and forget the other. */
export async function accessForUser(user: {
  id: string;
  email: string;
}): Promise<Access> {
  const pool = await db();
  const { rows } = await pool.query<{
    role: string;
    invite_id: string | null;
    starts_at: Date | null;
    expires_at: Date | null;
    revoked_at: Date | null;
    accepted_user_id: string | null;
  }>(
    `SELECT u.role,
            i.id AS invite_id, i.starts_at, i.expires_at, i.revoked_at, i.accepted_user_id
       FROM public."user" u
       LEFT JOIN invite i ON i.email = lower(u.email)
      WHERE u.id = $1`,
    [user.id],
  );

  const row = rows[0];
  // No row means no account, which cannot happen behind a valid session — but
  // an unreadable subject is not an authorised one. Fails CLOSED, like
  // isOperator().
  if (!row) return { allowed: false, reason: "no-invite" };

  const invite: InvitePeriod | null = row.starts_at
    ? {
        startsAt: row.starts_at.toISOString(),
        expiresAt: row.expires_at?.toISOString() ?? null,
        revokedAt: row.revoked_at?.toISOString() ?? null,
      }
    : null;

  const access = accessDecision({ role: row.role, invite }, new Date());

  /* First arrival: bind the invite to the account that took it up. Fire and
     forget — this is a "did they turn up" record for the console, and a failed
     stamp must not turn a legitimate page load into an error. */
  if (access.allowed && row.invite_id && !row.accepted_user_id) {
    await pool
      .query(
        `UPDATE invite SET accepted_user_id = $2, accepted_at = now()
          WHERE id = $1 AND accepted_user_id IS NULL`,
        [row.invite_id, user.id],
      )
      .catch((err: Error) => {
        console.error(`[invite] accept stamp failed for ${row.invite_id}`, err.message);
      });
  }

  return access;
}

/* The signup-time half of the same rule, by email rather than by session —
   there is no session yet. Used by the auth hook, which is the thing that
   actually closes public signup. */
export async function emailMayCreateAccount(email: string): Promise<boolean> {
  const invite = await inviteByEmail(email);
  if (!invite) return false;
  return inviteState(invite, new Date()) === "active";
}
