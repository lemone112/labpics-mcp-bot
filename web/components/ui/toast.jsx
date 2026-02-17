"use client";

import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function Toast({ type = "info", message, className }) {
  if (!message) return null;

  const tone =
    type === "error"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : type === "success"
        ? "border-primary/30 bg-primary/10 text-primary"
        : "border-border bg-muted text-foreground";

  return (
    <Alert data-motion-item className={cn("border text-sm", tone, className)}>
      <AlertTitle>{type === "error" ? "Error" : type === "success" ? "Success" : "Info"}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
