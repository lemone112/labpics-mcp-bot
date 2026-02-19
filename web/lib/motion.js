import { useState, useEffect } from "react";

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

/**
 * React hook that reactively tracks `prefers-reduced-motion: reduce`.
 * Returns `true` when the user prefers reduced motion.
 */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mql.matches);
    const onChange = (e) => setReduced(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
