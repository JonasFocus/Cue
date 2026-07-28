<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Cue Engineering Guide

## Scope

- Cue is a client agreement and electronic-signing service for photographers and
  videographers. `cue.krevo.io` is the intended production domain but has no DNS
  record yet; only `staging.cue.krevo.io` resolves. It is a Krevo product but a
  separate codebase from the main Krevo application.
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
- Describe unbuilt behaviour in the future tense on the public site. Present
  tense on the signing, PDF, email, and audit features reads as a claim that
  they work today.

## Current state

What exists:

- **The marketing landing page** (`src/app/page.tsx` from `src/components/*`)
  and **the waitlist** (`src/app/actions.ts`): validates the email, rate-limits
  on a salted hash of the client IP through Redis, inserts into `waitlist`.
  It sends no mail.
- **An operator-only console** at `/console`. Signup is no longer disabled —
  customers need accounts — so the guard is now the `role` column added in
  migration 007. `/console` checks `isOperator()` (`src/lib/studio.ts`) and
  redirects a creator to `/app`. Nothing in `auth.ts` can grant `operator`; only
  a direct database write or `scripts/seed-operator.mjs` can. It is **not** a
  customer account system.
- **The customer application** at `/app` (added 2026-07-26): auth, workspace,
  template picker, builder, share screen, sealed record. Scoped to `.ca`.
- **The client signing flow** at `/s/[token]`, public and account-free — a
  read-to-the-end consent gate, a hand-written `<canvas>` pad, and a server
  action that re-derives every fact from the token.
- **The agreement engine**: `src/lib/agreement.ts` (pure), six templates as data
  in `templates.ts`, lifecycle rules in `cue.ts`, I/O in `cue-db.ts`. A template
  is a question spec plus conditional clauses — a shoot type is data, not code.
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
- **Four API routes**: `/api/auth/[...all]` (Better Auth), `/api/health`
  (operator-gated probes), `/api/ping` (container liveness), `/api/waitlist`
  (operator-gated guest list and status PATCH).
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

The landing page still describes the product in the future tense. It has not
been updated to match the app and must not be, until the app is deployed and
the claims are actually true of production.

Five invariants carry the product: content freezes when a Cue leaves `draft`;
the client is served `cue.snapshot`, never a re-render; `cue_event` is
append-only; `shoot_date` is read via `to_char`; money is integer cents. Each is
explained at its definition in `src/lib/{cue,cue-db,agreement}.ts` and pinned by
`cue.test.ts` / `agreement.test.ts`. Read the comment and the test before
changing any of them — every one of the five has a non-obvious reason.

- Pricing is static. Per the launch billing decision in `docs/solution.md`, define the
  Free, Creator, and Studio plans in the product but **do not wire Stripe for
  version one**.
- Placeholder testimonials were **deleted** on 2026-07-25 rather than shipped.
  If a testimonial section returns, every quote must be sourced and attributable
  to a real named user who agreed to it. Never present invented quotes as real.

## Runtime and stack

- Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS 4, Node.js
  runtime. Do not introduce Edge runtime assumptions.
- `next/font` supplies Geist (headings) and Inter (body). Do not add font
  packages; the CSS reads `--font-geist` and `--font-inter`.
- `lucide-react` is the only icon dependency.
- Runtime dependencies beyond React and Next: `better-auth` (console sessions),
  `pg` (`src/lib/db.ts`, one pooled client stashed on `globalThis`), and `redis`
  (`src/lib/redis.ts`, rate limiting only — it fails open).
- `src/lib/docker.ts` reads container health from a read-only
  docker-socket-proxy over HTTP. The app never touches `/var/run/docker.sock`.
- Still planned per `docs/solution.md` and not started: a PDF/reminder worker,
  S3-compatible object storage, a transactional email provider, and error and
  uptime monitoring.
- Deployment is Docker Compose behind Caddy on a single VPS, never Vercel.
  `docs/solution.md` recommends DigitalOcean; the box actually in use is a Linode
  (see Deployment). Nothing in the stack depends on the provider.

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
  `console/dashboard.tsx`, and `console/login/form.tsx`. In `/app` and `/s` it is
  the auth forms, the app nav, the builder and its fields, and the signing
  controls — everything else there is server-rendered, and the signing page in
  particular must stay that way.
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
npm run ship      # verify → commit → push → deploy to staging (see Deployment)
```

Tests use Node's built-in runner, so there is no test dependency. Put pure
logic in `src/lib/` where it can be imported by a test; a `"use server"` module
may only export async functions and cannot be unit tested directly. The
signing, PDF, and audit paths must not ship untested.

## Deployment

Staging is `https://staging.cue.krevo.io` on a Linode VPS at `172.236.109.208`,
running Docker Compose behind Caddy. Deploys pull from `origin/main`, so commit
and push first, then:

```bash
ssh root@172.236.109.208 '/opt/cue/scripts/deploy.sh'
```

`deploy.sh` fetches, rebuilds, restarts, runs pending migrations, waits for the
health check, and prunes build cache. It fails loudly and prints logs if the app
does not become healthy.

- Secrets live only in `/opt/cue/.env` on the box (see `.env.example`). They are
  never in the repo and never in a chat window.
- Schema changes go in `db/migrations/NNN_name.sql` and are applied by
  `scripts/migrate.sh`, which tracks them in `schema_migrations`. Write them to
  be safe to re-run. `db/migrations/` is the only path that *applies* schema; a
  Postgres entrypoint `init.sql` would run solely on a fresh volume, which is why
  it was removed. Not every migration is hand-authored: the Better Auth tables
  (`user`, `session`, `account`, `verification`) are generated by the Better Auth
  CLI and the generated SQL is committed as a migration
  (`db/migrations/005_auth_schema.sql`) so the schema lives in the repo. Regenerate
  it with the CLI after a `better-auth` upgrade rather than editing it by hand.
- SSH is key-only; password authentication is disabled.
- Postgres and Redis are on an `internal: true` network with no published ports
  and no egress. The app reads container health through a read-only
  docker-socket-proxy, never `/var/run/docker.sock` directly.
- **There are no database backups.** This is a deliberate, owner-accepted risk
  on staging. Do not assume the waitlist is recoverable.

### Rebuilding from nothing

Migrations create the schema but not the operator, so a fresh Postgres volume
gives a console that renders a login nobody can pass. After the first deploy
against an empty database:

```bash
ssh root@172.236.109.208 'cd /opt/cue && set -a && . ./.env && set +a && \
  docker compose run --rm --no-deps \
    -e DATABASE_URL="postgresql://cue:$POSTGRES_PASSWORD@postgres:5432/cue" \
    -e BETTER_AUTH_SECRET="$BETTER_AUTH_SECRET" \
    -e OPERATOR_EMAIL=you@example.com -e OPERATOR_PASSWORD="$(openssl rand -base64 24)" \
    app node scripts/seed-operator.mjs'
```

It is idempotent — it exits without changes if the account already exists.

## Maintaining this file

- Add a rule only for durable architecture, exact commands, or repeated
  mistakes. Remove stale rules promptly.
- Keep this file under 16 KB. (Was 10 KB, set when Cue was a landing page
  with a waitlist. Raised 2026-07-27 rather than deleting deployment runbook
  detail to satisfy a number.)
