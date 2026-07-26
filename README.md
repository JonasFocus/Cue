<p align="center">
  <a href="https://staging.cue.krevo.io">
    <img src="./public/readme-hero.svg" alt="Cue. Send the Cue. Get the yes. Keep the record." width="100%" />
  </a>
</p>

<p align="center">
  <a href="https://staging.cue.krevo.io"><strong>Visit staging</strong></a>
  &nbsp;·&nbsp;
  <a href="./solution.md"><strong>Read the product brief</strong></a>
  &nbsp;·&nbsp;
  <a href="./AGENTS.md"><strong>Engineering guide</strong></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-pre--launch-8B7CF6?style=flat-square&labelColor=11131D" alt="Pre-launch" />
  <img src="https://img.shields.io/badge/Next.js-16-11131D?style=flat-square&logo=nextdotjs&logoColor=white" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="Strict TypeScript" />
  <img src="https://img.shields.io/badge/self--hosted-Docker-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Self-hosted with Docker" />
</p>

<br />

> **Cue is a pre-launch client-agreement product for photographers and videographers.**
> It will help creatives prepare, send, sign, and keep the record of their client agreements without the weight of a general-purpose business platform.

## What is live

| Surface | Status |
| --- | --- |
| Marketing site | Live on [staging.cue.krevo.io](https://staging.cue.krevo.io) |
| Waitlist | Live, validated, deduplicated, and rate-limited |
| Operator console | Private operations surface for waitlist and service health |
| Signing product | Not built yet |

Cue does not yet have customer accounts, templates, signing, PDFs, email delivery, object storage, or billing. The public site only promises what works today.

## Run it locally

```bash
npm install
npm run dev
```

The landing page renders without services. The waitlist and private console need the server configuration described in [`.env.example`](./.env.example). Keep secrets out of the repository.

## The stack

```text
Next.js 16 + React 19 + TypeScript
PostgreSQL 17 + Redis 7 + Better Auth
Docker Compose + Caddy + a single VPS
```

The app is intentionally self-hosted. PostgreSQL and Redis stay on the internal Docker network; Caddy terminates HTTPS and proxies only the web application.

## Quality gate

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

## Ship to staging

```bash
npm run ship "feat: describe the change"
```

That command verifies, commits, pushes, and deploys `main` to staging. Run it only with a clean working tree and a focused commit scope.

## Source of truth

- [`AGENTS.md`](./AGENTS.md) defines product boundaries, engineering conventions, and deployment safety.
- [`solution.md`](./solution.md) defines positioning, product direction, pricing, and non-goals.
- The application, migrations, and tests are authoritative for current behavior.

<p align="center">
  <sub>Built with focus by <a href="https://krevo.io">Krevo</a>.</sub>
</p>
