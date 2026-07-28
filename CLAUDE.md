# Cue

Cue is a client agreement and electronic-signing service for photographers and
videographers, shipping as a Krevo subdomain at `cue.krevo.io`.

It is a working application: creators sign in at `/app`, build an agreement from
a template, and send a link; their client signs at `/s/[token]` without an
account, and the record seals. `/console` is the operator's separate ops surface.

`cue.krevo.io` is **production**, on Vercel since 2026-07-28. There is no
separate staging environment: a push to `main` is a release.

## Where things are

- [`AGENTS.md`](./AGENTS.md) — engineering and product rules, and the deployment
  runbook. **Read this before changing anything.**
- `CLAUDE.local.md` — gitignored, machine-specific: how to reach production and
  what to check first when the site appears to be down.
- [`docs/`](./docs/README.md) — reference: the product brief
  ([`solution.md`](./docs/solution.md)), [`architecture.md`](./docs/architecture.md),
  [`security.md`](./docs/security.md), [`ideal-customer.md`](./docs/ideal-customer.md),
  and the internal [`private-changelog.md`](./docs/private-changelog.md).

Live code, configuration, migrations, and tests are authoritative. Where a
document disagrees with them, the document is the bug.

## The one thing to understand first

The agreement engine in `src/lib/`. A template is a question spec plus
conditional clauses, so adding a shoot type is data in `templates.ts` — not a
new form, route, or component. `agreement.ts` and `cue.ts` are pure and their
tests are the specification; `cue-db.ts` is the I/O that applies them.

What a creator may still change after a client has signed is the one rule that
must not be got wrong. It lives in `cue.ts`, tested in `cue.test.ts`.

Keep this file lean. Do not copy release history, architecture detail, or
tool-specific workflow rules back into it — they have homes above.
