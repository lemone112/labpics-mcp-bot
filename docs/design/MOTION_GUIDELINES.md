# Motion Guidelines

Use Anime.js with tokenized durations/easing from `apps/web/lib/motion.js`.

## Principles

1. Motion supports comprehension and feedback — never decoration.
2. Motion must not hide data or slow critical workflows.
3. Reduced-motion users must get non-animated equivalents.
4. Every animation must have a clear purpose (entrance, feedback, state change).

## Token reference (`apps/web/lib/motion.js`)

| Token                  | Value  | Usage                              |
| ---------------------- | ------ | ---------------------------------- |
| `MOTION.durations.micro` | 120ms  | Micro feedback (hover, focus)      |
| `MOTION.durations.fast`  | 220ms  | Quick transitions (sidebar, tabs)  |
| `MOTION.durations.base`  | 320ms  | Standard reveals (page skeletons)  |
| `MOTION.durations.slow`  | 420ms  | Emphasized transitions (sheet, modal) |
| `MOTION.easing.standard`    | outQuad  | Default easing                  |
| `MOTION.easing.emphasized`  | outCubic | Skeleton/loading reveals        |
| `MOTION.stagger.fast`   | 30ms   | Dense lists (table rows)           |
| `MOTION.stagger.base`   | 45ms   | Card grids, skeleton blocks        |
| `MOTION.stagger.slow`   | 70ms   | Hero sections, dashboard cards     |

## Motion-enabled check

- `motionEnabled()` — returns `false` when `prefers-reduced-motion: reduce` is active.
- `useReducedMotion()` — React hook that reactively tracks the media query.
- CSS global rule in `globals.css` zeroes all `animation-duration` and `transition-duration` for reduced-motion users.

All three layers must be respected. JS animations use `motionEnabled()`. CSS animations are handled by the global rule.

## Allowed patterns

| Pattern                  | Duration     | Easing     | Notes                          |
| ------------------------ | ------------ | ---------- | ------------------------------ |
| List/card reveal         | slow (420ms) | standard   | Staggered via `MotionGroup`    |
| Page skeleton entrance   | base (320ms) | emphasized | Scale + opacity                |
| Skeleton shimmer         | slow×2 (840ms) | standard | Looping opacity alternate      |
| Modal/drawer enter-exit  | slow (420ms) | CSS ease-in-out | Radix `animate-in`/`animate-out` |
| State transition feedback | fast (220ms) | standard  | Job status, signal accepted    |
| Sidebar collapse/expand  | fast (220ms) | CSS ease-out | Width + position transition   |

## Disallowed patterns

- Random animation timing per page.
- High-frequency pulse/blink effects.
- Layout-shifting transforms that create CLS-like visual jumps.
- Parallax or scroll-hijacking effects.
- Auto-playing video/GIF backgrounds.
- Infinite looping (except skeleton shimmer).

## Budget

- Max **420ms** for standard transitions.
- Max **220ms** for micro feedback.
- No more than **3 animated elements** in immediate sequence without stagger.
- Total stagger cascade must not exceed **1200ms** (e.g., 16 cards × 70ms = 1120ms).

## Implementation

### MotionGroup component

Wrap a section in `<MotionGroup>` and mark children with `data-motion-item`:

```jsx
<MotionGroup>
  <Card data-motion-item>...</Card>
  <Card data-motion-item>...</Card>
</MotionGroup>
```

The component auto-discovers `[data-motion-item]` elements and applies staggered reveal. Skips entirely when `motionEnabled()` returns `false`.

### Direct anime.js usage

For custom animations, always guard with `motionEnabled()`:

```js
import { animate } from "animejs";
import { MOTION, motionEnabled } from "@/lib/motion";

useEffect(() => {
  if (!motionEnabled()) return;
  const anim = animate(ref.current, {
    opacity: [0, 1],
    duration: MOTION.durations.base,
    ease: MOTION.easing.standard,
  });
  return () => anim.cancel();
}, []);
```

### CSS transitions (Radix/Tailwind)

Radix primitives (Sheet, Dialog) use Tailwind's `animate-in`/`animate-out` with `duration-[420ms]`. The `globals.css` reduced-motion rule handles these automatically.

## Architecture

| Layer          | File                              | Role                              |
| -------------- | --------------------------------- | --------------------------------- |
| Tokens         | `apps/web/lib/motion.js`          | Duration/easing/stagger constants |
| Utility        | `motionEnabled()`                 | Runtime prefers-reduced-motion check |
| React hook     | `useReducedMotion()`              | Reactive reduced-motion tracking  |
| Wrapper        | `components/ui/motion-group.jsx`  | Staggered card/list reveal        |
| Skeleton       | `components/ui/skeleton.jsx`      | Shimmer animation                 |
| Page skeleton  | `components/ui/page-loading-skeleton.jsx` | Skeleton entrance animation |
| CSS fallback   | `app/globals.css`                 | `@media (prefers-reduced-motion)` |
