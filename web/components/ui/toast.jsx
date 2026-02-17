"use client";

import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function Toast({ type = "info", message, className }) {
  if (!message) return null;

  const tone =
    type === "error"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : type === "success"
        ? "border-success/30 bg-success/10 text-success"
        : "border-border bg-muted text-foreground";

  return (
    <Alert data-motion-item className={cn("border text-sm", tone, className)}>
      <AlertTitle>{type === "error" ? "Ошибка" : type === "success" ? "Готово" : "Информация"}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
