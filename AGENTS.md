<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Cue Engineering Guide

## Scope

- Cue is a client agreement and electronic-signing service for photographers and
  videographers, deployed at `cue.krevo.io`. It is a Krevo product but a separate
  codebase from the main Krevo application.
- [`solution.md`](./solution.md) is the product spec: positioning, copy, pricing,
  architecture, and non-goals. Read it before changing product surface or copy.
- Live code, configuration, and tests are authoritative. Keep tasks focused and
  preserve unrelated working-tree changes.
- Do not commit, push, open a PR, or deploy unless asked.

## Product truth

- The customer-facing object is **a Cue**. The primary call to action is
  **"Create your first Cue"**. The core line is
  **"Send the Cue. Get the yes. Keep the record."**
- Market only what works. The landing page currently ships ahead of the product,
  so every CTA must collect interest rather than imply a working signup.
- Cue is deliberately **not** a form builder, studio-management platform,
  payment product, or invoicing tool. Reject scope that drifts toward those.
- Cue is not a law firm and gives no legal advice. Keep that disclaimer in the
  footer and avoid claiming legal enforceability beyond the audit record.

## Current state

- **Only the marketing landing page exists.** There is no auth, no database, no
  signing flow, and no Stripe. `src/app/page.tsx` composes the whole site.
- Testimonials in `src/components/testimonials.tsx` are **clearly labelled
  placeholders**. Replace them with sourced, attributable quotes from real early
  users, or delete the section, before the public launch. Never present invented
  quotes as real.
- Pricing is static. Per the launch billing decision in `solution.md`, define the
  Free, Creator, and Studio plans in the product but **do not wire Stripe for
  version one**.

## Runtime and stack

- Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS 4, Node.js
  runtime. Do not introduce Edge runtime assumptions.
- `next/font` supplies Geist (headings) and Inter (body). Do not add font
  packages; the CSS reads `--font-geist` and `--font-inter`.
- `lucide-react` is the only icon dependency.
- Planned additions per `solution.md`, none of which exist yet: Better Auth,
  PostgreSQL, Redis, a PDF/reminder worker, S3-compatible storage, and a
  transactional email provider. Deployment target is a single DigitalOcean VPS
  behind Caddy, not Vercel.

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
  interaction, or client hooks. Today that is `Nav`, `Flow`, `Steps`,
  `Testimonials`, and `Reveal`.
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
npm run build
```

There is no test suite yet. Add one with the first piece of real logic; the
signing, PDF, and audit paths must not ship untested.

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
