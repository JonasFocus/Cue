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
- [`solution.md`](./solution.md) is the product spec: positioning, copy, pricing,
  architecture, and non-goals. Read it before changing product surface or copy.
- Live code, configuration, and tests are authoritative. Keep tasks focused and
  preserve unrelated working-tree changes.
- Do not commit, push, open a PR, or deploy unless asked.

## Product truth

- The customer-facing object is **a Cue**. The core line is
  **"Send the Cue. Get the yes. Keep the record."** `solution.md` names
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
- The public site must not advertise `/console`. It is the operator's ops
  surface, signup is disabled, and a visitor can never get in — a "Sign in" link
  in the nav promises a customer account system that does not exist. The
  operator reaches it by bookmark.
- Describe unbuilt behaviour in the future tense on the public site. Present
  tense on the signing, PDF, email, and audit features reads as a claim that
  they work today.

## Current state

What exists:

- **The marketing landing page.** `src/app/page.tsx` composes it from
  `src/components/*`. Its only working action is the waitlist.
- **The waitlist.** `src/app/actions.ts` (`"use server"`) validates the email,
  rate-limits on a salted hash of the client IP through Redis, and inserts into
  the Postgres `waitlist` table. It sends no mail — no email provider is wired.
- **An operator-only console** at `/console`, guarded by Better Auth
  (`src/lib/auth.ts`) with `disableSignUp: true`. The single operator account is
  seeded by `scripts/seed-operator.mjs`. It reads waitlist stats and container
  health. It is **not** a customer account system.
- **Four API routes**: `/api/auth/[...all]` (Better Auth), `/api/health`
  (operator-gated probes), `/api/ping` (container liveness), `/api/waitlist`
  (operator-gated guest list and status PATCH).
- **SQL migrations** in `db/migrations/`, applied by `scripts/migrate.sh`.
- **Legal pages** at `/legal/privacy` and `/legal/terms`. They must keep
  describing exactly what `actions.ts` and `db.ts` do, and nothing more. No
  compliance claims (GDPR, SOC 2, DPO) — none have been done.

What does not exist, and must not be described as if it did: the signing flow,
templates, PDF rendering, the audit record, customer accounts, object storage,
a background worker, an email provider, and Stripe.

- Pricing is static. Per the launch billing decision in `solution.md`, define the
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
- Still planned per `solution.md` and not started: a PDF/reminder worker,
  S3-compatible object storage, a transactional email provider, and error and
  uptime monitoring.
- Deployment is Docker Compose behind Caddy on a single VPS, never Vercel.
  `solution.md` recommends DigitalOcean; the box actually in use is a Linode
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
  interaction, or client hooks. Today that is seven files: `nav.tsx`,
  `flow.tsx` (`Flow` and `Steps`), `reveal.tsx`, `anim-host.tsx`,
  `waitlist.tsx`, `console/dashboard.tsx`, and `console/login/form.tsx`.
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

## When the product is built

- Store the final rendered agreement, signer information, consent, timestamps,
  delivery events, and a document hash as an immutable audit record.
- Rate-limit public signing endpoints and protect invite links with unguessable
  tokens.
- Enforce HTTPS and secure session cookies; keep PostgreSQL off the public
  network; keep secrets out of source control.
- Maintain nightly encrypted off-site database backups and test restores.

## Maintaining this file

- Add a rule only for durable architecture, exact commands, or repeated
  mistakes. Remove stale rules promptly.
- Keep this file under 10 KB.
