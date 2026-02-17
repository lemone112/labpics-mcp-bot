import { AppSidebar } from "@/components/app-sidebar";

export function PageShell({ title, subtitle, children }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl">
        <AppSidebar />

        <main className="flex-1 p-6">
          <header className="mb-6">
            <h2 className="text-2xl font-semibold">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
          </header>

          {children}
        </main>
      </div>
    </div>
  );
}
