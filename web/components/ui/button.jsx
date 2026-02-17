"use client";

import { Button as HeroButton } from "@heroui/react";

import { cn } from "@/lib/utils";

const variantConfig = {
  default: {
    variant: "solid",
    color: "primary",
    className:
      "bg-[linear-gradient(135deg,var(--brand-500),var(--brand-400))] text-[#041018] shadow-[var(--shadow-glow)] hover:brightness-105",
  },
  secondary: {
    variant: "flat",
    color: "default",
    className:
      "border border-[var(--border-strong)] bg-[var(--surface-soft)] text-[var(--text-primary)] hover:bg-[rgba(148,163,184,0.15)]",
  },
  outline: {
    variant: "bordered",
    color: "primary",
    className:
      "border-[var(--border-accent)] bg-transparent text-[var(--brand-300)] hover:bg-[rgba(34,211,238,0.08)]",
  },
  danger: {
    variant: "solid",
    color: "danger",
    className: "bg-[var(--danger-500)] text-white hover:brightness-105",
  },
};

const sizeMap = {
  default: "md",
  sm: "sm",
  lg: "lg",
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
        "font-medium tracking-[-0.01em] transition-transform active:scale-[0.99]",
        config.className,
        className
      )}
      {...props}
    />
  );
}
