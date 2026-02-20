"use client";

import { useEffect, useRef } from "react";
import { animate, stagger } from "animejs";

import { MOTION, motionEnabled } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export function PageLoadingSkeleton({ className }) {
  const scopeRef = useRef(null);

  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope || !motionEnabled()) return undefined;

    const blocks = scope.querySelectorAll("[data-skeleton-item]");
    if (!blocks.length) return undefined;

    const entrance = animate(blocks, {
      opacity: [0, 1],
      scale: [0.98, 1],
      delay: stagger(MOTION.stagger.base),
      duration: MOTION.durations.base,
      ease: MOTION.easing.emphasized,
    });

    return () => {
      entrance.cancel();
    };
  }, []);

  return (
    <div ref={scopeRef} className={cn("space-y-4", className)}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Skeleton data-skeleton-item className="h-20 rounded-xl" />
        <Skeleton data-skeleton-item className="h-20 rounded-xl" />
        <Skeleton data-skeleton-item className="h-20 rounded-xl" />
      </div>

      <div className="space-y-3 rounded-xl border p-4">
        <Skeleton data-skeleton-item className="h-5 w-44" />
        <Skeleton data-skeleton-item className="h-9 w-full" />
        <Skeleton data-skeleton-item className="h-9 w-40" />
      </div>

      <div className="space-y-3 rounded-xl border p-4">
        <Skeleton data-skeleton-item className="h-5 w-52" />
        <Skeleton data-skeleton-item className="h-8 w-full" />
        <Skeleton data-skeleton-item className="h-8 w-full" />
        <Skeleton data-skeleton-item className="h-8 w-full" />
      </div>
    </div>
  );
}

