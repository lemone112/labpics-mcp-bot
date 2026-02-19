# Motion Guidelines

> Normative. All animations must comply. No exceptions.
>
> Sources: Apple HIG, Microsoft Fluent 2, Material Design 3, Linear, Shopify Polaris.
>
> Engine: **Anime.js** (single motion library). Tokens: `web/lib/motion.js`.

---

## 1) Principles

1. **Motion supports comprehension and feedback.** Every animation must communicate something: a state change, a spatial relationship, or a confirmation.
2. **Motion must not delay interaction.** Users must never wait for an animation to complete before they can act.
3. **Motion must not cause layout shifts.** Animate `transform` and `opacity` only (GPU-accelerated). Never animate `width`, `height`, `margin`, `padding`, or `top`/`left`.
4. **Reduced-motion users get instant equivalents.** All animations must be wrapped in `motionEnabled()` check or respect the global CSS `prefers-reduced-motion: reduce` rule.

---

## 2) Duration tokens

Defined in `web/lib/motion.js`. All durations must reference these tokens.

| Token | Value | Usage |
|-------|-------|-------|
| `MOTION.durations.micro` | 120ms | Button press, toggle, checkbox, switch |
| `MOTION.durations.fast` | 220ms | Tooltip show/hide, dropdown open, hover effects, micro-feedback |
| `MOTION.durations.base` | 320ms | Sheet/drawer slide, dialog enter, card expand, tab switch |
| `MOTION.durations.slow` | 420ms | Page section reveal, staggered list entrance |

### Duration rules

1. **Never exceed 420ms** for any single animation in the dashboard.
2. **Desktop animations** should bias toward `micro` (120ms) and `fast` (220ms). Reserve `base` (320ms) for panel transitions.
3. **Enter animations are slightly longer than exit** (enter: `base`, exit: `fast`). This is perceptually natural.
4. **Never hardcode duration values.** Always use `MOTION.durations.*` tokens.
5. Design audit script catches `duration: <number>` literals — use tokens.

---

## 3) Easing tokens

Defined in `web/lib/motion.js`. All easing must reference these tokens.

| Token | Value | Curve | Usage |
|-------|-------|-------|-------|
| `MOTION.easing.standard` | `outQuad` | Decelerate | Default for **entrances** (element appearing, panel opening) |
| `MOTION.easing.emphasized` | `outCubic` | Strong decelerate | **Emphasized entrances** (modal appear, important state change) |

### Easing rules

1. **Entrances**: use `standard` (outQuad) or `emphasized` (outCubic). Fast start, slow end.
2. **Exits**: use `inQuad` or instant removal. Slow start, fast end.
3. **State changes** (toggle, switch): use `standard`.
4. **Never use `linear`** for UI transitions. Linear easing feels robotic.
5. **Never hardcode easing strings.** Always use `MOTION.easing.*` tokens.
6. Design audit script catches `ease: "<string>"` literals — use tokens.

---

## 4) Stagger tokens

For revealing lists and groups of elements sequentially.

| Token | Value | Usage |
|-------|-------|-------|
| `MOTION.stagger.fast` | 30ms | Dense lists (>10 items), table rows |
| `MOTION.stagger.base` | 45ms | Standard lists (5-10 items), card grids |
| `MOTION.stagger.slow` | 70ms | Hero sections, onboarding steps (2-5 items) |

### Stagger rules

1. **Max 3 animated elements in immediate sequence** for one user interaction.
2. **Total stagger duration** should not exceed 420ms (e.g., 6 items x 70ms = 420ms max).
3. For lists > 10 items, only animate the first 10; remaining items appear instantly.

---

## 5) Per-interaction specification

