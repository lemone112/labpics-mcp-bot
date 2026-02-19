"use client";

import { cn } from "@/lib/utils";
import { StatusChip } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";

export function Kanban({ columns = [], className }) {
  return (
    <div className={cn("grid grid-cols-1 gap-3 lg:grid-cols-4", className)}>
      {columns.map((column) => (
        <section key={column.id} className="rounded-lg border bg-muted/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-medium">{column.title}</h4>
            <span className="text-xs text-muted-foreground">{column.items?.length || 0}</span>
          </div>
          <div className="space-y-2">
            {(column.items || []).map((item) => (
              <div key={item.id} className="rounded-md border bg-card p-2">
                <div className="text-sm font-medium">{item.title}</div>
                {item.subtitle ? <div className="mt-1 text-xs text-muted-foreground">{item.subtitle}</div> : null}
                <div className="mt-2 flex items-center justify-between">
                  <StatusChip status={item.status || column.id} />
                  {item.meta ? <span className="text-xs text-muted-foreground">{item.meta}</span> : null}
                </div>
              </div>
            ))}

            {!column.items?.length ? (
              <EmptyState
                data-testid="empty-wizard"
                title="Нет элементов"
                reason="В этой колонке пока нет карточек."
                steps={["Создайте карточку", "Перетащите в колонку", "Обновите статус"]}
                primaryAction={
                  <a
                    className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
                    href="/kanban/new"
                  >
                    Создать карточку
                  </a>
                }
              />
            ) : null}
          </div>
        </section>
      ))}
    </div>
  );
}
