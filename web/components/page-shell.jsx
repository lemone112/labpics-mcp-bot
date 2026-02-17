import { AppSidebar } from "@/components/app-sidebar";
import { MotionGroup } from "@/components/ui/motion-group";

export function PageShell({ title, subtitle, children }) {
  return (
    <div className="min-h-screen bg-[var(--app-bg)] px-4 py-4 text-[var(--text-primary)] lg:px-6 lg:py-6">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-[1440px] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-1)] shadow-[var(--shadow-soft)]">
        <AppSidebar />

        <main className="flex-1">
          <MotionGroup className="space-y-5 p-5 lg:p-6">
            <header data-motion-item className="border-b border-[var(--border-subtle)] pb-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-subtle)]">
                Workspace
              </p>
              <h2 className="mt-1 text-[27px] font-semibold tracking-[-0.02em] text-[var(--text-strong)]">{title}</h2>
              {subtitle ? (
                <p className="mt-1 text-[13px] text-[var(--text-muted)]">{subtitle}</p>
              ) : null}
            </header>

            <div className="space-y-5">{children}</div>
          </MotionGroup>
        </main>
      </div>
    </div>
  );
}
