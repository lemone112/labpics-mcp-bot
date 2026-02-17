"use client";

import {
  Table as HeroTable,
  TableBody as HeroTableBody,
  TableCell as HeroTableCell,
  TableColumn,
  TableHeader as HeroTableHeader,
  TableRow as HeroTableRow,
} from "@heroui/react";

import { cn } from "@/lib/utils";

export function Table({ className, "aria-label": ariaLabel = "Data table", ...props }) {
  return (
    <HeroTable
      removeWrapper
      aria-label={ariaLabel}
      className={cn("w-full", className)}
      classNames={{
        table: "min-w-full",
        th: "h-9 border-b border-[var(--border-subtle)] bg-transparent px-3 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-subtle)]",
        td: "border-b border-[var(--border-subtle)] px-3 py-2.5 align-top text-[13px] text-[var(--text-primary)]",
        tr: "data-[hover=true]:bg-[rgba(15,23,42,0.02)]",
      }}
      {...props}
    />
  );
}

export function TableHeader({ className, ...props }) {
  return <HeroTableHeader className={cn(className)} {...props} />;
}

export function TableBody({ className, ...props }) {
  return <HeroTableBody className={cn(className)} {...props} />;
}

export function TableRow({ className, ...props }) {
  return <HeroTableRow className={cn(className)} {...props} />;
}

export function TableHead({ className, ...props }) {
  return <TableColumn className={cn(className)} {...props} />;
}

export function TableCell({ className, ...props }) {
  return <HeroTableCell className={cn(className)} {...props} />;
}
