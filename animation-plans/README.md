# Cue landing — animation plans

Audit: `improve-animations` (standard, marketing landing) + `better-ui` performance.
Latest commit stamp: `634fc30`. Bar: [emilkowal.ski](https://emilkowal.ski/) + `improve-animations` AUDIT.md.

## Recommended order

| # | Plan | Status | Severity | Depends on |
| --- | --- | --- | --- | --- |
| 1 | [001-steps-rail-composited](001-steps-rail-composited.md) | DONE | HIGH | — |
| 2 | [002-mock-progress-transform](002-mock-progress-transform.md) | DONE | HIGH | — |
| 3 | [003-reveal-and-hero-tuning](003-reveal-and-hero-tuning.md) | DONE | MEDIUM | — |
| 4 | [004-pause-offscreen-hero-loop](004-pause-offscreen-hero-loop.md) | DONE | MEDIUM | — |

## Findings table (vetted)

| # | Severity | Category | Location | Finding | Fix summary |
| --- | --- | --- | --- | --- | --- |
| 1 | HIGH | Performance | `flow.tsx` Steps + `design.css` rail | Scroll drives React state every frame and animates `height` (layout) | Drive fill via ref + `scaleY`; set `data-active` on DOM |
| 2 | HIGH | Performance | `design.css` `.cue-mock-progress i` | `cueFill` keyframes animate `width` | Switch to `transform: scaleX(...)` |
| 3 | MEDIUM | Easing & duration | `.cue-reveal`, hero `cueRise` | 700–800ms / 20–22px travel feels heavy on a crisp site | 480–560ms, ~14px, stronger ease-out token |
| 4 | MEDIUM | Performance | `.cue-sign` infinite loops | Hero timeline keeps compositing when scrolled away | Pause with `animation-play-state` via IntersectionObserver |
| 5 | LOW | Physicality | `.cue-btn:active` | Press scale `0.97` (fine) vs better-ui `0.96` | Align to `0.96` |

## Missed opportunities (not in this pass)

- Testimonials quote swap teleports with no crossfade.
- Flow tab panel remounts via `key={active}` — fine for light cards; revisit if mocks get heavier.
