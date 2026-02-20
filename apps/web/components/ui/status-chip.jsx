"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const statusMap = {
  pending: {
    label: "Ожидание",
    className: "border-warning/30 bg-warning/10 text-warning",
  },
  processing: {
    label: "Обработка",
    className: "border-primary/30 bg-primary/10 text-primary",
  },
  ready: {
    label: "Готов",
    className: "border-success/30 bg-success/10 text-success",
  },
  completed: {
    label: "Завершён",
    className: "border-success/30 bg-success/10 text-success",
  },
  failed: {
    label: "Ошибка",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  },
  running: {
    label: "Выполняется",
    className: "border-primary/30 bg-primary/10 text-primary",
  },
  generating: {
    label: "Генерация",
    className: "border-primary/30 bg-primary/10 text-primary",
  },
  proposed: {
    label: "Предложено",
    className: "border-primary/30 bg-primary/10 text-primary",
  },
  accepted: {
    label: "Принято",
    className: "border-success/30 bg-success/10 text-success",
  },
  dismissed: {
    label: "Отклонено",
    className: "border-border bg-muted text-muted-foreground",
  },
  done: {
    label: "Выполнено",
    className: "border-success/30 bg-success/10 text-success",
  },
  cancelled: {
    label: "Отменено",
    className: "border-border bg-muted text-muted-foreground",
  },
  draft: {
    label: "Черновик",
    className: "border-border bg-secondary/40 text-secondary-foreground",
  },
  approved: {
    label: "Утверждено",
    className: "border-success/30 bg-success/10 text-success",
  },
  sent: {
    label: "Отправлено",
    className: "border-success/30 bg-success/10 text-success",
  },
  blocked_opt_out: {
    label: "Заблокировано (Opt-out)",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  },
  blocked_stop_on_reply: {
    label: "Заблокировано (Ответ)",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  },
  blocked_frequency_cap: {
    label: "Заблокировано (Лимит)",
    className: "border-warning/30 bg-warning/10 text-warning",
  },
  succeeded: {
    label: "Успешно",
    className: "border-success/30 bg-success/10 text-success",
  },
  discovery: {
    label: "Discovery",
    className: "border-border bg-secondary/40 text-secondary-foreground",
  },
  qualified: {
    label: "Qualified",
    className: "border-primary/30 bg-primary/10 text-primary",
  },
  proposal: {
    label: "Proposal",
    className: "border-primary/30 bg-primary/10 text-primary",
  },
  negotiation: {
    label: "Negotiation",
    className: "border-warning/30 bg-warning/10 text-warning",
  },
  won: {
    label: "Won",
    className: "border-success/30 bg-success/10 text-success",
  },
  lost: {
    label: "Lost",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  },
  previewed: {
    label: "Предпросмотр",
    className: "border-primary/30 bg-primary/10 text-primary",
  },
};

export function StatusChip({ status, className }) {
  const normalized = String(status || "").toLowerCase();
  const chip = statusMap[normalized] || {
    label: status || "Неизвестно",
    className: "border-border bg-muted text-foreground",
  };

  return (
    <Badge variant="outline" className={cn("text-xs font-medium", chip.className, className)}>
      {chip.label}
    </Badge>
  );
}
