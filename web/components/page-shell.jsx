"use client";

import { useState } from "react";
import { PanelLeft } from "lucide-react";

import { NavRail } from "@/components/nav-rail";
import { ProjectSidebar } from "@/components/project-sidebar";
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

  return (
    <div className="flex h-svh w-full overflow-hidden bg-background">
      <NavRail />
      <div className="flex min-w-0 flex-1 overflow-hidden">
        <ProjectSidebar open={projectsSidebarOpen} />
        <main className="flex h-svh min-w-0 flex-1 flex-col overflow-hidden">
          <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => setProjectsSidebarOpen((open) => !open)}
            >
              <PanelLeft className="size-4" />
              <span className="sr-only">Переключить список проектов</span>
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

          <MotionGroup className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 pt-0 lg:p-6 lg:pt-0">
            <div className="space-y-4">
              {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
              {children}
            </div>
          </MotionGroup>
        </main>
      </div>
    </div>
  );
}
