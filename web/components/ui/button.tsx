"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

const variants = {
  default: "bg-cyan-400 text-slate-950 hover:bg-cyan-300",
  secondary: "border border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800",
  outline: "border border-slate-700 text-slate-200 hover:bg-slate-900",
  ghost: "text-slate-200 hover:bg-slate-900",
  danger: "bg-rose-500 text-white hover:bg-rose-400",
} as const;

const sizes = {
  default: "h-10 px-4 py-2 text-sm",
  sm: "h-8 px-3 text-xs",
  lg: "h-11 px-6 text-base",
  icon: "h-9 w-9",
} as const;

type ButtonVariant = keyof typeof variants;
type ButtonSize = keyof typeof sizes;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  className,
  variant = "default",
  size = "default",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}
