"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const SECTION_ITEMS = [
  { id: "dashboard", label: "Дашборд", icon: LayoutDashboard },
  { id: "messages", label: "Переписки", icon: MessageSquareText },
  { id: "agreements", label: "Договоренности", icon: Handshake },
  { id: "risks", label: "Риски", icon: ShieldAlert },
  { id: "finance", label: "Финансы и юнит-экономика", icon: Wallet },
  { id: "offers", label: "Офферы и допродажи", icon: Sparkles },
];

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
  const [activeSection, setActiveSection] = useState("dashboard");

  useEffect(() => {
    if (pathname !== "/control-tower") {
      setActiveSection("");
      return;
    }
    const syncFromHash = () => {
      const currentHash = String(window.location.hash || "").replace(/^#/, "") || "dashboard";
      const isKnown = SECTION_ITEMS.some((item) => item.id === currentHash);
      setActiveSection(isKnown ? currentHash : "dashboard");
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, [pathname]);

  return (
    <aside className="flex h-svh w-14 shrink-0 flex-col items-center justify-between border-r bg-sidebar py-3">
      <TooltipProvider delayDuration={50}>
        <div className="flex w-full flex-col items-center gap-1">
          {SECTION_ITEMS.map((item) => {
            const Icon = item.icon;
            const href = `/control-tower#${item.id}`;
            const active = pathname === "/control-tower" && activeSection === item.id;
            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <Link href={href} aria-label={item.label}>
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
