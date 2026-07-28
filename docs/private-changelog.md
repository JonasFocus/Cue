# Private changelog

Internal development history. Candid — dead ends, reversals, and accepted risks
are recorded here on purpose, because the reasoning is worth more than the
outcome and it is what stops the same idea being retried in six months.

**Not the public changelog.** The customer-facing one is a Postgres table
(`changelog`, migration 006) written by hand from `/console`. Nothing here is
published.

Dates are the day work landed, newest first.

---

## 2026-07-28 — Production, then off the VPS entirely

Three things happened in one day: staging became production, production moved to
Vercel, and an overnight agent loop found bugs that neither move would have
caught. Recorded in that order.

### staging.cue.krevo.io → cue.krevo.io

DNS added, Caddy taught to serve both hostnames from one block, `PUBLIC_URL`
flipped, and the app rebuilt — `PUBLIC_URL` is a build arg because the landing
page is statically prerendered, so a restart alone would have left the old
canonical baked in.

**Caddy's reload lied.** `caddy reload` reported "adapted config to JSON" and
exited 0 while the running config still listed only the staging hostname; the
admin API at `/config/apps/http/servers` was the thing that revealed it, and
`docker compose restart caddy` was what actually applied. If you ever bring
Caddy back: verify a reload against the admin API, not the command's exit code.

### The VPS is gone

Moved to Vercel with Neon Postgres and Upstash Redis, both via the Marketplace.
Two reasons, neither of them "Vercel is better":

1. **Backups were on-box only**, which `security.md` had rated High and flagged
   as unacceptable the day a real client signs. Managed Postgres removes the one
   unrecoverable failure mode a legal-records product has.
2. **~800 lines of ops shell maintained by one person** — watchdog, backup
   script, deploy script, systemd units — plus a watchdog that by its own
   admission "cannot page anyone".

The database held 1 user, 11 sessions, 2 waitlist rows and **zero signed
agreements**, which made this the cheapest hour the move would ever cost.

**Two platform differences were load-bearing, and both were caught before they
reached customers:**

- **Neon's pooler rejects `statement_timeout` as a startup parameter**, which is
  exactly how node-postgres sends it. Left in `db.ts` it would have failed
  *every* pooled connection — not a degradation, a total outage. It now lives on
  the role: `ALTER ROLE neondb_owner SET statement_timeout = '8s'`.
- **Upstash injects `KV_REST_API_URL`/`_TOKEN`**, not the `UPSTASH_REDIS_REST_*`
  names `Redis.fromEnv()` reads. Because the limiter fails open by design, a
  misconfiguration is indistinguishable from a working one — rate limiting would
  simply have been off in production with nothing on screen to say so.

**A real vulnerability was fixed rather than ported.** Four byte-identical copies
of `clientIp()` read `x-real-ip` first, which was correct behind Caddy because
Caddy set it from the TCP peer. Vercel documents overwriting `x-forwarded-for`
to prevent spoofing but says nothing about stripping an inbound `x-real-ip`, so
a client could have chosen the `ip_hash` stored on their own signature and
rotated it to bypass the signing rate limit. The four copies are now one tested
module in `client-ip.ts` that reads `x-forwarded-for` only. They had never had a
test.

**Accepted, consciously:** backups are Neon PITR alone — no second independent
copy, owner's decision. There is still **no error monitoring**, which is now the
one item `security.md` lists as a minimum.

**The trap that cost the most time, twice, in opposite directions.** A stale DNS
cache pointing at the old box kept *working* — silently serving the previous
deployment — so "production" was verified against the wrong server for hours.
The moment the Linode was destroyed, the same stale cache produced a connection
failure that looked exactly like an outage. **Check `dig` and confirm from a
phone on cellular before investigating an app that platform logs say is healthy.**

### An overnight agent loop, and what it was worth

Eight hourly iterations against a default-REJECT review gate. **Zero merges** —
every PR was rejected, and every rejection was correct, including one where the
proposed fix made the bug easier to hit. The loop's own protocol ("rejected →
do not retry tonight") plus a default-REJECT reviewer makes merging impossible
by construction, which is worth knowing before running it again.

It was still the most valuable thing that ran that night, because it found three
live defects:

- **The `blank` template could send an agreement with no terms.** Reachable
  through the real UI: `showIf` false *removes* a clause, and a removed clause
  leaves no marker for `hasBlanks` to find, so the send gate saw a complete
  document. Both gates went blind on the same dropped clause. Fixed by locking
  the clause, ungating it, and treating a whitespace-only answer as unfilled in
  `fillTokens`. The first attempt fixed one of three routes and made a second
  *easier* to reach by putting a Remove button on the clause.
- A Cue title containing `{{braces}}` froze a contract titled `Smith ———— 2026`.
  `hasBlanks` now inspects the title and clause headings, not just paragraphs.
