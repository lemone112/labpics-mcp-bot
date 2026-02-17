import { AppSidebar } from "@/components/app-sidebar";
import { MotionGroup } from "@/components/ui/motion-group";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

export function PageShell({ title, subtitle, children }) {
  return (
    <div className="min-h-screen bg-background">
      <SidebarProvider style={{ "--sidebar-width": "17rem" }}>
        <AppSidebar />
        <SidebarInset>
          <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-1 h-4" />
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold lg:text-xl">{title}</h2>
              {subtitle ? <p className="truncate text-xs text-muted-foreground lg:text-sm">{subtitle}</p> : null}
            </div>
          </header>

          <MotionGroup className="flex-1 p-4 lg:p-6">
            <div className="space-y-4">{children}</div>
          </MotionGroup>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
