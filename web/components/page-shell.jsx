"use client";

import { useState } from "react";
import { PanelLeft } from "lucide-react";

import { MobileControlTowerTabbar } from "@/components/mobile-control-tower-tabbar";
import { NavRail } from "@/components/nav-rail";
import { ProjectSidebar, ProjectSidebarPanel } from "@/components/project-sidebar";
import { MotionGroup } from "@/components/ui/motion-group";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent } from "@/components/ui/sheet";

const PAGE_TITLES_RU = {
  "Control Tower": "Центр управления",
  "Signals + NBA": "Сигналы и NBA",
  Offers: "Офферы",
  "Offers + Outbox": "Офферы и исходящие",
  Digests: "Дайджесты",
  Analytics: "Аналитика",
  "Analytics + Risk": "Аналитика и риски",
  Projects: "Проекты",
  Jobs: "Задачи",
  Search: "Поиск",
  CRM: "CRM",
  Signals: "Сигналы",
};

export function PageShell({ title, subtitle, children }) {
  const pageTitle = PAGE_TITLES_RU[title] ?? title;
  const [projectsSidebarOpen, setProjectsSidebarOpen] = useState(true);
  const [mobileProjectsSheetOpen, setMobileProjectsSheetOpen] = useState(false);

  return (
    <div className="flex h-svh w-full overflow-hidden bg-background">
      <NavRail />
      <div className="flex min-w-0 flex-1 overflow-hidden">
        <ProjectSidebar open={projectsSidebarOpen} />
        <Sheet open={mobileProjectsSheetOpen} onOpenChange={setMobileProjectsSheetOpen}>
          <SheetContent side="left" className="w-[18.5rem] border-r bg-sidebar p-0 md:hidden">
            <ProjectSidebarPanel open onRequestClose={() => setMobileProjectsSheetOpen(false)} />
          </SheetContent>
        </Sheet>
        <main className="flex h-svh min-w-0 flex-1 flex-col overflow-hidden">
          <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="hidden size-7 md:inline-flex"
              onClick={() => setProjectsSidebarOpen((open) => !open)}
            >
              <PanelLeft className="size-4" />
              <span className="sr-only">Переключить список проектов</span>
            </Button>
            <Button type="button" variant="ghost" size="icon" className="size-7 md:hidden" onClick={() => setMobileProjectsSheetOpen(true)}>
              <PanelLeft className="size-4" />
              <span className="sr-only">Открыть список проектов</span>
            </Button>
            <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/control-tower/dashboard">Портфель</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <MotionGroup className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 pb-24 pt-0 md:pb-4 lg:p-6 lg:pb-6 lg:pt-0">
            <div className="space-y-4">
              {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
              {children}
            </div>
          </MotionGroup>
        </main>
      </div>
      <MobileControlTowerTabbar />
    </div>
  );
}
