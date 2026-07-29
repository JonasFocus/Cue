<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Cue Engineering Guide

## Scope

- Cue is a client agreement and electronic-signing service for photographers and
  videographers. Production is **`cue.krevo.io`**, on Vercel since 2026-07-28.
  There is **no staging environment and no rollback target** — a push to `main`
  is a release. It is a Krevo product but a separate codebase from the main
  Krevo application.
- [`docs/solution.md`](./docs/solution.md) is the product spec: positioning, copy, pricing,
  architecture, and non-goals. Read it before changing product surface or copy.
- Live code, configuration, and tests are authoritative. Keep tasks focused and
  preserve unrelated working-tree changes.
- Do not commit, push, open a PR, or deploy unless asked.

## Product truth

- The customer-facing object is **a Cue**. The core line is
  **"Send the Cue. Get the yes. Keep the record."** `docs/solution.md` names
  **"Create your first Cue"** as the launch CTA — hold it until there is
  something to create; until then every button on the public site reads
  **"Join the waitlist"**.
- Market only what works. The landing page currently ships ahead of the product,
  so every CTA must collect interest rather than imply a working signup.
- The public contact address is **`hello@krevo.io`**. `cue.krevo.io` has no MX
  record, so `hello@cue.krevo.io` bounces — never publish it.
- Cue is deliberately **not** a form builder, studio-management platform,
  payment product, or invoicing tool. Reject scope that drifts toward those.
- Cue is not a law firm and gives no legal advice. Keep that disclaimer in the
  footer and avoid claiming legal enforceability beyond the audit record.
- The public site must not advertise `/console` — it is the operator's ops
  surface, reached by bookmark. Customer sign-in lives at `/app/login`.
- Describe unbuilt behaviour in the future tense on the public site. Signing,
  the sealed browser-printable record, and audit events work today; generated
  PDFs, email delivery, and the other planned plan benefits do not.

## Current state

What exists:

- **The marketing landing page** (`src/app/page.tsx` from `src/components/*`)
  and **the waitlist** (`src/app/actions.ts`): the page describes working
  features in present tense and labels planned plan benefits; the form validates
  the email, rate-limits
  on a salted hash of the client IP through Redis, inserts into `waitlist`.
  It sends no mail.
- **An operator-only console** at `/console`. Signup is no longer disabled —
  customers need accounts — so the guard is now the `role` column added in
  migration 007. `/console` checks `isOperator()` (`src/lib/studio.ts`) and
  redirects a creator to `/app`. Nothing in `auth.ts` can grant `operator`; only
  a direct database write or `scripts/seed-operator.mjs` can. It is **not** a
  customer account system.
- **Invite-only access** (added 2026-07-28), in `src/lib/invite.ts` and migration
  `009`. An account can only exist for an address holding a live invite, and
  access is re-derived on every request, so revoking lands at the invitee's next
  request rather than at their next sign-in. Two gates, deliberately different:
  the `user.create.before` hook in `auth.ts` closes account creation (it sits
  inside the create, so a POST straight at `/api/auth/sign-up/email` is refused
  too), and `requireStudio()` gates every `/app` page **and server action**
  afterwards, redirecting to `/app/locked`. Operators bypass both — they are
  seeded by script and hold no invite. `/app/signup` is now a closed door; the
  form lives at `/invite/[token]`, reached by a link copied from
  `/console/invites`. Migration 009 backfills an open-ended accepted invite for
  every creator that predates it, so closing signup evicted nobody.
- **The customer application** at `/app` (added 2026-07-26): auth, workspace,
  template picker, builder, share screen, sealed record. Scoped to `.ca`. Every
  page and action enters through `requireStudio()`, which is also the invite
  gate — see above.
- **The client signing flow** at `/s/[token]`, public and account-free — a
  read-to-the-end consent gate, a hand-written `<canvas>` pad, and a server
  action that re-derives every fact from the token.
- **The agreement engine**: `src/lib/agreement.ts` (pure), six templates as data
  in `templates.ts`, lifecycle rules in `cue.ts`, I/O in `cue-db.ts`. A template
  is a question spec plus conditional clauses — a shoot type is data, not code.
- **The operator invite console** at `/console/invites`: create an invite (name,
  address, starting plan, access period), copy its link, move the end date or
  plan, revoke, restore, or delete one nobody has taken up. The plan is applied
  once, by `ensureStudio()` in the INSERT that creates the studio; afterwards
  `studio.plan` is the truth and the console stops offering the control, so the
  two cannot disagree. Nothing is emailed — copying the link is the
  delivery, exactly as it is for a Cue. No action there can change the address or
  token an invite is for, or delete one an account already stands on.
- **The operator customer console** at `/console/studios` and
  `/console/studios/[id]`, backed by `src/lib/admin.ts`. Cue is B2B: customers
  are studios and they have clients of their own, so this surface shows
  activation, usage, and **other studios' client lists** — treat it as the most
  data-sensitive screen in the product. Every route and action gates on
  `requireOperator()`. It can edit a studio's profile and plan and **nothing
  else**: `admin.ts` writes only to `studio` and `admin_event`, and never selects
  `share_token`, `signature_png`, `ip_hash` or `user_agent`. Operator mutations
  are logged to `admin_event` (migration `008`), which refuses UPDATE and DELETE.
  There is deliberately no impersonation.
