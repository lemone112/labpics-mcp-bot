"use client";

import { Card as HeroCard, CardBody, CardHeader as HeroCardHeader } from "@heroui/react";

import { cn } from "@/lib/utils";

export function Card({ className, ...props }) {
  return (
    <HeroCard
      radius="lg"
      shadow="sm"
      className={cn("app-surface rounded-[var(--radius-lg)]", className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }) {
  return <HeroCardHeader className={cn("flex-col items-start gap-1 p-5 pb-2", className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
  return <h3 className={cn("text-base font-semibold tracking-[-0.01em] text-[var(--text-strong)]", className)} {...props} />;
}

export function CardDescription({ className, ...props }) {
  return <p className={cn("text-sm text-[var(--text-muted)]", className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <CardBody className={cn("p-5 pt-2", className)} {...props} />;
}
