"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BriefcaseBusiness,
  LayoutDashboard,
  LogOut,
  Sparkles,
} from "lucide-react";
import { animate, stagger } from "animejs";

import { apiFetch } from "@/lib/api";
import { MOTION, motionEnabled } from "@/lib/motion";
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";

const NAV_SECTIONS = [
  {
    title: "Workspace",
    href: "/control-tower",
    icon: LayoutDashboard,
    items: [
      { title: "Control Tower", href: "/control-tower" },
      { title: "Projects", href: "/projects" },
      { title: "Jobs", href: "/jobs" },
      { title: "Search", href: "/search" },
    ],
  },
  {
    title: "Revenue",
    href: "/crm",
    icon: BriefcaseBusiness,
    items: [
      { title: "CRM", href: "/crm" },
      { title: "Signals", href: "/signals" },
      { title: "Offers", href: "/offers" },
    ],
  },
  {
    title: "Insights",
    href: "/digests",
    icon: Sparkles,
    items: [
      { title: "Digests", href: "/digests" },
      { title: "Analytics", href: "/analytics" },
    ],
  },
];

export function AppSidebar(props) {
  const pathname = usePathname();
  const router = useRouter();
  const navRef = useRef(null);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav || !motionEnabled()) return undefined;

    const targets = nav.querySelectorAll("[data-nav-item]");
    if (!targets.length) return undefined;

    const animation = animate(targets, {
      opacity: [0, 1],
      translateX: [-8, 0],
      delay: stagger(MOTION.stagger.fast),
      duration: MOTION.durations.base,
      ease: MOTION.easing.standard,
    });

    return () => {
      animation.cancel();
    };
  }, [pathname]);

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
          <SidebarMenu ref={navRef} className="gap-2">
            {NAV_SECTIONS.map((section) => {
              const Icon = section.icon;
              const sectionActive = section.items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
              return (
                <SidebarMenuItem key={section.title}>
                  <SidebarMenuButton asChild isActive={sectionActive} data-nav-item>
                    <Link href={section.href} className="font-medium">
                      <Icon />
                      <span>{section.title}</span>
                    </Link>
                  </SidebarMenuButton>
                  <SidebarMenuSub className="ml-0 border-l-0 px-1.5">
                    {section.items.map((item) => (
                      <SidebarMenuSubItem key={item.href}>
                        <SidebarMenuSubButton
                          asChild
                          isActive={pathname === item.href || pathname.startsWith(`${item.href}/`)}
                          data-nav-item
                        >
                          <Link href={item.href}>{item.title}</Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onLogout}>
              <LogOut />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
