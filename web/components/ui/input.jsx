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
          "min-h-9 border border-[var(--border-subtle)] bg-white shadow-none transition-colors group-data-[focus=true]:border-[var(--border-accent)] group-data-[focus=true]:bg-white group-data-[focus=true]:shadow-[0_0_0_3px_var(--focus-ring-soft)] group-data-[hover=true]:border-[var(--border-strong)]",
        input: "text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
        ...classNames,
      }}
      {...props}
    />
  );
}
