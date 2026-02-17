import { cn } from "@/lib/utils";

export function StatTile({ label, value, meta, className }) {
  return (
    <div className={cn("rounded-lg border bg-card p-3 text-card-foreground", className)}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      {meta ? <div className="mt-1 text-xs text-muted-foreground">{meta}</div> : null}
    </div>
  );
}