- The console's watchdog verdict was unreadable without SSH — moot now.

### Smaller

- Guest list shows `Jul 28, 2026, 5:45:07 PM CT`. One test forces
  `process.env.TZ=Asia/Tokyo`, because on a Central machine the suite passes
  even with the timezone option deleted — it could not see the bug it exists to
  catch.
- **404 rebuilt** around an unsigned signature rule. It had its own violet/pink
  palette over a photograph inside a glass card, and looked like a different
  product. ~170 lines of CSS removed.
- **Console polling: 5s → 30s, suspended when the tab is hidden.** Two
  invocations per tick meant ~1,400/hour for a tab nobody was looking at.
- CSP now allows `'unsafe-eval'` in development only. React's dev build needs it,
  and a console full of violations that are not bugs is how you learn to ignore
  the console.

## 2026-07-28 — Nightly backups, and a stale premise

**Staging was already deployed.** The pre-staging plan recorded that nothing was
live and that migrations `007`/`008` were pending. Both were wrong by the time
it was executed: the app had been deployed at `3f481b0` and the migrations
applied at 22:38 UTC on the 27th. The check that mattered came back clean —
`007`'s role backfill ran against exactly one user row and promoted only the
operator — but the deploy advice given that night rested on a risk that had
already been taken. **Verify box state before quoting a plan's assumptions
back; a plan is a snapshot, not a fact.**

**Backups now exist.** `scripts/cue-backup.sh` on `cue-backup.timer`, nightly at
00:00 UTC, 30 days retained in `/var/backups/cue/`, mode 600 because dumps carry
email addresses and password hashes. Deliberately outside `/opt/cue`: that is a
git checkout `deploy.sh` runs `git reset --hard` against, and surviving somebody's
bad day with the repo is most of the point.

Three things the script does that a one-line `pg_dump` cron would not:

- **`set -o pipefail`.** `pg_dump | gzip` otherwise reports *gzip's* exit status.
  A `pg_dump` that dies mid-table still produces a valid gzip file and a
  zero exit code. Verified by feeding the verifier a dump truncated by 40 lines:
  `gzip -t` passed it, the completion-marker check rejected it.
- **`.partial` until verified.** A truncated dump at a real filename is worse
  than no dump — it reports as a backup and restores as a broken database.
- **Skips while a deploy holds `/var/lib/cue/deploy.pid`.** Dumping mid-migration
  captures a schema that never existed as a committed state.

Proved rather than assumed: restored into a scratch database and compared
against live — 1 user, 2 waitlist, 8 migrations, 12 tables on both sides, and
the operator role survived the round trip.

The four systemd units (both timers and both services) existed only on the box
and would have been lost in a rebuild. They are now in `scripts/systemd/`, and
`deploy.sh` still does not install them — so it cannot silently re-enable a
timer somebody stopped on purpose.

**Accepted risk, unchanged:** copies are on-box only. They survive a bad
migration or a dropped table, not the loss of the Linode. Off-box needs an R2
bucket and credentials; the upgrade is an `rclone copy` at the tail of the
script, marked with a `ponytail:` comment there.

---

## 2026-07-27 — Pre-staging rescan

The app was committed and pushed (`3f481b0`) before deploying. A rescan found
two ways to corrupt a signed legal record — both in ground that had never been
audited, because the data-integrity review commissioned during the build never
delivered.

**Fixed**

- **`addParty` could attach a signatory to a sent Cue.** It read the status,
  then INSERTed with no predicate. Two tabs interleave and the party lands after
  the snapshot froze. Because `getCueByToken` serves parties *live* rather than
  from the snapshot, that person appeared on the signing page and could sign —
  producing a sealed record whose signature block named somebody the frozen
  document did not list, with a `doc_hash` that still verified. The check now
  lives in the statement, as `removeParty` already did.
- **`sendCue` froze a snapshot built from unlocked reads.** Everything the
  snapshot is made of was read before BEGIN, so a concurrent autosave could
  commit a new client name or fee in between. Added an optimistic
  `updated_at` guard.
- **`SliderField` clamped to `MAX_SAFE_INTEGER`, not `q.max`.** A creator could
  type 999,999,999 into "Images delivered", and the delivery clause reads "will
  receive **at least** {{photo_count}}" — a binding promise of a billion
  photographs.
- **`snapshot.version` was written and never read.** No live failure, but the
  first schema change would 500 `/s/[token]`, which is the client's only view of
  a contract they may already have signed. It now degrades to the "no longer
  open" page that both callers already handle.
- Deleted the allowance pre-check in `sendCue`. The locked re-read inside the
  transaction is the real check; the pre-check could only ever be *wrong* — an
  operator upgrading a plan mid-request would tell a paying customer they had
  used their five free Cues.

