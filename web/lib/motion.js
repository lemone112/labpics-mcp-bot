export const MOTION = {
  durations: {
    micro: 120,
    fast: 220,
    base: 320,
    slow: 420,
  },
  easing: {
    standard: "outQuad",
    emphasized: "outCubic",
  },
  stagger: {
    fast: 30,
    base: 45,
    slow: 70,
  },
};

export function motionEnabled() {
  if (typeof window === "undefined") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
