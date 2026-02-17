"use client";

import { cn } from "@/lib/utils";
import { StatusChip } from "@/components/ui/status-chip";

export function Kanban({ columns = [], className }) {
  return (
    <div className={cn("grid grid-cols-1 gap-3 lg:grid-cols-4", className)}>
      {columns.map((column) => (
        <section
          key={column.id}
          className="app-inset border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-3"
        >
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-medium text-[var(--text-strong)]">{column.title}</h4>
            <span className="text-xs text-[var(--text-muted)]">{column.items?.length || 0}</span>
          </div>
          <div className="space-y-2">
            {(column.items || []).map((item) => (
              <div
                key={item.id}
                className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-white p-2"
              >
                <div className="text-sm font-medium text-[var(--text-strong)]">{item.title}</div>
                {item.subtitle ? (
                  <div className="mt-1 text-xs text-[var(--text-muted)]">{item.subtitle}</div>
                ) : null}
                <div className="mt-2 flex items-center justify-between">
                  <StatusChip status={item.status || column.id} />
                  {item.meta ? <span className="text-xs text-[var(--text-subtle)]">{item.meta}</span> : null}
                </div>
              </div>
            ))}
            {!column.items?.length ? (
              <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border-subtle)] p-2 text-xs text-[var(--text-muted)]">
                No items
              </div>
            ) : null}
          </div>
        </section>
      ))}
    </div>
  );
}