**Got wrong on the first attempt, worth remembering.** The `updated_at` guard
was written with `date_trunc('milliseconds', …)` because `toISOString()` is
millisecond-precision and the raw comparison never matched. That version passed
every check and was still broken: in a tight race both writes land inside the
same millisecond, compare equal, and the stale snapshot goes through. Caught
only by running the race 25 times and asserting the *invariant* (snapshot and
row agree) rather than an outcome. `updated_at` is now read as microsecond text
through `to_char`, the same reason `admin.ts` does it for its keyset cursor and
the same family as the `shoot_date` rule.

**Documentation.** The operator customer console was in none of the docs. Added
to `AGENTS.md`, `docs/architecture.md` and `docs/security.md`. Also corrected
two now-false claims in `architecture.md`: the condition grammar gained `&`, and
a numeric `0` now means "none" for clause gating. Raised the `AGENTS.md` size
limit from 10 KB to 16 KB — the rule was written when Cue was a landing page.

**Deliberately deferred** (recorded in the plan): 10 open frontend findings, 10
open accessibility findings, `studioList`'s keyset cursor sorting on a mutable
key so active accounts are skipped while paging, the dead `.ca-topbar` costing
76px of builder preview height, and the console's `display: grid` tables losing
their implicit role.

---

## 2026-07-26 — The application

The big one. Cue went from a landing page with a waitlist to a working product:
customer accounts, an agreement builder, a signing flow, and a sealed record.
Built in one session, foundation first, then four parallel agents on
independent surfaces.

**What landed**

- The agreement engine (`agreement.ts`, `templates.ts`, `cue.ts`, `cue-db.ts`).
  Six templates as data: wedding, elopement, portrait, brand/commercial, video,
  blank.
- `/app` — auth, workspace, template picker, builder, share, sealed record.
- `/s/[token]` — public, account-free signing with a consent gate and a
  hand-written canvas signature pad.
- Migration `007`: `role`, `studio`, `cue`, `cue_party`, `cue_event`.
- 94 tests, up from 76.

**Decisions**

- *One Better Auth instance, not two.* Signup used to be disabled outright, and
  that was what kept strangers out of `/console`. Customers need accounts now,
  so the guard moved to a `role` column. Considered a second auth instance with
  its own table prefix; rejected as two session systems and two cookie scopes to
  keep in step forever. `role` is never settable through `auth.ts` — only a
  direct database write or `seed-operator.mjs`.
- *Print-to-PDF, not a renderer.* `window.print()` against a real print
  stylesheet. Rejected pdf-lib (laying out a multi-page agreement by hand, and
  it would not match the screen) and headless Chromium (hundreds of MB in the
  image on a 4 GB box). The document hash is computed server-side over canonical
  JSON regardless, so the audit record is genuine either way. Revisit when
  emailing a PDF attachment becomes real.
- *Hash canonical JSON, not HTML.* Hashing rendered HTML would make every
  signed contract's hash hostage to a whitespace change in a React component.
- *Zero new dependencies.* Signature capture is pointer events on a `<canvas>`;
  accordions are native `<details>`; the date field is `<input type="date">`.

**Caught before shipping**

- `Intl.DateTimeFormat` cannot combine `dateStyle`/`timeStyle` with
  `timeZoneName` — it throws `Invalid option : option`. It type-checks cleanly
  and only runs once a signature exists to stamp, so it passed every test and
  crashed the sealed page the first time a record actually sealed. Now one
  shared `formatStamp()` with a regression test.
- The `cue_event` append-only trigger originally covered `DELETE`. Row triggers
  fire for cascades, and every Cue logs a `created` event at birth, so deleting
  *any* draft would have raised. Narrowed to `UPDATE`.
- Eight clauses rendered slider values with no noun — "for 8 of coverage". No
  token was missing and nothing was blank, so `hasBlanks` could not see it; only
  a screenshot could. The `unit` strings are written for the form control
  ("Delivered within `[30]` days of the shoot"), so appending them automatically
  would have produced "within 30 days of the shoot of the shoot date". Fixed in
  the prose, with a test that fails on a bare number followed by a function word.
- Three internal links 404'd (`/app/cues/new`, and `/app/cues` twice — the
  latter on the screen you land on right after sending). Found by extracting
  every `href` and resolving it against the real route tree, not by reading.
- The sidebar counted only `sent` while the "Awaiting" filter showed
  `sent + opened + partially_signed` — "Awaiting 2" beside four rows. The group
  vocabulary now lives once in `cue.ts`. `listCues` also filtered groups in
  memory, which applied `LIMIT` *before* the filter and would silently drop the
  oldest awaiting Cue off the one screen meant to chase it.

