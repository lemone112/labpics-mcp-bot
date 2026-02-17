import { AppSidebar } from "@/components/app-sidebar";
import { MotionGroup } from "@/components/ui/motion-group";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

export function PageShell({ title, subtitle, children }) {
  return (
    <div className="min-h-screen bg-background">
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur lg:px-6">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <div>
              <h2 className="text-lg font-semibold leading-tight lg:text-xl">{title}</h2>
              {subtitle ? <p className="text-xs text-muted-foreground lg:text-sm">{subtitle}</p> : null}
            </div>
          </header>
          <MotionGroup className="space-y-4 p-4 lg:p-6">
            <div className="space-y-4">{children}</div>
          </MotionGroup>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