- **Five API routes**: `/api/auth/[...all]` (Better Auth), `/api/health`
  (operator-gated probes), `/api/ping` (public process liveness), `/api/waitlist`
  (operator-gated guest list and status PATCH), and `/api/changelog`
  (operator-gated changelog CRUD).
- **SQL migrations** in `db/migrations/`, applied by `scripts/migrate.sh`.
- **Legal pages** at `/legal/privacy` and `/legal/terms`. They must keep
  describing exactly what `actions.ts` and `db.ts` do, and nothing more. No
  compliance claims (GDPR, SOC 2, DPO) — none have been done.

What does not exist, and must not be described as if it did: **an email
provider** (nothing is ever mailed — sharing the link is the only delivery, and
both the share screen and the sealed page say so), **server-side PDF rendering**
(the "final PDF" is `window.print()` against the print stylesheet in
`src/components/agreement.css`), object storage, a background worker, saved or
custom templates, multiple users per studio, and Stripe.

The application and signing flow are deployed. Public claims must still track
production exactly: no generated PDF, email delivery, custom templates,
multiple users, custom domain, priority support, object storage, or billing.

Five invariants carry the product: content freezes when a Cue leaves `draft`;
the client is served `cue.snapshot`, never a re-render; `cue_event` is
append-only; `shoot_date` is read via `to_char`; money is integer cents. Each is
explained at its definition in `src/lib/{cue,cue-db,agreement}.ts` and pinned by
`cue.test.ts` / `agreement.test.ts`. Read the comment and the test before
changing any of them — every one of the five has a non-obvious reason.

- Pricing is static. Per the launch billing decision in `docs/solution.md`, define the
  Free, Pro, and Studio plans in the product but **do not wire Stripe for
  version one**. The `creator` tier was renamed `pro` in `010`, value and label:
  `creator` also means a user's role and a signing party's role, and one word
  for three things was worth fixing while no row was on a paid tier. `PLANS` in
  `cue.ts` is the vocabulary, pinned by `admin.test.ts` to the CHECK constraints
  on both `studio.plan` and `invite.plan`.
- Placeholder testimonials were **deleted** on 2026-07-25 rather than shipped.
  If a testimonial section returns, every quote must be sourced and attributable
  to a real named user who agreed to it. Never present invented quotes as real.

## Runtime and stack

- Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS 4, Node.js
  runtime. Do not introduce Edge runtime assumptions.
- `next/font` supplies Geist (headings) and Inter (body). Do not add font
  packages; the CSS reads `--font-geist` and `--font-inter`.
- `lucide-react` is the only icon dependency.
- Runtime dependencies beyond React and Next: `better-auth` (sessions), `pg`
  (`src/lib/db.ts`, one pooled client stashed on `globalThis`), `@upstash/redis`
  (`src/lib/redis.ts`, rate limiting only — it fails open), and
  `@vercel/functions` (`attachDatabasePool`).
- **Security headers live in `next.config.ts`**, not in a proxy. Caddy used to
  send the CSP, HSTS, `X-Frame-Options`, `Permissions-Policy` and COOP; Vercel
  sends none of them by default. `X-Robots-Tag` is derived from `VERCEL_ENV` at
  build time, so preview deployments are never indexable.
- **Client IP comes from `x-forwarded-for` only** (`src/lib/client-ip.ts`).
  Vercel overwrites that header to prevent spoofing; nothing documents the same
  for `x-real-ip`, so it is not read. The value is salted into
  `cue_party.ip_hash` as signature evidence — do not widen this.
- **`statement_timeout` is set on the database role, not in the pool.** Neon's
  pooled endpoint rejects unknown startup parameters, and node-postgres sends
  that option as one, so setting it in `db.ts` fails *every* pooled connection.
  See the comment there before reinstating it.
- Still planned per `docs/solution.md` and not started: a PDF/reminder worker,
  S3-compatible object storage, a transactional email provider, and error and
  uptime monitoring.
- Deployment is **Vercel** (migrated 2026-07-28 from Docker Compose behind Caddy
  on a Linode). Postgres is Neon and the rate limiter is Upstash, both via the
  Vercel Marketplace, both in `us-east-1` alongside functions pinned to `iad1`
  in `vercel.json`. Nothing in the app depends on the provider.

## Design system

- `src/app/design.css` is ported from the Krevo Cloud landing page and scoped to
  `.cue` (set on `<body>`). All tokens are `--cue-*`. Keep them there so they do
  not leak into future authenticated surfaces.
- `src/app/globals.css` holds the Tailwind import and resets only. No colour.
- The reading column is **820px** (`.cue-shell`, `max-width: 860px` with 20px
  padding). Pricing breaks out to 1040px via `.cue-shell-wide` because it carries
  three tiers.
