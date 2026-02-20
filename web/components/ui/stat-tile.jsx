import { cn } from "@/lib/utils";

export function StatTile({ label, value, meta, className, onClick, href }) {
  const interactive = Boolean(onClick || href);
  const Tag = href ? "a" : "div";
  const interactiveProps = href ? { href } : {};
  if (onClick) interactiveProps.onClick = onClick;

  return (
    <Tag
      className={cn(
        "rounded-xl border bg-card p-3 text-card-foreground shadow-card",
        interactive && "cursor-pointer transition-colors hover:bg-accent/50",
        className,
      )}
      {...interactiveProps}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      {meta ? <div className="mt-1 text-xs text-muted-foreground">{meta}</div> : null}
    </Tag>
  );
}
