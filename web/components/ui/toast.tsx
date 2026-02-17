"use client";

import { cn } from "@/lib/utils";
import type { ToastType } from "@/lib/types";

interface ToastProps {
  type?: ToastType;
  message?: string;
  className?: string;
}

export function Toast({ type = "info", message, className }: ToastProps) {
  if (!message) return null;

  const palette = {
    info: "border-cyan-700/80 bg-cyan-500/10 text-cyan-200",
    success: "border-emerald-700/80 bg-emerald-500/10 text-emerald-200",
    error: "border-rose-700/80 bg-rose-500/10 text-rose-200",
  } as const;

  return (
    <div className={cn("rounded-md border px-3 py-2 text-sm", palette[type], className)}>
      {message}
    </div>
  );
}
