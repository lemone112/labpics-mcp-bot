"use client";

import { Input as HeroInput } from "@heroui/react";

import { cn } from "@/lib/utils";

export function Input({ className, classNames, type = "text", ...props }) {
  return (
    <HeroInput
      type={type}
      variant="bordered"
      radius="md"
      size="md"
      className={cn("w-full", className)}
      classNames={{
        inputWrapper:
          "min-h-10 border border-[var(--border-subtle)] bg-[var(--surface-soft)] shadow-none transition-colors group-data-[focus=true]:border-[var(--border-accent)] group-data-[focus=true]:bg-[rgba(15,23,42,0.78)] group-data-[hover=true]:border-[var(--border-strong)]",
        input: "text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
        ...classNames,
      }}
      {...props}
    />
  );
}
