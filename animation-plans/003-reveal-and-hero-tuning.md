# 003 — Snappier reveal + hero enter

- **Status**: DONE
- **Commit**: 634fc30
- **Severity**: MEDIUM
- **Category**: Easing & duration / Cohesion
- **Estimated scope**: `design.css`, `hero.tsx`, `reveal.tsx`

## Target

- `--cue-ease: cubic-bezier(0.23, 1, 0.32, 1)` (AUDIT strong ease-out).
- Reveal: `translateY(14px)`, `480ms`.
- Hero rise: `560ms` with existing stagger.
- Press: `scale(0.96)`.
- Reveal briefly sets `will-change: transform, opacity` then clears after transition.
