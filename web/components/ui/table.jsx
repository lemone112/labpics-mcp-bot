"use client";

import { cn } from "@/lib/utils";

export function Table({ className, "aria-label": ariaLabel = "Data table", ...props }) {
  return (
    <div className="w-full overflow-x-auto">
      <table aria-label={ariaLabel} className={cn("w-full min-w-[640px] border-collapse", className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }) {
  return <thead className={cn(className)} {...props} />;
}

export function TableBody({ className, ...props }) {
  return <tbody className={cn(className)} {...props} />;
}

export function TableRow({ className, ...props }) {
  return (
    <tr
      className={cn(
        "border-b border-[var(--border-subtle)] transition-colors hover:bg-[var(--table-row-hover)]",
        className
      )}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }) {
  return (
    <th
      className={cn(
        "h-9 border-b border-[var(--border-subtle)] bg-transparent px-3 text-left text-xs font-medium text-[var(--text-muted)]",
        className
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }) {
  return (
    <td
      className={cn(
        "px-3 py-2.5 align-top text-sm text-[var(--text-primary)]",
        className
      )}
      {...props}
    />
  );
}
