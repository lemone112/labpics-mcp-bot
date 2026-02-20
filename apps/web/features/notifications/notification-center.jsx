"use client";

import { useCallback, useState } from "react";
import {
  Bell,
  Check,
  CheckCheck,
  Info,
  AlertTriangle,
  CircleAlert,
  CircleCheck,
  ListChecks,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useNotifications, useNotificationCount, useNotificationMutations } from "@/hooks/use-notifications";

// ── Type Icons & Colors ────────────────────────────────────────

const TYPE_CONFIG = {
  info: { icon: Info, color: "text-primary", bg: "bg-primary/10" },
  success: { icon: CircleCheck, color: "text-success", bg: "bg-success/10" },
  warning: { icon: AlertTriangle, color: "text-warning", bg: "bg-warning/10" },
  error: { icon: CircleAlert, color: "text-destructive", bg: "bg-destructive/10" },
  action: { icon: ListChecks, color: "text-primary", bg: "bg-primary/10" },
};

// ── Time Ago ───────────────────────────────────────────────────

function timeAgo(dateString) {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return "только что";
  if (diffMin < 60) return `${diffMin} мин назад`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} ч назад`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} дн назад`;

  return new Date(dateString).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });
}

// ── Notification Item ──────────────────────────────────────────

function NotificationItem({ notification, onMarkRead, onDismiss, onNavigate }) {
  const config = TYPE_CONFIG[notification.type] || TYPE_CONFIG.info;
  const Icon = config.icon;
  const isInteractive = Boolean(notification.href);

  const handleClick = useCallback(() => {
    if (!notification.isRead) {
      onMarkRead?.(notification.id);
    }
    if (notification.href) {
      onNavigate?.(notification.href);
    }
  }, [notification, onMarkRead, onNavigate]);

  return (
    <div
      className={cn(
        "group flex gap-3 rounded-lg border px-3 py-3 transition-colors",
        !notification.isRead && "bg-accent/30 border-primary/10",
        notification.isRead && "border-transparent",
        isInteractive && "cursor-pointer hover:bg-accent/50",
      )}
      onClick={handleClick}
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
    >
      {/* Icon */}
      <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", config.bg)}>
        <Icon className={cn("size-4", config.color)} />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={cn("text-sm", !notification.isRead && "font-medium")}>
            {notification.title}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            {!notification.isRead ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onMarkRead?.(notification.id);
                }}
                className="rounded-sm p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                aria-label="Отметить как прочитанное"
              >
                <Check className="size-3.5" />
              </button>
            ) : null}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDismiss?.(notification.id);
              }}
              className="rounded-sm p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
              aria-label="Удалить уведомление"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>

        {notification.body ? (
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
            {notification.body}
          </p>
        ) : null}

        <div className="mt-1 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {timeAgo(notification.createdAt)}
          </span>
          {notification.projectName ? (
            <Badge variant="outline" className="text-[10px] px-1 py-0">
              {notification.projectName}
            </Badge>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── Loading Skeleton ───────────────────────────────────────────

function NotificationSkeleton() {
  return (
    <div className="flex gap-3 px-3 py-3">
      <Skeleton className="size-8 shrink-0 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-48 rounded-sm" />
        <Skeleton className="h-2.5 w-full rounded-sm" />
        <Skeleton className="h-2.5 w-20 rounded-sm" />
      </div>
    </div>
  );
}

// ── Bell Icon Button ───────────────────────────────────────────

/**
 * NotificationBell — header bell icon with unread badge.
 *
 * @param {{
 *   onClick: () => void,
 *   className?: string,
 * }} props
 */
export function NotificationBell({ onClick, className }) {
  const { unreadCount } = useNotificationCount();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      className={cn("relative size-8", className)}
      aria-label={`Уведомления${unreadCount > 0 ? ` (${unreadCount} непрочитанных)` : ""}`}
    >
      <Bell className="size-4" />
      {unreadCount > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 py-px text-[10px] font-semibold text-destructive-foreground">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : null}
    </Button>
  );
}

// ── Notification Center Sheet ──────────────────────────────────

/**
 * NotificationCenter — full notification list in a right-side sheet.
 *
 * @param {{
 *   open: boolean,
 *   onOpenChange: (open: boolean) => void,
 *   onNavigate?: (href: string) => void,
 * }} props
 */
export function NotificationCenter({ open, onOpenChange, onNavigate }) {
  const [filter, setFilter] = useState("all"); // "all" | "unread"

  const { notifications, isLoading, totalCount, hasMore, refetch } = useNotifications({
    enabled: open,
    unreadOnly: filter === "unread",
  });

  const { markRead, markAllRead, dismiss } = useNotificationMutations();

  const handleMarkRead = useCallback(
    (id) => markRead.mutate(id),
    [markRead],
  );

  const handleMarkAllRead = useCallback(
    () => markAllRead.mutate(),
    [markAllRead],
  );

  const handleDismiss = useCallback(
    (id) => dismiss.mutate(id),
    [dismiss],
  );

  const handleNavigate = useCallback(
    (href) => {
      onOpenChange(false);
      if (onNavigate) onNavigate(href);
    },
    [onOpenChange, onNavigate],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-sm flex-col p-0 sm:max-w-md">
        {/* Header */}
        <SheetHeader className="border-b px-4 py-3">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-base">Уведомления</SheetTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMarkAllRead}
                className="h-7 text-xs"
                disabled={markAllRead.isPending}
              >
                <CheckCheck className="size-3.5" />
                Прочитать все
              </Button>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="mt-2 flex gap-1">
            <button
              onClick={() => setFilter("all")}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                filter === "all"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent/50",
              )}
            >
              Все
            </button>
            <button
              onClick={() => setFilter("unread")}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                filter === "unread"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent/50",
              )}
            >
              Непрочитанные
            </button>
          </div>
        </SheetHeader>

        {/* Notification list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-1 p-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <NotificationSkeleton key={i} />
              ))}
            </div>
          ) : notifications.length > 0 ? (
            <div className="space-y-1 p-2">
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkRead={handleMarkRead}
                  onDismiss={handleDismiss}
                  onNavigate={handleNavigate}
                />
              ))}
              {hasMore ? (
                <div className="py-3 text-center">
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => refetch()}>
                    Загрузить еще
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="p-4">
              <EmptyState
                title="Нет уведомлений"
                description={
                  filter === "unread"
                    ? "Все уведомления прочитаны."
                    : "Уведомления появятся при новых событиях."
                }
              />
            </div>
          )}
        </div>

        {/* Footer */}
        {totalCount > 0 ? (
          <div className="border-t px-4 py-2 text-center text-xs text-muted-foreground">
            {totalCount} уведомлений
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