- Section rhythm is `padding: 134px 0 80px` on desktop. Headings are 40px/42px
  with `-0.02em` tracking; the h1 is 56px with `-0.035em`.
- Product screenshots in `src/components/mock.tsx` are CSS and DOM, not images.
  They restyle with the tokens. Swap them for real screenshots once the app UI
  exists.
- Scroll behaviour: `Reveal` (IntersectionObserver, adds `.is-visible`) for
  section entrances, and a scroll-linked progress rail in `Steps`. Everything
  must respect `prefers-reduced-motion`.

## Engineering conventions

- Follow file-local style. Use `@/` imports for `src/` modules, keep strict
  typing, and do not silence errors with `any` or broad casts.
- Prefer Server Components. Add `"use client"` only for browser APIs, local
  interaction, or client hooks. On the marketing site that is `nav.tsx`,
  `flow.tsx` (`Flow` and `Steps`), `reveal.tsx`, `anim-host.tsx`, `waitlist.tsx`,
  `console/dashboard.tsx`, and `console/login/form.tsx`. In `/console/studios`
  and `/console/invites` it is only the forms. In `/app`, `/invite` and `/s` it
  is the auth and invite forms, the app nav, the builder and its fields, and the
  signing controls — everything else there is server-rendered, and the signing
  page in particular must stay that way.
- Client components on an operator surface must not import from `admin.ts` or
  `invite.ts`. Both reach `pg`, and the bundler follows a client import graph
  through a dynamic `import()` too, so one value pulled across sends the build
  looking for `dns`/`fs`/`net`. Pure vocabulary lives in `cue.ts`; render labels
  on the server and pass primitives down.
- Reach for native platform features before dependencies. The FAQ uses native
  `<details>` rather than an accordion library; keep that instinct.
- Do not add dependencies without asking first. Suggest, then wait.
- Prefer editing an existing file over creating a new one.
- Comment only non-obvious "why". Deliberate simplifications are marked with a
  `ponytail:` comment naming the shortcut and its upgrade path.
- For UI changes, check desktop and mobile layouts, keyboard and focus
  behaviour, and reduced motion.

## Commands

```bash
npm install
npm run dev
npm run lint
npx tsc --noEmit
npm run test      # node:test, no framework — see src/lib/waitlist.test.ts
npm run build
```

Tests use Node's built-in runner, so there is no test dependency. Put pure
logic in `src/lib/` where it can be imported by a test; a `"use server"` module
may only export async functions and cannot be unit tested directly. The
signing, PDF, and audit paths must not ship untested.

## Deployment

Production is **https://cue.krevo.io** on Vercel, project `cue` under
`cloverings1s-projects`. A push to `main` deploys to production; every other
branch gets a preview.

```bash
vercel deploy --prod     # or just push to main
vercel env pull .env.local --environment production
```

- Secrets live in Vercel project settings, never in the repo. `BETTER_AUTH_SECRET`
  and `IP_SALT` are marked sensitive, so `vercel env pull` writes `[SENSITIVE]`
  rather than the value — that is expected, not a failure. Verify them by
  logging in, not by reading them back.
- Neon injects `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct).
  Upstash injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` — **not** the
  `UPSTASH_REDIS_REST_*` names `Redis.fromEnv()` looks for, which is why
  `redis.ts` reads the pair explicitly.

### Migrations

**Nothing runs migrations automatically.** Builds happen per-deployment, in
parallel, including on previews — so wiring `migrate.sh` into the build command
would be wrong. Run it by hand *before* deploying code that needs the schema:

```bash
vercel env pull .env.local --environment production
./scripts/migrate.sh --status      # list applied vs pending
./scripts/migrate.sh               # apply
```

It uses `MIGRATE_DATABASE_URL`, falling back to `DATABASE_URL_UNPOOLED`, and
**refuses a pooled endpoint**: `pg_advisory_lock` is session-scoped and a
transaction-mode pooler drops it silently, which would leave the
`-- no-transaction` path with no protection at all.

Schema changes go in `db/migrations/NNN_name.sql`. Write them to be safe to
re-run. The Better Auth tables are generated by its CLI and committed as
`005_auth_schema.sql`; regenerate rather than hand-editing.

### Backups

Neon point-in-time restore. There is no `pg_dump` cron any more — the nightly
30-day dump died with the VPS. Check the retention your Neon plan actually
gives you; this is the only copy of every signed agreement.

### There is no rollback

The Linode was destroyed on 2026-07-28 and `staging.cue.krevo.io` no longer
resolves. `main` no longer contains the Dockerfile, compose file, Caddyfile or
deploy scripts, so there is nothing to roll back *to* — recovering means fixing
forward, or reverting the commit and letting Vercel redeploy.

The pre-migration database survives only as a one-off `pg_dump` on the owner's
machine, gitignored. Everything since is in Neon.

## Maintaining this file

- Add a rule only for durable architecture, exact commands, or repeated
  mistakes. Remove stale rules promptly.
- Keep this file under 16 KB. (Was 10 KB, set when Cue was a landing page
  with a waitlist. Raised 2026-07-27 rather than deleting deployment runbook
  detail to satisfy a number.)
