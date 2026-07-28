# Architecture

How Cue is actually built, as of 2026-07-26. This describes the code in the
repository, not a plan. Where something is unbuilt it says so.

For the rules you must follow when changing it, see [`AGENTS.md`](../AGENTS.md).
For why the product exists, see [`solution.md`](./solution.md).

---

## The shape of it

One Next.js application serving three separate surfaces, plus Postgres and
Redis. No microservices, no queue, no worker.

| Surface | Route | Audience | Auth |
| --- | --- | --- | --- |
| Marketing site | `/` | The public | none |
| Customer app | `/app/*` | Creators | Better Auth session |
| Client signing | `/s/[token]` | The creator's client | the token itself |
| Operator console | `/console` | Jonas | session + `role = 'operator'` |
| Customer management | `/console/studios` | Jonas | session + `role = 'operator'` |

Each surface has its own CSS namespace so a change to one cannot reflow
another: `.cue` (marketing, `design.css`), `.ca` (app, `app.css`), `.cx`
(console, `console.css`), `.doc` (the agreement itself, `agreement.css`).

---

## The agreement engine

This is the only real abstraction in the codebase, and everything else is
plumbing around it.

A **template** is a question spec plus an ordered list of clauses. Adding a
shoot type is data in `templates.ts` — no new code, no new form, no new route.

```
Template ──┬── questions: Question[]   the builder form is GENERATED from this
           └── clauses:  Clause[]      each with an optional showIf

  answers (vars) ──► showIf gates which clauses survive
                 ──► {{tokens}} fill the surviving prose
                 ──► RenderedDocument
```

| File | Contains | Pure? |
| --- | --- | --- |
| `src/lib/agreement.ts` | conditions, token filling, rendering, hashing | yes |
| `src/lib/templates.ts` | the six templates, as data | yes |
| `src/lib/cue.ts` | statuses, transitions, the edit allowlist, validators | yes |
| `src/lib/cue-db.ts` | the I/O that applies those rules | no |
| `src/lib/studio.ts` | session → studio, the operator guard | no |

The pure files carry the rules precisely so a test can reach them without a
database. `agreement.test.ts` and `cue.test.ts` are the specification.

### The condition grammar

Atoms: `key`, `!key`, `key=value`. Joined with `&`, which means AND. No OR, no
parentheses, no precedence — if a template ever wants OR, write two clauses.

The `&` was added on 2026-07-26 after the single-atom version produced five
wrong contracts. Answers to hidden questions are deliberately *kept* in `vars`
(toggling a section off and back on must not lose what was typed), so a clause
gated on a sub-question stayed true after its parent toggle was switched off:
turning "take a deposit" off still produced a document demanding 30% up front,
and marking the deposit refundable produced one that said both "non-refundable
once paid" and "refundable in full". The earlier rule here said to reach for a
derived var instead — in practice that meant inventing bookkeeping vars whose
only job was to express an AND, which is worse than the AND.

A numeric `0` means **none** for clause gating, so its clause is dropped —
otherwise `revisions: 0` rendered "0 rounds of revisions are included" and the
`no_revisions` clause was unreachable. This is *gating*, not answeredness: the
builder's own `isAnswered` still treats a deliberate 0 as answered.

### One renderer, three consumers

`AgreementView` renders the creator's live preview, the client's signing page,
and the printed PDF. One component on purpose: the document a creator approves
and the document a client signs have to be the same pixels, and the surest way
to guarantee that is for there to be only one of it.

---

## Data model

Migration `007_app_schema.sql`. Earlier migrations cover the waitlist, the
changelog, and Better Auth's four tables.

```
user ──1:1── studio ──1:N── cue ──┬──1:N── cue_party   (who signs, and their evidence)
 │                                └──1:N── cue_event   (append-only audit trail)
 └── role: 'creator' | 'operator'

admin_event   (append-only; operator actions. Deliberately NO foreign keys —
               see below)
```

