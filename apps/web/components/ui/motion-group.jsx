"use client";

import { useEffect, useRef } from "react";
import { animate, stagger } from "animejs";

import { cn } from "@/lib/utils";
import { MOTION, motionEnabled } from "@/lib/motion";

export function MotionGroup({
  children,
  className,
  itemSelector = "[data-motion-item]",
  delay = MOTION.stagger.slow,
}) {
  const scopeRef = useRef(null);

  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope || typeof window === "undefined") return undefined;

    const targets = scope.querySelectorAll(itemSelector);
    if (!targets.length) return undefined;

    if (!motionEnabled()) {
      return undefined;
    }

    const reveal = animate(targets, {
      opacity: [0, 1],
      translateY: [10, 0],
      translateX: [-2, 0],
      scale: [0.995, 1],
      filter: ["blur(2px)", "blur(0px)"],
      delay: stagger(delay, { start: MOTION.stagger.base }),
      duration: MOTION.durations.slow,
      ease: MOTION.easing.standard,
    });

    return () => {
      reveal.cancel();
    };
  }, [delay, itemSelector]);

  return (
    <div ref={scopeRef} className={cn(className)}>
      {children}
    </div>
  );
}
