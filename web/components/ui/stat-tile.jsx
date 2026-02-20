import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

const TREND_ICON = {
  up: "\u2191",
  down: "\u2193",
  flat: "\u2192",
};

const TREND_COLOR = {
  up: "text-success",
  down: "text-destructive",
  flat: "text-muted-foreground",
};

export function StatTile({ label, value, meta, className, onClick, href, loading, trend, delta, actionLabel }) {
  const interactive = Boolean(onClick || href);
  const Tag = href ? "a" : "div";
  const interactiveProps = href ? { href } : {};
  if (onClick) interactiveProps.onClick = onClick;

  if (loading) {
    return (
      <div className={cn("rounded-xl border bg-card p-3 text-card-foreground shadow-card", className)}>
        <Skeleton className="h-3 w-16 rounded-sm" />
        <Skeleton className="mt-2 h-6 w-20 rounded-sm" />
        <Skeleton className="mt-2 h-3 w-12 rounded-sm" />
      </div>
    );
  }

  return (
    <Tag
      className={cn(
        "rounded-xl border bg-card p-3 text-card-foreground shadow-card",
        interactive && "cursor-pointer transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        className,
      )}
      {...interactiveProps}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-xl font-semibold">{value}</span>
        {trend && TREND_ICON[trend] ? (
          <span className={cn("text-sm font-medium", TREND_COLOR[trend])}>
            {TREND_ICON[trend]}
            {delta ? ` ${delta}` : ""}
          </span>
        ) : null}
      </div>
      {meta ? <div className="mt-1 text-xs text-muted-foreground">{meta}</div> : null}
      {actionLabel ? <div className="mt-2 text-xs font-medium text-primary">{actionLabel}</div> : null}
    </Tag>
  );
}
