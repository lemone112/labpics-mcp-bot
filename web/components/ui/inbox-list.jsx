"use client";

import { cn } from "@/lib/utils";
import { StatusChip } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";

export function InboxList({ items = [], className, onSelect = null }) {
  return (
    <div className={cn("space-y-2", className)}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="w-full rounded-md border bg-card p-3 text-left transition-colors hover:bg-accent/40"
          onClick={() => onSelect?.(item)}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-medium">{item.title}</div>
              {item.snippet ? (
                <div className="mt-1 max-h-10 overflow-hidden text-xs text-muted-foreground">{item.snippet}</div>
              ) : null}
            </div>
            <StatusChip status={item.status || "pending"} />
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{item.meta || ""}</div>
        </button>
      ))}

      {!items.length ? (
        <EmptyState
          data-testid="empty-wizard"
          title="Список пуст"
          reason="Пока нет писем или сообщений для отображения."
          steps={["Добавьте элемент", "Выберите его", "Продолжайте работу"]}
          primaryAction={
            <a
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
              href="/inbox/new"
            >
              Создать
            </a>
          }
        />
      ) : null}
    </div>
  );
}
