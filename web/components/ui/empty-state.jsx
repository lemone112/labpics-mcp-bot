"use client";

import { cn } from "@/lib/utils";

export function EmptyState({ title, description, actions, className }) {
  return (
    <div
      className={cn(
        "app-inset rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] p-5",
        className
      )}
    >
      <h3 className="text-sm font-semibold text-[var(--text-strong)]">{title}</h3>
      {description ? <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">{description}</p> : null}
      {actions ? <div className="mt-4 flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
