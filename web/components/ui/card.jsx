"use client";

import { Card as HeroCard, CardBody, CardHeader as HeroCardHeader } from "@heroui/react";

import { cn } from "@/lib/utils";

export function Card({ className, ...props }) {
  return (
    <HeroCard
      radius="md"
      shadow="sm"
      className={cn("app-surface rounded-[var(--radius-md)]", className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }) {
  return <HeroCardHeader className={cn("flex-col items-start gap-1 p-4 pb-2", className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
  return <h3 className={cn("text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-strong)]", className)} {...props} />;
}

export function CardDescription({ className, ...props }) {
  return <p className={cn("text-[13px] text-[var(--text-muted)]", className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <CardBody className={cn("p-4 pt-2", className)} {...props} />;
}
