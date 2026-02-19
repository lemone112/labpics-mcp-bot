"use client";

import { cn } from "@/lib/utils";

export function EmptyState({
  title = "Данных пока нет",
  description = "",
  actions = null,
  reason,
  steps,
  primaryAction,
  secondaryAction,
  className,
}) {
  const isWizard = Boolean(reason || steps);

  if (isWizard) {
    return (
      <div
        data-testid="empty-wizard"
        className={cn("rounded-xl border bg-muted/30 px-6 py-8", className)}
      >
        <div className="text-sm font-medium text-foreground">{title}</div>
        {reason ? (
          <p className="mt-1.5 text-sm text-muted-foreground">{reason}</p>
        ) : null}
        {Array.isArray(steps) && steps.length ? (
          <ol className="mt-4 space-y-1.5 text-left text-sm text-muted-foreground">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        ) : null}
        {primaryAction || secondaryAction ? (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {primaryAction}
            {secondaryAction}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border bg-muted/30 px-6 py-8 text-center",
        className
      )}
    >
      <div className="text-sm font-medium text-foreground">{title}</div>
      {description ? (
        <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
      ) : null}
      {actions ? (
        <div className="mt-4 flex justify-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
