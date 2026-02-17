"use client";

import { Badge } from "@/components/ui/badge";

import { cn } from "@/lib/utils";

const statusMap = {
  pending: {
    label: "Pending",
    className: "border-border bg-secondary text-secondary-foreground hover:bg-secondary/80",
  },
  processing: {
    label: "Processing",
    className: "border-border bg-accent text-accent-foreground hover:bg-accent/80",
  },
  ready: {
    label: "Ready",
    className: "border-border bg-primary/10 text-primary hover:bg-primary/15",
  },
  completed: {
    label: "Completed",
    className: "border-border bg-primary/10 text-primary hover:bg-primary/15",
  },
  failed: {
    label: "Failed",
    className: "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15",
  },
  running: {
    label: "Running",
    className: "border-border bg-accent text-accent-foreground hover:bg-accent/80",
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
