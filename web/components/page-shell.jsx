import { AppSidebar } from "@/components/app-sidebar";
import { MotionGroup } from "@/components/ui/motion-group";

export function PageShell({ title, subtitle, children }) {
  return (
    <div className="relative min-h-screen text-[var(--text-primary)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_20%_0%,rgba(99,91,255,0.14),transparent_58%)]" />
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px] px-4 py-4 lg:px-7 lg:py-6">
        <AppSidebar />

        <main className="flex-1 pl-5 lg:pl-7">
          <MotionGroup className="space-y-6">
            <header
              data-motion-item
              className="app-surface relative overflow-hidden rounded-[var(--radius-lg)] border px-6 py-5"
            >
              <div className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(99,91,255,0.16),transparent_66%)]" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--brand-500)]">Operations workspace</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-[var(--text-strong)]">
                {title}
              </h2>
              {subtitle ? (
                <p className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p>
              ) : null}
            </header>

            <div className="space-y-6">{children}</div>
          </MotionGroup>
        </main>
      </div>
    </div>
  );
}