| Interaction | Duration | Easing | Properties | Notes |
|-------------|----------|--------|------------|-------|
| Button press | `micro` (120ms) | `standard` | `scale: [1, 0.97, 1]` | Subtle press feedback |
| Toggle/Switch | `micro` (120ms) | `standard` | `translateX` on thumb | Match Radix state |
| Tooltip show | `fast` (220ms) | `standard` | `opacity: [0,1]`, `translateY: [4,0]` | Fade + slight slide up |
| Tooltip hide | `micro` (120ms) | `inQuad` | `opacity: [1,0]` | Fast exit |
| Dropdown open | `fast` (220ms) | `standard` | `opacity: [0,1]`, `scale: [0.95,1]` | Via tailwindcss-animate |
| Dropdown close | `micro` (120ms) | `inQuad` | `opacity: [1,0]`, `scale: [1,0.95]` | Via tailwindcss-animate |
| Sheet/Drawer enter | `base` (320ms) | `emphasized` | `translateX: [100%,0]` (right) | Side panel slide in |
| Sheet/Drawer exit | `fast` (220ms) | `inQuad` | `translateX: [0,100%]` | Faster exit |
| Dialog enter | `base` (320ms) | `emphasized` | `opacity: [0,1]`, `scale: [0.95,1]` | Zoom + fade |
| Dialog exit | `fast` (220ms) | `inQuad` | `opacity: [1,0]`, `scale: [1,0.95]` | Faster exit |
| Overlay backdrop | `base` (320ms) | `standard` | `opacity: [0,1]` | Sync with dialog/sheet |
| Page section reveal | `slow` (420ms) | `standard` | `opacity: [0,1]`, `translateY: [16,0]` | Staggered via MotionGroup |
| Card grid reveal | `base` (320ms) | `standard` | `opacity: [0,1]`, `translateY: [8,0]` | Stagger `base` (45ms) |
| List item reveal | `base` (320ms) | `standard` | `opacity: [0,1]`, `translateY: [8,0]` | Stagger `fast` (30ms), max 10 items |
| Toast enter | `fast` (220ms) | `standard` | `opacity: [0,1]`, `translateY: [16,0]` | Bottom-center position |
| Toast exit | `fast` (220ms) | `inQuad` | `opacity: [1,0]`, `translateY: [0,-8]` | Slide up + fade |
| Skeleton pulse | `slow * 2` (840ms) | `standard` | `opacity: [0.5,1]` | Infinite loop, subtle |
| Tab content switch | `fast` (220ms) | `standard` | `opacity: [0,1]` | Cross-fade, no slide |

---

## 6) Where motion is required

- Feedback after critical user actions (submit, approve, status changes)
- Progressive reveal for page sections and dense lists (via `MotionGroup`)
- Controlled transitions for drawers/modals/sheets
- Toast notifications (enter + auto-dismiss exit)
- Skeleton loading pulse

---

## 7) Where motion is forbidden

- Decorative looping animations on data tables or forms
- Aggressive entrance motion that delays reading
- Rapid repetitive animation that distracts from workflows
- Motion that causes content/layout jumps (CLS)
- Animations on scroll (parallax, scroll-triggered reveals) — too distracting for tool UI
- Auto-playing animations that are not user-initiated

---

## 8) Animation budget per view

| Metric | Limit |
|--------|-------|
| Max simultaneous animations | 3 |
| Max total animation time per page load | 800ms |
| Max sequential chain length | 2 animations |
| Max animated elements on page load | 10 (staggered), rest instant |
| Max animation duration for any single element | 420ms |

---

## 9) Reduced motion

### CSS (global, in `globals.css`)

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

### JavaScript (per-component)

```javascript
import { motionEnabled } from "@/lib/motion";

// Always check before animating
if (motionEnabled()) {
  anime({ /* ... */ });
}
```

### Rules

1. Every `anime()` call must be gated by `motionEnabled()`.
2. The CSS global rule is a safety net, not a replacement for JS checks.
3. ~18% of users enable reduced motion (Apple data). This is not edge-case.
4. Reduced motion must result in **instant state changes** (opacity: 1, no transform), not hidden content.

---

## 10) Related documents

- Design system: [`DESIGN_SYSTEM_2026.md`](./DESIGN_SYSTEM_2026.md)
- Motion tokens: `web/lib/motion.js`
- Quality gates: [`QUALITY_GATES_UI.md`](./QUALITY_GATES_UI.md)
