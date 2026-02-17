"use client";

import { cn } from "@/lib/utils";

export function EmptyState({ title = "No data yet", description = "", actions = null, className }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed bg-muted/40 p-6 text-center",
        className
      )}
    >
      <div className="text-sm font-medium">{title}</div>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      {actions ? <div className="mt-3 flex justify-center gap-2">{actions}</div> : null}
    </div>
  );
}
