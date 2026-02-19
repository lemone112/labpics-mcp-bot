"use client";

import { useEffect, useRef } from "react";
import { animate } from "animejs";
import { MOTION, motionEnabled } from "@/lib/motion";
import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current || !motionEnabled()) return;

    const anim = animate(ref.current, {
      opacity: [0.5, 1],
      duration: MOTION.durations.slow * 2,
      ease: MOTION.easing.standard,
      direction: "alternate",
      loop: true,
    });

    return () => anim.cancel();
  }, []);

  return (
    <div
      ref={ref}
      className={cn("rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
