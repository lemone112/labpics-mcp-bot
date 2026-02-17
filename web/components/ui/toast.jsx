"use client";

import { Alert } from "@heroui/react";

import { cn } from "@/lib/utils";

export function Toast({ type = "info", message, className }) {
  if (!message) return null;

  const variant = {
    info: "primary",
    success: "success",
    error: "danger",
  };

  return (
    <Alert
      data-motion-item
      radius="md"
      variant="flat"
      color={variant[type] || "primary"}
      title={message}
      hideIcon={false}
      className={cn(
        "border border-[var(--border-subtle)] bg-[var(--surface-soft)] text-sm text-[var(--text-primary)]",
        className
      )}
    />
  );
}
