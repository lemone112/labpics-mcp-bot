"use client";

import { cn } from "@/lib/utils";
import { StatusChip } from "@/components/ui/status-chip";

export function InboxList({ items = [], className, onSelect = null }) {
  return (
    <div className={cn("space-y-2", className)}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="w-full rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-white p-2 text-left hover:bg-[var(--surface-soft)]"
          onClick={() => onSelect?.(item)}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-medium text-[var(--text-strong)]">{item.title}</div>
              {item.snippet ? (
                <div className="mt-1 max-h-10 overflow-hidden text-xs text-[var(--text-muted)]">{item.snippet}</div>
              ) : null}
            </div>
            <StatusChip status={item.status || "pending"} />
          </div>
          <div className="mt-1 text-xs text-[var(--text-subtle)]">{item.meta || ""}</div>
        </button>
      ))}
      {!items.length ? (
        <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border-subtle)] p-2 text-xs text-[var(--text-muted)]">
          Inbox is empty
        </div>
      ) : null}
    </div>
  );
}
