"use client";

import { cn } from "@/lib/utils";

const variants = {
  default: "bg-cyan-500 text-slate-950 hover:bg-cyan-400",
  secondary: "bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-700",
  outline: "border border-cyan-500 text-cyan-300 hover:bg-cyan-500/10",
  danger: "bg-rose-500 text-white hover:bg-rose-400",
};

const sizes = {
  default: "h-10 px-4 py-2 text-sm",
  sm: "h-8 px-3 text-xs",
  lg: "h-11 px-6 text-base",
};

export function Button({
  className,
  variant = "default",
  size = "default",
  type = "button",
  ...props
}) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant] || variants.default,
        sizes[size] || sizes.default,
        className
      )}
      {...props}
    />
  );
}
