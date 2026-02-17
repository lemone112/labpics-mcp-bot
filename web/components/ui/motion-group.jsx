"use client";

import { useEffect, useRef } from "react";
import { animate, stagger } from "animejs";

import { cn } from "@/lib/utils";

export function MotionGroup({
  children,
  className,
  itemSelector = "[data-motion-item]",
  delay = 80,
}) {
  const scopeRef = useRef(null);

  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope || typeof window === "undefined") return undefined;

    const targets = scope.querySelectorAll(itemSelector);
    if (!targets.length) return undefined;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return undefined;
    }

    const reveal = animate(targets, {
      opacity: [0, 1],
      translateY: [14, 0],
      scale: [0.99, 1],
      delay: stagger(delay, { start: 40 }),
      duration: 720,
      ease: "outExpo",
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
