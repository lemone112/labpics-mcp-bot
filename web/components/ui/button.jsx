"use client";

import { Button as HeroButton } from "@heroui/react";

import { cn } from "@/lib/utils";

const variantConfig = {
  default: {
    variant: "solid",
    color: "primary",
    className:
      "border border-[var(--brand-600)] bg-[var(--brand-500)] text-white hover:bg-[var(--brand-600)] focus-visible:ring-2 focus-visible:ring-[var(--brand-300)] focus-visible:ring-offset-1 focus-visible:ring-offset-white",
  },
  secondary: {
    variant: "flat",
    color: "default",
    className:
      "border border-[var(--border-subtle)] bg-white text-[var(--text-primary)] hover:bg-[var(--surface-soft)] focus-visible:ring-2 focus-visible:ring-[var(--brand-300)] focus-visible:ring-offset-1 focus-visible:ring-offset-white",
  },
  outline: {
    variant: "bordered",
    color: "default",
    className:
      "border-[var(--border-subtle)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-soft)] focus-visible:ring-2 focus-visible:ring-[var(--brand-300)] focus-visible:ring-offset-1 focus-visible:ring-offset-white",
  },
  danger: {
    variant: "solid",
    color: "danger",
    className:
      "bg-[var(--danger-500)] text-white hover:brightness-[1.03] focus-visible:ring-2 focus-visible:ring-[var(--status-danger-border)] focus-visible:ring-offset-1 focus-visible:ring-offset-white",
  },
};

const sizeMap = {
  default: "md",
  sm: "sm",
  lg: "lg",
};

const sizeClassMap = {
  default: "h-9 text-sm",
  sm: "h-8 text-xs",
  lg: "h-10 text-sm",
};

export function Button({
  className,
  variant = "default",
  size = "default",
  type = "button",
  ...props
}) {
  const config = variantConfig[variant] || variantConfig.default;

  return (
    <HeroButton
      type={type}
      variant={config.variant}
      color={config.color}
      size={sizeMap[size] || "md"}
      radius="md"
      className={cn(
        "font-medium disabled:border-[var(--border-subtle)] disabled:bg-[var(--surface-soft)] disabled:text-[var(--text-subtle)]",
        sizeClassMap[size] || sizeClassMap.default,
        config.className,
        className
      )}
      {...props}
    />
  );
}
