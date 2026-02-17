import { cn } from "@/lib/utils";

export function StatTile({ label, value, meta, className }) {
  return (
    <div className={cn("app-inset border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-3", className)}>
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 text-xl font-semibold text-[var(--text-strong)]">{value}</div>
      {meta ? <div className="mt-1 text-xs text-[var(--text-subtle)]">{meta}</div> : null}
    </div>
  );
}
