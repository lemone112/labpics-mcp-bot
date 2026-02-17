# Motion Guidelines

Use Anime.js with tokenized durations/easing from `web/lib/motion.js`.

## Principles

1. Motion supports comprehension and feedback.
2. Motion must not hide data or slow critical workflows.
3. Reduced-motion users must get non-animated equivalents.

## Allowed patterns

- list reveal / page section reveal
- modal/drawer enter-exit
- state transition feedback (job status, signal accepted, digest generated)

## Disallowed patterns

- random animation timing per page
- high-frequency pulse/blink effects
- layout-shifting transforms that create CLS-like visual jumps

## Budget

- max 420ms for standard transitions
- max 220ms for micro feedback
- no more than 3 animated elements in immediate sequence
