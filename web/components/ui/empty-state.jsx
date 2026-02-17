"use client";

import { cn } from "@/lib/utils";

export function EmptyState({ title = "Данных пока нет", description = "", actions = null, className }) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-muted/30 px-6 py-8 text-center",
        className
      )}
    >
      <div className="text-sm font-medium text-foreground">{title}</div>
      {description ? <p className="mt-1.5 text-sm text-muted-foreground">{description}</p> : null}
      {actions ? <div className="mt-4 flex justify-center gap-2">{actions}</div> : null}
    </div>
  );
}
