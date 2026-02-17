"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const statusMap = {
  pending: {
    label: "Pending",
    className: "border-secondary bg-secondary/40 text-secondary-foreground",
  },
  processing: {
    label: "Processing",
    className: "border-primary/30 bg-primary/10 text-primary",
  },
  ready: {
    label: "Ready",
    className: "border-primary/30 bg-primary/10 text-primary",
  },
  completed: {
    label: "Completed",
    className: "border-primary/30 bg-primary/10 text-primary",
  },
  failed: {
    label: "Failed",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  },
  running: {
    label: "Running",
    className: "border-primary/30 bg-primary/10 text-primary",
  },
  proposed: {
    label: "Proposed",
    className: "border-primary/30 bg-primary/10 text-primary",
  },
  accepted: {
    label: "Accepted",
    className: "border-primary/30 bg-primary/10 text-primary",
  },
  dismissed: {
    label: "Dismissed",
    className: "border-border bg-muted text-muted-foreground",
  },
  done: {
    label: "Done",
    className: "border-primary/30 bg-primary/10 text-primary",
  },
  cancelled: {
    label: "Cancelled",
    className: "border-border bg-muted text-muted-foreground",
  },
  draft: {
    label: "Draft",
    className: "border-secondary bg-secondary/40 text-secondary-foreground",
  },
  approved: {
    label: "Approved",
    className: "border-primary/30 bg-primary/10 text-primary",
  },
  sent: {
    label: "Sent",
    className: "border-primary/30 bg-primary/10 text-primary",
  },
  blocked_opt_out: {
    label: "Blocked (Opt-out)",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  },
  blocked_stop_on_reply: {
    label: "Blocked (Reply)",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  },
  blocked_frequency_cap: {
    label: "Blocked (Cap)",
    className: "border-secondary bg-secondary/40 text-secondary-foreground",
  },
};

export function StatusChip({ status, className }) {
  const normalized = String(status || "").toLowerCase();
  const chip = statusMap[normalized] || {
    label: status || "Unknown",
    className: "border-border bg-muted text-foreground",
  };

  return (
    <Badge variant="outline" className={cn("text-xs font-medium", chip.className, className)}>
      {chip.label}
    </Badge>
  );
}
