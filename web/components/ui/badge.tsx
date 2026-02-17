import * as React from "react";

import { cn } from "@/lib/utils";

const variants = {
  default: "border border-slate-700 bg-slate-900 text-slate-200",
  success: "border border-emerald-700/80 bg-emerald-500/10 text-emerald-200",
  warning: "border border-amber-700/80 bg-amber-500/10 text-amber-200",
  danger: "border border-rose-700/80 bg-rose-500/10 text-rose-200",
  info: "border border-cyan-700/80 bg-cyan-500/10 text-cyan-200",
} as const;

type BadgeVariant = keyof typeof variants;

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
