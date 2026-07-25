# 004 — Pause hero signing loop when off-screen

- **Status**: DONE
- **Commit**: 634fc30
- **Severity**: MEDIUM
- **Category**: Performance
- **Estimated scope**: `hero.tsx`, `design.css`

## Target

When `.cue-sign` leaves the viewport, add `.is-paused` and set
`animation-play-state: paused` on descendants. Resume when intersecting.
Respect existing reduced-motion freeze of the finished signed state.
