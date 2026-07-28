# Security posture

What Cue actually does, and what it does not. As of 2026-07-26.

No compliance claims. Cue has not been through GDPR review, SOC 2, or a
penetration test, and has no DPO. Do not state otherwise anywhere — the legal
pages must keep describing exactly what the code does and nothing more.

---

## Trust boundaries

Three, in descending order of trust:

| Boundary | Credential | Can do |
| --- | --- | --- |
| Operator (`/console`) | session + `role = 'operator'` | read waitlist and container health; read **any** studio's account, usage, Cues and client list; edit a studio's profile and plan |
| Creator (`/app`) | Better Auth session | everything within their own `studio_id` |
| Client (`/s/[token]`) | the token, and nothing else | read one Cue, sign once, decline once |

The operator boundary is the widest and the most data-sensitive: `/console/studios`
shows **other studios' clients** by name and email. Four limits, all structural
rather than by convention:

- `src/lib/admin.ts` contains no statement that writes to `cue`, `cue_party` or
  `cue_event`. It writes to exactly `studio` and `admin_event`, and
  `admin.test.ts` asserts that by scanning the source. **A sealed agreement is
  immutable to us in exactly the way it is to both parties.**
- It never *selects* `share_token`, `signature_png`, `ip_hash` or `user_agent`.
  The token matters most: it is a bearer credential, and rendering it would let
  an operator open a live signing link and produce a signature attributable to
  the client — impersonation through the back door.
- Every mutation writes an `admin_event`, and that table refuses UPDATE **and**
  DELETE. A log operators can quietly edit is not a log.
- There is no "sign in as this customer". With signature evidence in play, an
  operator session producing `cue_party` rows attributable to a customer would
  turn a support tool into a forgery tool, inside the one record whose entire
  value is attribution. The legitimate need behind it is served by the read-only
  Cue view.

There is no path from creator to operator through the application. `role` is
set only by a direct database write or `scripts/seed-operator.mjs`; nothing in
`auth.ts` can grant it.

**One gate, deliberately.** `requireOperator()` in `studio.ts` is the only
operator check, used by `/console` and by `/api/waitlist`, `/api/changelog` and
`/api/health`. It resolves the session (failing **closed** on a thrown lookup),
rejects a non-resolved session — so a dropped `await` cannot hand it a truthy
Promise — and then reads the `role` column.

This was not always one function. Until 2026-07-26 those three API routes gated
on a *differently-implemented* function that happened to share the name
`isOperator` and only checked session shape. That was a genuine gate while
signup was disabled and the operator was the sole account able to hold a
session; opening customer signup turned it into "any stranger who registers can
read every waitlist email". The weak function is now named `isResolvedSession`
so the two can never again be confused, and `console.test.ts` asserts it is not
an authorisation check.

---

## Authorisation

Every read and write in `cue-db.ts` is scoped by `studio_id` **in the WHERE
clause**, not by a check the caller has to remember:

```sql
SELECT … FROM cue WHERE studio_id = $1 AND id = $2
```

Server actions re-derive the studio from the session via `requireStudio()`. No
form ever carries a studio id, and none is trusted if it does. That is the
authorisation boundary — the WHERE clause is defence in depth behind it.

---

## The signing endpoint

The only unauthenticated **write** in the product, and the most consequential
row it writes. It is treated accordingly.

**The token is the entire credential.** Every fact is re-derived from it
server-side — the Cue, its status, the party list. Nothing from the form is
trusted except the token and a party id, and the party id only ever *selects*
from the parties that token's Cue actually has. A forged party id selects
nothing; a forged cue id has nowhere to land, because the form never carries one.

**The link signs one side of the agreement, not any line on it.** "A forged
party id selects nothing" is true and was once mistaken for sufficient — an
attacker never needed to forge one, because the page rendered a radio button per
unsigned party. A `creator` party was therefore signable by whoever held the
client's link, producing a sealed, hash-stamped record showing the photographer
signed when they never did. `isPubliclySignable()` now restricts the link to
`client` and `additional`, enforced in the signing action, the declining action,
`addPartyAction`, and the page that renders the list. `creator` cannot be
created at all in v1. Upgrade path: an authenticated countersign inside `/app`,
then a per-party `share_token` so each link signs exactly one line.

| Control | Detail |
| --- | --- |
| Token entropy | 128 bits, `randomBytes(16).base64url` → 22 chars. Shape-checked before the database is touched. |
| Read limit | 240 / 10 min per IP hash. Deliberately generous — a client refreshing their own contract on venue wifi must never be locked out of it. |
| Write limit | 10 / 10 min per IP hash. |
| Consent | Re-checked server-side. A disabled checkbox is a courtesy to the client, never the enforcement. Stored as `consent_at`. |
| Signature | Must be a PNG data URL, ≤512 KB, strict base64 charset — so a crafted data URL cannot smuggle markup into the `<img src>` that renders it back on the sealed record. |
| Signer name | 2–120 characters, trimmed. |
| Concurrency | `SELECT … FOR UPDATE` on the Cue row. "Is this the last signature?" and "seal it" must not be separable, or two simultaneous signers would both read "one left" and neither would seal. |

