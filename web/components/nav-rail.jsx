"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  BriefcaseBusiness,
  FileText,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Newspaper,
  Radar,
  Search,
} from "lucide-react";

import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const NAV_ITEMS = [
  { href: "/control-tower", label: "Центр управления", icon: LayoutDashboard },
  { href: "/projects", label: "Проекты", icon: FolderKanban },
  { href: "/jobs", label: "Задачи", icon: ListChecks },
  { href: "/search", label: "Поиск", icon: Search },
  { href: "/crm", label: "CRM", icon: BriefcaseBusiness },
  { href: "/signals", label: "Сигналы", icon: Radar },
  { href: "/offers", label: "Офферы", icon: FileText },
  { href: "/digests", label: "Дайджесты", icon: Newspaper },
  { href: "/analytics", label: "Аналитика", icon: BarChart3 },
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
  const router = useRouter();

  async function onLogout() {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <aside className="flex h-svh w-14 shrink-0 flex-col items-center justify-between border-r bg-sidebar py-3">
      <TooltipProvider delayDuration={50}>
        <div className="flex w-full flex-col items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Link href="/control-tower" aria-label="Labpics">
                <IconButton>
                  <LayoutDashboard className="size-4" />
                </IconButton>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">Labpics</TooltipContent>
          </Tooltip>

          <div className="my-1 h-px w-8 bg-sidebar-border" />

          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Tooltip key={item.href}>
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

        <div className="flex w-full flex-col items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" onClick={onLogout} aria-label="Выйти">
                <IconButton>
                  <LogOut className="size-4" />
                </IconButton>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Выйти</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </aside>
  );
}
