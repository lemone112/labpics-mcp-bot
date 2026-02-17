"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { cn } from "@/lib/utils";

export function Toast({ type = "info", message, className }) {
  if (!message) return null;

  const style = {
    info: "border-border bg-card text-card-foreground",
    success: "border-emerald-300 bg-emerald-50 text-emerald-900",
    error: "border-destructive/40 bg-destructive/10 text-destructive",
  };

  return (
    <Alert data-motion-item className={cn(style[type] || style.info, className)}>
      <AlertTitle>{type === "error" ? "Error" : type === "success" ? "Success" : "Info"}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
