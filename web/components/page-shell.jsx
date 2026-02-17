import { AppSidebar } from "@/components/app-sidebar";
import { MotionGroup } from "@/components/ui/motion-group";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

const SIDEBAR_PROVIDER_STYLE = {
  "--sidebar-width": "19rem",
};

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
  return (
    <SidebarProvider style={SIDEBAR_PROVIDER_STYLE}>
      <AppSidebar collapsible="offcanvas" />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink href="/control-tower">Разделы</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <MotionGroup className="flex flex-1 flex-col gap-4 p-4 pt-0 lg:p-6 lg:pt-0">
          <div className="space-y-4">{children}</div>
        </MotionGroup>
      </SidebarInset>
    </SidebarProvider>
  );
}