Enumeration is not possible in either direction: a token that never existed, one
that was voided, and one that was declined all produce the same response.

---

## IP addresses

Stored as a **salted** SHA-256, truncated to 32 hex characters. An unsalted — or
publicly-salted — SHA-256 of an IPv4 address is brute-forced in seconds, which
would make `ip_hash` personal data wearing a hash costume.

If `IP_SALT` is absent the code **refuses to write** rather than storing a
reversible hash. This applies to the waitlist, to signing, and to declining.

### Header order

`X-Real-IP` first; `X-Forwarded-For` only as a fallback. **Do not "simplify"
this to the conventional XFF-first order.**

Caddy sets `X-Real-IP` from `{remote_host}` — the TCP peer, which a client
cannot influence. `X-Forwarded-For` carries no such guarantee: whether a proxy
replaces or appends to it is that proxy's choice, so its left-most entry is only
trustworthy when every hop in front is known. Trusting it blindly would let
anyone rotate the header for unlimited attempts and would poison the `ip_hash`
stored on the signature itself. XFF is consulted only when `X-Real-IP` is absent
— that is, when there is no proxy at all, i.e. local development.

---

## Integrity of the record

The product's central promise, so it is enforced in the database rather than by
convention:

- **Content freezes** when a Cue leaves `draft`. Two gates: `permittedPatch()`
  decides what may change, and a `status = 'draft'` predicate in the UPDATE
  decides whether the row is still what we thought. Without the second, a Cue
  sent from another tab between read and write would accept an edit to a
  document a client is already reading.
- **The client is served `cue.snapshot`**, never a re-render of the template, so
  editing a template next year cannot alter what somebody signed last year.
- **`cue_event` is append-only**, enforced by a `BEFORE UPDATE` trigger that
  raises. Not `DELETE` — row triggers fire for cascades, and every Cue logs a
  `created` event at birth, so covering DELETE would make deleting a draft
  impossible. An event vanishing with its Cue is a record ending; an event being
  rewritten is history being edited, and that is what is refused.
- **`doc_hash`** is SHA-256 over canonical JSON of the snapshot. Stable key
  order at every level, so the same content always hashes alike, and a
  whitespace change in a React component cannot invalidate a signed contract's
  hash.
- Only **drafts** can be deleted. A sent Cue is voided, which keeps the trail.

---

## Rate limiting, and which way it fails

Two bounds with deliberately opposite failure directions:

- The per-IP Redis limiter **fails open**. A cache outage must not stop a
  legitimate signup or signature. This is correct for a rate limit.
- It is the wrong behaviour for an abuse *ceiling*, so the waitlist also has a
  global hourly cap enforced in Postgres — the database the write already goes
  to. It holds whether or not Redis is up.

---

## Transport and secrets

- HTTPS terminated by Caddy; secure session cookies forced in production
  (`useSecureCookies`), since the app speaks plain HTTP behind the proxy and
  cannot infer the public origin.
- Caddy sets the security headers: HSTS with `includeSubDomains`, a CSP
  (`frame-ancestors 'none'`, `base-uri 'self'`, `object-src 'none'`,
  `form-action 'self'`, `img-src 'self' data: blob:`), `X-Frame-Options DENY`,
  `nosniff`, and `Referrer-Policy: strict-origin-when-cross-origin` — the last
  of which is what stops a share token leaking in a cross-origin Referer.
  `script-src` carries `'unsafe-inline'` because Next.js inlines hydration
  script, so the CSP is not an XSS defence today; the Caddyfile says so.
- Postgres and Redis are on an `internal: true` Docker network — no published
  ports, no egress.
- Container health is read through a read-only docker-socket-proxy. The app
  never touches `/var/run/docker.sock`.
- Secrets live only in `/opt/cue/.env` on the box. Never in the repository,
  never in a chat window. `.env.example` documents the shape.
- SSH is key-only; password authentication is disabled.
- `/app`, `/console` and `/s/[token]` all set `robots: noindex`. A signing link
  must never be indexed.

---

## Known gaps

Honest list. These are not hypothetical.

| Gap | Severity |
| --- | --- |
| **No backup beyond Neon PITR.** | **Medium, accepted 2026-07-28.** Neon point-in-time restore covers an accidental delete or a bad migration; there is no second, independent copy. Know the retention window your plan gives. |
| No email verification on signup | Medium. Anyone can register any address. Matters more once studios carry real client data. |
| No 2FA, no password reset | Medium. Reset requires an email provider, which is not wired. |
| Share tokens in request logs | Medium. The token is a path segment, so any full-URI log records every signing link. Caddy's access log is gone with the VPS; the equivalent now is Vercel's runtime logs and any log drain attached to the project. |
| Signature PNGs in Postgres | Low now, wrong at scale. Object storage is the planned home. |
| No audit-log export | Low. The record is visible in the UI and printable, but not extractable as data. |
| No penetration test | Nothing here has been externally reviewed. |

---

## If something goes wrong

There is no incident process, no on-call, and no monitoring beyond the health
check. For a pre-launch product with no customers that is a defensible trade —
it stops being defensible the moment a real agreement is signed on it.

The minimum before that: error monitoring. Backups are Neon PITR by decision.
