# 002 — Mock progress bar uses transform, not width

- **Status**: DONE
- **Commit**: 634fc30
- **Severity**: HIGH
- **Category**: Performance
- **Estimated scope**: 2 files (`design.css`, `mock.tsx`)

## Problem

```css
@keyframes cueFill {
  0% { width: 8%; }
  70% { width: 92%; }
}
```

Animating `width` forces layout on every frame of the looping mock.

## Target

```css
.cue-mock-progress i {
  width: 100%;
  transform: scaleX(0.08);
  transform-origin: left center;
  animation: cueFill 4.5s var(--cue-ease) infinite;
}
@keyframes cueFill {
  0% { transform: scaleX(0.08); }
  70%, 100% { transform: scaleX(0.92); }
}
```

Static bars use `transform: scaleX(0.6)` instead of `width: 60%`.
