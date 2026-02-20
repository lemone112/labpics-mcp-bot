"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function Filters({ className, queryValue, onQueryChange, queryPlaceholder = "Search...", trailing = null }) {
  return (
    <div className={cn("flex flex-col gap-2 md:flex-row md:items-center", className)}>
      <Input
        value={queryValue}
        onChange={(event) => onQueryChange?.(event.target.value)}
        placeholder={queryPlaceholder}
        aria-label={queryPlaceholder}
        className="md:max-w-sm"
      />
      {trailing ? <div className="flex flex-wrap items-center gap-2">{trailing}</div> : null}
    </div>
  );
}