**Verification.** Migrations applied to a real Postgres 17.10 (staging's major
version); the whole flow driven end to end through the domain layer and again
through a real browser. Confirmed the dangerous case explicitly: re-running
`007` does **not** promote existing creators to operator.

**Left undone, knowingly**

- `007` has never run against staging, which has real waitlist rows and no
  backups.
- The landing page still speaks in future tense and its CTAs still say "Join the
  waitlist". Deliberate — `AGENTS.md` forbids marketing ahead of the product,
  and this is not deployed.
- `AGENTS.md` is ~11.9 KB against its own 10 KB rule. All stale and duplicated
  content was cut; the remainder is the deployment runbook. Needs a decision:
  trim further or raise the limit now the product is real.
- `$0` fees warn loudly but do not block sending. A zero fee is legitimate (TFP,
  a favour), so hard-blocking would be wrong.

---

## 2026-07-26 — Mobile polish

`88ad4c2`, `a53bd08`, `e7681ea`. Mobile nav scrolls away with the page rather
than eating 64px of viewport while reading; hero status badge centred on phone
widths; spacing and touch targets tightened. A short landscape phone was
matching `min-width: 768` and blowing section padding up to desktop values,
pushing the hero CTA below the fold — hence the `min-height` on that query.

## 2026-07-26 — Waitlist console scale

`a8beeba`. Keyset pagination on the guest list, cursored on `id` rather than
`created_at`: a bulk arrival can give many rows one transaction timestamp, and a
timestamp cursor would skip people.

## 2026-07-25 — Link previews

`7d97b7b`, `8b74db2`. Two attempts. Settled on a one-line preview with
`twitter:card = summary` and a square OG image, so a shared link renders as a
compact strip rather than a full-bleed hero card.

## 2026-07-25 — Landing page

`3315d42`, `8b1b740`, `cb09445`, `634fc30`, `447a716`. Hero signing animation,
the CSS/DOM app mockup, motion tuning. The mockup is pure CSS and DOM, no
images, so it restyles with the tokens — and it became the design brief the real
app was built against.

Placeholder testimonials were **deleted rather than shipped**. If a testimonial
section ever returns, every quote must be attributable to a real named user who
agreed to it.

## 2026-07-25 — Operator console and changelog

`e5c89a0`, `42aae79`, `9aeba80`. Waitlist stats, editable guest status,
container health via a read-only docker-socket-proxy, and a hand-written
changelog.

## 2026-07-25 — Hardening

`3e730df`, `59cad66`, `3f91901`, `d339cf5`, `cfb218f`, `bf00121`, `5dce11a`.
Several adversarial review passes. The durable results:

- The waitlist honeypot was named `company`, which maps to the `organization`
  autocomplete token — password managers filled it, so real signups were being
  silently discarded with a success message. Renamed, and now logged.
- Two bounds with deliberately opposite failure directions: the per-IP Redis
  limiter fails **open** (a cache outage must not stop signups), and a global
  hourly ceiling in Postgres fails **closed enough** that the only
  unauthenticated write is never unbounded during a Redis outage.
- `X-Real-IP` before `X-Forwarded-For`. Caddy sets `X-Real-IP` from the TCP
  peer, which a client cannot influence; XFF carries no such guarantee. Consult
  XFF only when `X-Real-IP` is absent. Do not "simplify" this to the
  conventional order.
- Pool invariant: `statement_timeout` (8s) < `connectionTimeoutMillis` (10s).
  Inverted, the first symptom of database slowness is pool-acquire failures from
  healthy requests rather than the timeout of the query actually at fault.
- IP hashes are salted with `IP_SALT`. An unsalted SHA-256 of an IPv4 address is
  brute-forced in seconds; without the salt the code refuses to store.

## 2026-07-25 — Deployment

`1eb9326`, `2688109`, `1a96117`, `c668b07`, `0c9d284`. `npm run ship`, and the
fixes that made it trustworthy: `ship.sh` reported a successful deploy as dead;
`deploy.sh` had to be parsed fully before git rewrote it mid-run; build cache is
capped by size, not age.

Better Auth's four tables had been created ad hoc by its CLI directly against
staging and had never existed in version control — a fresh volume came up with
no console at all. Migration `005` is the exact live schema, transcribed and
made re-runnable.

---

## Standing risks

| Risk | Status |
| --- | --- |
| No database backups | Accepted on staging. Not acceptable once a real client signs a real agreement. |
| `cue.krevo.io` has no DNS record | Only `staging.cue.krevo.io` resolves. |
| No MX on `cue.krevo.io` | `hello@cue.krevo.io` bounces — never publish it. Use `hello@krevo.io`. |
| Cue name | Still needs a trademark screen before public launch. |
| Signatures live in Postgres | Fine at 512 KB each and this volume; wrong at scale. |
