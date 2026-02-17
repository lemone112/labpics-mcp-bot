"use client";

import { Chip } from "@heroui/react";

import { cn } from "@/lib/utils";

const statusMap = {
  pending: {
    color: "default",
    label: "Pending",
    className:
      "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]",
  },
  processing: {
    color: "default",
    label: "Processing",
    className:
      "border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-fg)]",
  },
  ready: {
    color: "default",
    label: "Ready",
    className:
      "border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]",
  },
  completed: {
    color: "default",
    label: "Completed",
    className:
      "border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]",
  },
  failed: {
    color: "default",
    label: "Failed",
    className:
      "border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)]",
  },
  running: {
    color: "default",
    label: "Running",
    className:
      "border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-fg)]",
  },
};

export function StatusChip({ status, className }) {
  const normalized = String(status || "").toLowerCase();
  const chip = statusMap[normalized] || {
    color: "default",
    label: status || "Unknown",
    className: "border-[var(--border-subtle)] bg-[var(--surface-soft)] text-[var(--text-primary)]",
  };

  return (
    <Chip
      size="sm"
      radius="sm"
      variant="flat"
      color={chip.color}
      className={cn(
        "border text-xs font-medium",
        chip.className,
        className
      )}
    >
      {chip.label}
    </Chip>
  );
}