| Column | Why it is the way it is |
| --- | --- |
| `cue.snapshot` (jsonb) | The rendered document, frozen at send. Everything after that point reads this, never the template — so editing a template next year cannot alter what somebody signed last year. |
| `cue.doc_hash` | SHA-256 over *canonical JSON* of the snapshot, not HTML. Hashing HTML would make the hash hostage to every whitespace change in a React component. |
| `cue.share_token` | `NULL` until sent, `UNIQUE` otherwise. Postgres allows many NULLs in a unique column, so a draft simply has no link. |
| `cue.shoot_date` | A real `date`, but always read through `to_char(…, 'YYYY-MM-DD')`. node-postgres parses `date` to local midnight, and `.toISOString()` then prints the *previous day* for every US timezone. |
| `studio.sent_count` | Denormalised. The free allowance is five sends *forever*, so the alternative is counting every historical Cue on every page load. |
| money everywhere | Integer cents. Never float. |

`admin_event` (migration `008`) records every operator mutation and refuses
**both** UPDATE and DELETE — unlike `cue_event`, nothing cascades into it, so
there is no legitimate delete, and a log of operator actions that operators can
quietly remove is not a log. It carries **no foreign keys in either direction**,
which is a correctness requirement rather than a preference: `ON DELETE SET NULL`
toward `cue` issues an *UPDATE*, which the append-only trigger refuses — so an FK
there would make `DELETE FROM cue` raise for any draft an operator had ever
looked at. Toward `"user"`, a cascade would erase the trail along with the
operator it describes.

`cue_event` has a `BEFORE UPDATE` trigger that raises. Not `DELETE` — row
triggers fire for cascades, and every Cue logs a `created` event at birth, so
covering DELETE would make deleting a draft impossible. The distinction that
matters is preserved: an event vanishing with its Cue is a record ending; an
event being rewritten is history being edited, and that is refused.

---

## The lifecycle

```
draft ──send──► sent ──open──► opened ──sign──► partially_signed ──sign──► signed
  │              │               │                    │                      ▲
  └──────────────┴───────────────┴────────────────────┴──► voided / declined  │
                                                                    (terminal)┘
```

`signed` is terminal and implies sealed — there is no separate `sealed` status,
because sealing happens in the same transaction as the final signature. A row
that was signed but unsealed would be a bug, not a state.

**What a creator may change, and when.** This is the rule the whole product
rests on:

- `draft` — everything.
- anything else — `notes` only. Internal, never rendered into the document,
  never shown to a client. That is exactly why it stays editable forever: a
  creator annotating their own file cannot alter what anyone agreed to.

Two gates enforce it, and both are needed. `permittedPatch()` decides what may
change; the `status = 'draft'` predicate in the UPDATE decides whether the row
is still what we thought it was. Without the second, a Cue sent from another tab
between the read and the write would accept an edit to a document a client is
already reading.

---

## Request flows

### Sending

One transaction, because a snapshot written without a status change would let a
client open a link to a Cue the creator still believes is a draft.

```
render snapshot → sha256(canonical JSON) → randomBytes(16).base64url
  └─ BEGIN
       SELECT plan, sent_count FROM studio WHERE id=? FOR UPDATE   ← allowance
       UPDATE cue SET status='sent', share_token, snapshot, doc_hash, sent_at
              WHERE studio_id=? AND id=? AND status='draft'        ← freeze
                AND updated_at = ?                                 ← content
       UPDATE studio SET sent_count = sent_count + 1
       INSERT cue_event 'sent'
     COMMIT
```

Three guards, each for a different failure. The **studio lock** serialises the
allowance check: two free-plan sends at `sent_count = 4` would otherwise both
read 4 and both increment. The **status predicate** stops a Cue being sent
twice. The **`updated_at` predicate** is the subtle one — everything the
snapshot is built from is read *before* BEGIN, so without it a concurrent
autosave from a second tab could commit a new client name or fee in between and
this would freeze a document that no longer matched the row, leaving the client
signing a page that named them one way in the prose and another in the
signature block.

Counted on send, never on create: a draft costs nothing, and a creator
exploring the builder must not burn their five free Cues doing it.

### Signing — the only unauthenticated write

The token is the entire credential, so every fact is re-derived from it
server-side. Nothing from the form is trusted except the token and a party id,
and the party id only ever *selects* from the parties that token's Cue actually
has.

