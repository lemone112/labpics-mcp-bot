"use client";

import { Badge } from "@/components/ui/badge";

import { cn } from "@/lib/utils";

const statusMap = {
  pending: {
    label: "Pending",
    className: "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100",
  },
  processing: {
    label: "Processing",
    className: "border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100",
  },
  ready: {
    label: "Ready",
    className: "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
  },
  completed: {
    label: "Completed",
    className: "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
  },
  failed: {
    label: "Failed",
    className: "border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100",
  },
  running: {
    label: "Running",
    className: "border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100",
  },
};

export function StatusChip({ status, className }) {
  const normalized = String(status || "").toLowerCase();
  const chip = statusMap[normalized] || {
    label: status || "Unknown",
    className: "border-border bg-muted text-muted-foreground hover:bg-muted",
  };

  return (
    <Badge variant="outline" className={cn("border text-xs font-medium", chip.className, className)}>
      {chip.label}
    </Badge>
  );
}
