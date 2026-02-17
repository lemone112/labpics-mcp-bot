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
  proposed: {
    color: "default",
    label: "Proposed",
    className:
      "border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-fg)]",
  },
  accepted: {
    color: "default",
    label: "Accepted",
    className:
      "border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]",
  },
  dismissed: {
    color: "default",
    label: "Dismissed",
    className:
      "border-[var(--border-subtle)] bg-[var(--surface-soft)] text-[var(--text-muted)]",
  },
  done: {
    color: "default",
    label: "Done",
    className:
      "border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]",
  },
  cancelled: {
    color: "default",
    label: "Cancelled",
    className:
      "border-[var(--border-subtle)] bg-[var(--surface-soft)] text-[var(--text-muted)]",
  },
  draft: {
    color: "default",
    label: "Draft",
    className:
      "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]",
  },
  approved: {
    color: "default",
    label: "Approved",
    className:
      "border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-fg)]",
  },
  sent: {
    color: "default",
    label: "Sent",
    className:
      "border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]",
  },
  blocked_opt_out: {
    color: "default",
    label: "Blocked (Opt-out)",
    className:
      "border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)]",
  },
  blocked_stop_on_reply: {
    color: "default",
    label: "Blocked (Reply)",
    className:
      "border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)]",
  },
  blocked_frequency_cap: {
    color: "default",
    label: "Blocked (Cap)",
    className:
      "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]",
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
