"use client";

import { Chip } from "@heroui/react";

import { cn } from "@/lib/utils";

const statusMap = {
  pending: { color: "warning", label: "Pending" },
  processing: { color: "secondary", label: "Processing" },
  ready: { color: "success", label: "Ready" },
  completed: { color: "success", label: "Completed" },
  failed: { color: "danger", label: "Failed" },
  running: { color: "secondary", label: "Running" },
};

export function StatusChip({ status, className }) {
  const normalized = String(status || "").toLowerCase();
  const chip = statusMap[normalized] || {
    color: "default",
    label: status || "Unknown",
  };

  return (
    <Chip
      size="sm"
      radius="sm"
      variant="flat"
      color={chip.color}
      className={cn(
        "border border-[var(--border-subtle)] bg-[var(--surface-soft)] text-[11px] font-semibold tracking-[0.02em]",
        className
      )}
    >
      {chip.label}
    </Chip>
  );
}
