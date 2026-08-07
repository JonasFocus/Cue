# Cue documentation

Reference material. **None of it overrides the code** — live code,
configuration, migrations, and tests are always authoritative. If a document
disagrees with the repository, the repository is right and the document is a
bug.

| Document | What it answers |
| --- | --- |
| [`solution.md`](./solution.md) | Why Cue exists. Positioning, pricing, non-goals. The product brief. |
| [`architecture.md`](./architecture.md) | How it is built. Surfaces, the agreement engine, data model, request flows, deployment. |
| [`security.md`](./security.md) | Trust boundaries, the signing endpoint, record integrity, and the known gaps. |
| [`operations.md`](./operations.md) | Incident ownership, uptime and error-monitoring setup, and the recovery drill. |
| [`ideal-customer.md`](./ideal-customer.md) | Who it is for — a hypothesis, deliberately written to be falsified. |
| [`private-changelog.md`](./private-changelog.md) | Internal history. Decisions, reversals, accepted risks. Not published. |

## Not in here

- **[`AGENTS.md`](../AGENTS.md)** — the rules for changing the codebase, and the
  deployment runbook. It is instructions, not reference, so it stays at the root
  where every tool looks for it.
- **[`README.md`](../README.md)** — the front door: what is live, how to run it.
- **[`../animation-plans/`](../animation-plans/)** — per-change motion plans for
  the landing page.
- The **public changelog** is a Postgres table (`changelog`, migration 006),
  written by hand from `/console`. `private-changelog.md` is the internal one
  and is a different thing entirely.

## Keeping these honest

The failure mode for a docs folder is confident description of software that no
longer works that way. Two rules:

1. **Describe what is, not what is planned.** Unbuilt things belong in an
   explicit "not built" section, in the future tense, with the consequence
   spelled out.
2. **Update the doc in the same change as the code.** A doc corrected later is a
   doc that was wrong in between, and nobody knows which half they are reading.
