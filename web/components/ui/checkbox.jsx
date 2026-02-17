"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

const Checkbox = React.forwardRef(({ className, checked, onCheckedChange, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    role="checkbox"
    aria-checked={Boolean(checked)}
    data-state={checked ? "checked" : "unchecked"}
    onClick={() => onCheckedChange?.(!checked)}
    className={cn(
      "peer inline-flex size-4 shrink-0 items-center justify-center rounded-sm border border-input transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
      checked && "border-primary bg-primary text-primary-foreground",
      className
    )}
    {...props}
  >
    {checked ? <Check className="size-3" /> : null}
  </button>
));
Checkbox.displayName = "Checkbox";

export { Checkbox };
