"use client";

import { cn } from "@/lib/utils";

export function EmptyState({ title = "No data yet", description = "", actions = null, className }) {
  return (
    <div
      className={cn(
        "app-inset border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] p-4 text-center",
        className
      )}
    >
      <div className="text-sm font-medium text-[var(--text-strong)]">{title}</div>
      {description ? <p className="mt-1 text-sm text-[var(--text-muted)]">{description}</p> : null}
      {actions ? <div className="mt-3 flex justify-center gap-2">{actions}</div> : null}
    </div>
  );
}
