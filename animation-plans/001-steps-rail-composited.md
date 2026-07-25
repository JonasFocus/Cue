# 001 — Composite the scroll-linked steps rail

- **Status**: DONE
- **Commit**: 634fc30
- **Severity**: HIGH
- **Category**: Performance
- **Estimated scope**: 2 files (`flow.tsx`, `design.css`)

## Problem

`Steps` called `setProgress` on every scroll rAF, re-rendering three mock visuals, and the fill used `height` (layout thrashing):

```tsx
// src/components/flow.tsx — prior
const [progress, setProgress] = useState(0);
// …
style={{ height: `${progress * 100}%` }}
```

```css
/* src/app/design.css — prior */
.cue-steps-rail-fill {
  transition: height 120ms linear;
}
```

## Target

- Progress written directly to the fill via `transform: scaleY(p)` with `transform-origin: top`.
- `data-active` toggled on step nodes via the DOM (no React state for scroll).
- No `height`/`width` transitions on the rail.
