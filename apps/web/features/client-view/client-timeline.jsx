"use client";

import {
  MessageSquareText,
  Handshake,
  ShieldAlert,
  ListChecks,
  Sparkles,
  StickyNote,
  ArrowRightLeft,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

// ── Event Type Config ──────────────────────────────────────────

const EVENT_TYPE_CONFIG = {
  message: { icon: MessageSquareText, label: "Сообщение", color: "text-primary" },
  agreement: { icon: Handshake, label: "Договоренность", color: "text-success" },
  risk: { icon: ShieldAlert, label: "Риск", color: "text-destructive" },
  job: { icon: ListChecks, label: "Задача", color: "text-primary" },
  offer: { icon: Sparkles, label: "Оффер", color: "text-warning" },
  note: { icon: StickyNote, label: "Заметка", color: "text-muted-foreground" },
  status_change: { icon: ArrowRightLeft, label: "Изменение статуса", color: "text-muted-foreground" },
};

// ── Timeline Event Item ────────────────────────────────────────

function TimelineEvent({ event }) {
  const config = EVENT_TYPE_CONFIG[event.type] || EVENT_TYPE_CONFIG.note;
  const Icon = config.icon;

  const date = new Date(event.occurredAt);
  const formattedDate = date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });
  const formattedTime = date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const Tag = event.href ? "a" : "div";
  const linkProps = event.href ? { href: event.href } : {};

  return (
    <div className="flex gap-3">
      {/* Timeline dot + line */}
      <div className="flex flex-col items-center">
        <div className={cn("flex size-7 shrink-0 items-center justify-center rounded-full border bg-card", config.color)}>
          <Icon className="size-3.5" />
        </div>
        <div className="mt-1 w-px flex-1 bg-border" />
      </div>

      {/* Event content */}
      <Tag
        className={cn(
          "mb-4 min-w-0 flex-1 rounded-lg border bg-card p-3",
          event.href && "cursor-pointer transition-colors hover:bg-accent/30",
        )}
        {...linkProps}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{event.title}</p>
            {event.description ? (
              <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                {event.description}
              </p>
            ) : null}
          </div>
          <Badge variant="outline" className="shrink-0 text-xs">
            {event.projectName}
          </Badge>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {formattedDate} в {formattedTime}
        </p>
      </Tag>
    </div>
  );
}

// ── Main Timeline Component ────────────────────────────────────

/**
 * ClientTimeline — chronological feed of client events across projects.
 *
 * @param {{
 *   events: import("@/types/client-view").ClientTimelineEvent[],
 *   loading?: boolean,
 *   className?: string,
 * }} props
 */
export function ClientTimeline({ events, loading = false, className }) {
  if (loading) {
    return (
      <div className={cn("space-y-3", className)}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <div className="size-7 shrink-0 rounded-full bg-muted animate-pulse" />
            <div className="flex-1 space-y-1.5 rounded-lg border p-3">
              <div className="h-3.5 w-48 rounded-sm bg-muted animate-pulse" />
              <div className="h-2.5 w-32 rounded-sm bg-muted animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!events || events.length === 0) {
    return (
      <EmptyState
        title="Нет событий"
        description="История взаимодействий с клиентом пока пуста."
        className={className}
      />
    );
  }

  return (
    <div className={cn("space-y-0", className)}>
      {events.map((event) => (
        <TimelineEvent key={event.id} event={event} />
      ))}
    </div>
  );
}