```
isShareToken(token)         shape-check before touching the database
  → rateLimit(ip)           10 attempts / 10 min, keyed on a salted IP hash
  → consent === 'agreed'    re-checked; a disabled checkbox is a courtesy, not enforcement
  → isValidSignerName()
  → isSignatureImage()      PNG data-URL prefix + size cap + strict base64 charset
  → getCueByToken()         the cue, the status and the party list all come from here
  → BEGIN … SELECT status FOR UPDATE … COMMIT
```

The row lock matters: "is this the last signature?" and "seal it" must not be
separated, or two parties signing simultaneously would both read "one left" and
neither would seal.

A double-tap on a slow connection is the most likely way to hit this endpoint
twice. It is not a failure — the first tap worked — so it redirects to the same
confirmation rather than showing an error.

---

## Deployment

Vercel, since 2026-07-28. Postgres is Neon and the rate limiter is Upstash, both
through the Vercel Marketplace, both in `us-east-1` with functions pinned to
`iad1`.

```
  client ──HTTPS──► Vercel edge ──► Next.js function (iad1)
                                      ├──► Neon Postgres (pooled)
                                      └──► Upstash Redis (REST)
```

Three things differ from the VPS it replaced, and each is load-bearing:

- **Security headers live in `next.config.ts`.** Caddy used to send the CSP,
  HSTS and the rest; Vercel sends none of them by default.
- **Client IP comes from `x-forwarded-for` only.** Vercel overwrites that header
  to prevent spoofing and documents nothing about `x-real-ip`, so `x-real-ip` is
  not read at all. The value is salted into `cue_party.ip_hash`.
- **`statement_timeout` is set on the database role**, not in the pool. Neon's
  pooled endpoint rejects unknown startup parameters, which is what
  node-postgres sends that option as.

Redis is still rate limiting only and still **fails open**; the abuse ceiling
that must not fail open lives in Postgres.

Migrations are not run by any deploy. See [`AGENTS.md`](../AGENTS.md).

---

## What is deliberately not built

Not oversights — decisions. See [`solution.md`](./solution.md) for the reasoning.

| Not built | Consequence today |
| --- | --- |
| Email provider | Cue mails nobody. Sharing the link *is* the delivery, and the share and sealed screens say so plainly. |
| Server-side PDF | "Download PDF" is `window.print()` against the print stylesheet in `agreement.css`. The audit hash is computed server-side regardless, so the record is genuine either way. |
| Stripe | Plans and gates exist; billing does not. Upgrade goes to `hello@krevo.io`. |
| Object storage | Signatures are PNG data URLs in Postgres, capped at 512 KB. |
| Background worker | Nothing is queued, so nothing needs one yet. |
| Saved/custom templates | The six system templates are code. Per-Cue clause removal covers most of the need. |
| Multiple users per studio | `studio.owner_user_id` is 1:1 and `UNIQUE`. |
| Database backups | Neon point-in-time restore. The nightly `pg_dump` died with the VPS; no separate copy is kept, by decision. |

---

## Adding things

**A new shoot type** — add a `Template` to `TEMPLATES` in `templates.ts`. That
is the whole change. `agreement.test.ts` will check its tokens resolve, its
`showIf` keys exist, its clause ids are unique, and that it carries the locked
disclaimer.

**A new question type** — add it to `QuestionType`, handle it in `displayValue()`
in `agreement.ts`, and add a control to `fields.tsx`.

**A new status** — add it to `CUE_STATUSES`, to the `CHECK` constraint in a new
migration, and to `TRANSITIONS`. A test cross-checks the SQL constraint against
the TypeScript list so the two cannot drift.

---

## Two traps this codebase has already fallen into

**Read-then-write across a status change.** Every write that depends on a Cue
still being a draft must carry that predicate *in the statement*, not in an
`if` above it. `addParty` did the latter and could attach a signatory to a Cue
that had been sent from another tab — producing a sealed record whose signature
block named somebody the frozen document did not list. `removeParty` and
`deleteCue` show the correct shape.

**Timestamps through JavaScript lose precision.** `timestamptz` keeps
microseconds; node-postgres hands back a JS `Date` and `toISOString()` truncates
to milliseconds. `sendCue`'s optimistic guard and `admin.ts`'s keyset cursor both
read the column as microsecond text through `to_char` for exactly this reason. A
millisecond-truncated version of the send guard was written first and passed
stale snapshots through, because in a tight race both writes land inside the same
millisecond. The same family as the `shoot_date` rule above.
