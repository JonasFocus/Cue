# 005 — Features tiles: light brand mock + cohesive card motion

- **Status**: DONE (implemented with the visual pass)
- **Severity**: MEDIUM
- **Category**: Cohesion & tokens / Easing & duration / Accessibility
- **Commit stamp**: working tree (post-copy + mock rematch)

## Finding

The Features bottom row mixed a dark “brand” mock into a light marketing page, and the six modules didn’t share one surface language (plain cards vs bare tint wells). Enter motion revealed whole grids at once with no stagger.

## What shipped

| Area | Change |
| --- | --- |
| `MockBrand` | Light header (`#fff` → `--cue-tint-soft`), ink text, accent mark only |
| Bottom tiles | Wrapped in `.cue-feature-tile` — same border/shadow/radius as top cards |
| Icons | `.cue-feature-icon` — tint fill + accent glyph |
| Hover | `translateY(-3px)`, 200ms `--cue-ease`, gated `@media (hover: hover) and (pointer: fine)` |
| Enter | `.cue-reveal-stagger` — children `12px` / 420ms / 80ms stagger; reduced-motion nukes movement |
| Mock cards | Layered shadow + `oklch(0 0 0 / 0.06)` outline |

## Feel-check

1. Scroll Features into view — top row then bottom row stagger left→right.
2. Hover a tile on desktop — soft lift, no delay after stagger finishes.
3. Enable reduced motion — tiles appear, no travel, no hover transform needed.
4. Confirm “Feels like you” mock reads as light-mode studio branding, not a dark card.
