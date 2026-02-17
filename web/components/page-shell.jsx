import { AppSidebar } from "@/components/app-sidebar";
import { MotionGroup } from "@/components/ui/motion-group";

export function PageShell({ title, subtitle, children }) {
  return (
    <div className="min-h-screen bg-background px-4 py-4 lg:px-6 lg:py-6">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-[1440px] overflow-hidden rounded-xl border bg-card shadow-sm">
        <AppSidebar />

        <main className="flex-1">
          <MotionGroup className="space-y-4 p-5 lg:p-6">
            <header data-motion-item className="border-b pb-3">
              <h2 className="text-2xl font-semibold">{title}</h2>
              {subtitle ? (
                <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
              ) : null}
            </header>

            <div className="space-y-4">{children}</div>
          </MotionGroup>
        </main>
      </div>
    </div>
  );
}
