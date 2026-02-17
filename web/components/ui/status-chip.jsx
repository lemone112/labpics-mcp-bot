"use client";

import { Chip } from "@heroui/react";

import { cn } from "@/lib/utils";

const statusMap = {
  pending: {
    color: "default",
    label: "Pending",
    className: "border-[#f1d49f] bg-[#fff8eb] text-[#9a6b17]",
  },
  processing: {
    color: "default",
    label: "Processing",
    className: "border-[#c7d2fe] bg-[#eef2ff] text-[#3f51a4]",
  },
  ready: {
    color: "default",
    label: "Ready",
    className: "border-[#bbe7ce] bg-[#edfdf3] text-[#1f7a45]",
  },
  completed: {
    color: "default",
    label: "Completed",
    className: "border-[#bbe7ce] bg-[#edfdf3] text-[#1f7a45]",
  },
  failed: {
    color: "default",
    label: "Failed",
    className: "border-[#fecdd3] bg-[#fff1f2] text-[#be123c]",
  },
  running: {
    color: "default",
    label: "Running",
    className: "border-[#c7d2fe] bg-[#eef2ff] text-[#3f51a4]",
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
