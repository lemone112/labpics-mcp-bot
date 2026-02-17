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
  Moon,
  Newspaper,
  Radar,
  Search,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";

import { apiFetch } from "@/lib/api";
import { Switch } from "@/components/ui/switch";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

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

export function AppSidebar(props) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const darkEnabled = theme === "dark" || (theme === "system" && resolvedTheme === "dark");

  async function onLogout() {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <Sidebar variant="floating" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/control-tower">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <LayoutDashboard className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">Labpics</span>
                  <span className="text-xs text-sidebar-foreground/70">Операционная панель</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu className="gap-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={active}>
                    <Link href={item.href}>
                      <Icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center justify-between rounded-md border border-sidebar-border px-2 py-1.5">
              <div className="flex items-center gap-2 text-xs text-sidebar-foreground/90">
                {darkEnabled ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
                <span>Тёмная тема</span>
              </div>
              <Switch
                checked={darkEnabled}
                onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
                aria-label="Переключить тему"
              />
            </div>
            <p className="px-1 pt-1 text-xs text-sidebar-foreground/70">По умолчанию используется системная тема.</p>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onLogout}>
              <LogOut />
              <span>Выйти</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
