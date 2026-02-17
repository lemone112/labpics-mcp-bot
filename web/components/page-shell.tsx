"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import { AppSidebar } from "@/components/app-sidebar";
import { Badge } from "@/components/ui/badge";

interface PageShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
  activeProjectName?: string | null;
  activeProjectId?: string | null;
  projectCount?: number;
}

export function PageShell({
  title,
  subtitle,
  children,
  actions,
  activeProjectName = null,
  activeProjectId = null,
  projectCount = 0,
}: PageShellProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#0b1220,_#020617_42%)] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <AppSidebar
          activeProjectName={activeProjectName}
          activeProjectId={activeProjectId}
          projectCount={projectCount}
        />

        <main className="w-full flex-1">
          <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/90 px-4 py-4 backdrop-blur md:px-6 lg:px-8">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
                  {activeProjectName ? (
                    <Badge variant="success">{activeProjectName}</Badge>
                  ) : (
                    <Badge variant="warning">No active project</Badge>
                  )}
                </div>
                {subtitle ? <p className="text-sm text-slate-400">{subtitle}</p> : null}
                {!activeProjectName ? (
                  <div className="pt-1">
                    <Link
                      href="/projects"
                      className="inline-flex h-8 items-center rounded-md border border-slate-700 px-3 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-900"
                    >
                      Select project
                    </Link>
                  </div>
                ) : (
                  <p className="font-mono text-xs text-slate-500">{activeProjectId}</p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {actions}
              </div>
            </div>
          </header>

          <div className="px-4 py-5 md:px-6 lg:px-8 lg:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
