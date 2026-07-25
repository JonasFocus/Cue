# Cue

Client agreements and electronic signing for photographers and videographers.
A Krevo product. The only host that resolves today is
`staging.cue.krevo.io`; `cue.krevo.io` is the intended production domain and
has no DNS record yet.

**Current state:** the marketing site and its waitlist are live. The signing
product itself is not built — no customer accounts, no templates, no PDFs, no
email, no Stripe. `/console` is an operator-only ops surface with signup
disabled.

## Read first

- [`AGENTS.md`](./AGENTS.md) — engineering guide: stack, conventions, deployment.
- [`solution.md`](./solution.md) — product spec: positioning, pricing, non-goals.

Those two, plus the code, configuration, migrations, and tests, are
authoritative. This file is a pointer.

## Local development

```bash
npm install
npm run dev      # http://localhost:3000
```

The page renders without a database. The waitlist form and `/console` need
`DATABASE_URL`, `REDIS_URL`, `BETTER_AUTH_SECRET`, and `IP_SALT` — see
[`.env.example`](./.env.example). Secrets are generated on the server, never
committed.

## Checks

```bash
npm run lint
npx tsc --noEmit
npm test          # node:test, no framework
```

## Deploying

Docker Compose behind Caddy on a single VPS — not Vercel. `npm run ship` runs
the checks, commits, pushes, and deploys to staging. See the Deployment section
of [`AGENTS.md`](./AGENTS.md) for what it touches and how migrations are applied.

## Rebuilding from an empty database

Migrations create the schema but not the operator account. See the
"Rebuilding from nothing" runbook in [`AGENTS.md`](./AGENTS.md) — without that
step `/console` renders a login that nobody can pass.
