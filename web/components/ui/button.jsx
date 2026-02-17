"use client";

import { Button as HeroButton } from "@heroui/react";

import { cn } from "@/lib/utils";

const variantConfig = {
  default: {
    variant: "solid",
    color: "primary",
    className: "border border-[#255fd9] bg-[var(--brand-500)] text-white hover:bg-[var(--brand-600)]",
  },
  secondary: {
    variant: "flat",
    color: "default",
    className:
      "border border-[var(--border-subtle)] bg-white text-[var(--text-primary)] hover:bg-[var(--surface-soft)]",
  },
  outline: {
    variant: "bordered",
    color: "default",
    className:
      "border-[var(--border-subtle)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-soft)]",
  },
  danger: {
    variant: "solid",
    color: "danger",
    className: "bg-[var(--danger-500)] text-white hover:brightness-[1.03]",
  },
};

const sizeMap = {
  default: "md",
  sm: "sm",
  lg: "lg",
};

const sizeClassMap = {
  default: "h-9 text-[13px]",
  sm: "h-8 text-[12px]",
  lg: "h-10 text-[14px]",
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
        "font-medium tracking-[-0.01em] transition-transform active:scale-[0.99] disabled:border-[var(--border-subtle)] disabled:bg-[var(--surface-soft)] disabled:text-[var(--text-subtle)]",
        sizeClassMap[size] || sizeClassMap.default,
        config.className,
        className
      )}
      {...props}
    />
  );
}
