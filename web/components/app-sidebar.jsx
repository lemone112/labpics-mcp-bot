"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChartIcon,
  ChatBubbleIcon,
  ClockIcon,
  DashboardIcon,
  ExitIcon,
  FileTextIcon,
  IdCardIcon,
  MagnifyingGlassIcon,
  ReaderIcon,
  RocketIcon,
} from "@radix-ui/react-icons";

import { ThemeToggle } from "@/components/theme-toggle";
import { apiFetch } from "@/lib/api";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const NAV_ITEMS = [
  { href: "/control-tower", label: "Control Tower", icon: DashboardIcon },
  { href: "/projects", label: "Projects", icon: RocketIcon },
  { href: "/jobs", label: "Jobs", icon: ClockIcon },
  { href: "/search", label: "Search", icon: MagnifyingGlassIcon },
  { href: "/crm", label: "CRM", icon: IdCardIcon },
  { href: "/signals", label: "Signals", icon: ChatBubbleIcon },
  { href: "/offers", label: "Offers", icon: FileTextIcon },
  { href: "/digests", label: "Digests", icon: ReaderIcon },
  { href: "/analytics", label: "Analytics", icon: BarChartIcon },
];

export function AppSidebar(props) {
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
    <Sidebar collapsible="icon" variant="floating" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/control-tower">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <DashboardIcon className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">Labpics</span>
                  <span className="text-xs text-sidebar-foreground/70">Operations workspace</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarMenu>
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
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
            <div className="flex items-center justify-between rounded-md border border-sidebar-border/70 px-2 py-1.5 group-data-[collapsible=icon]:hidden">
              <span className="text-xs text-sidebar-foreground/80">Theme</span>
              <ThemeToggle />
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onLogout} tooltip="Logout">
              <ExitIcon />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
