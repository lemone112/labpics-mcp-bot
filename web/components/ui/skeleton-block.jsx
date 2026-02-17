"use client";

import { cn } from "@/lib/utils";

export function SkeletonBlock({ className, lines = 3 }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, idx) => (
        <div
          key={idx}
          className={cn(
            "h-3 animate-pulse rounded-[var(--radius-sm)] bg-[var(--surface-3)]",
            idx === lines - 1 ? "w-2/3" : "w-full"
          )}
        />
      ))}
    </div>
  );
}
