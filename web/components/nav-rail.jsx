"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquareText,
  Handshake,
  ShieldAlert,
  Wallet,
  Sparkles,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { PORTFOLIO_SECTIONS } from "@/lib/portfolio-sections";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const SECTION_ICONS = {
  dashboard: LayoutDashboard,
  messages: MessageSquareText,
  agreements: Handshake,
  risks: ShieldAlert,
  finance: Wallet,
  offers: Sparkles,
};

function IconButton({ active = false, children }) {
  return (
    <span
      className={cn(
        "flex size-9 items-center justify-center rounded-md border border-transparent text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        active && "border-sidebar-border bg-sidebar-accent text-sidebar-accent-foreground"
      )}
    >
      {children}
    </span>
  );
}

export function NavRail() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-svh w-14 shrink-0 flex-col items-center justify-between border-r bg-sidebar py-3">
      <TooltipProvider delayDuration={50}>
        <div className="flex w-full flex-col items-center gap-1">
          {PORTFOLIO_SECTIONS.map((item) => {
            const Icon = SECTION_ICONS[item.key];
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Tooltip key={item.key}>
                <TooltipTrigger asChild>
                  <Link href={item.href} aria-label={item.label}>
                    <IconButton active={active}>
                      <Icon className="size-4" />
                    </IconButton>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
    </aside>
  );
}
