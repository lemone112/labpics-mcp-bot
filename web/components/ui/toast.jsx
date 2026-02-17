"use client";

import { cn } from "@/lib/utils";

export function Toast({ type = "info", message, className }) {
  if (!message) return null;

  const palette = {
    info: "border-cyan-600/60 bg-cyan-500/10 text-cyan-200",
    success: "border-emerald-600/60 bg-emerald-500/10 text-emerald-200",
    error: "border-rose-600/60 bg-rose-500/10 text-rose-200",
  };

  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        palette[type] || palette.info,
        className
      )}
    >
      {message}
    </div>
  );
}
