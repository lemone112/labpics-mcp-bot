"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { logout } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const coreItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/projects", label: "Projects" },
  { href: "/conversations", label: "Conversations" },
  { href: "/jobs", label: "Jobs" },
  { href: "/search", label: "Search" },
];

const roadmapItems = [
  { href: "/commitments", label: "Commitments" },
  { href: "/risks", label: "Risks" },
  { href: "/digest", label: "Digest" },
  { href: "/settings", label: "Settings" },
];

interface AppSidebarProps {
  activeProjectName?: string | null;
  activeProjectId?: string | null;
  projectCount?: number;
}

export function AppSidebar({
  activeProjectName = null,
  activeProjectId = null,
  projectCount = 0,
}: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function onLogout() {
    try {
      await logout();
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <aside className="sticky top-0 hidden h-screen w-72 border-r border-slate-800 bg-slate-950/95 p-4 lg:block">
      <div className="mb-6 space-y-3">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Labpics</p>
          <h1 className="text-lg font-semibold text-slate-100">Ops Console</h1>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-slate-500">Active project</p>
            <Badge variant={activeProjectName ? "success" : "warning"}>{activeProjectName ? "set" : "required"}</Badge>
          </div>
          <p className="line-clamp-1 text-sm font-medium text-slate-100">{activeProjectName || "No active project selected"}</p>
          <p className="mt-1 line-clamp-1 font-mono text-[11px] text-slate-500">{activeProjectId || "Select in Projects"}</p>
          <p className="mt-2 text-xs text-slate-400">Total projects: {projectCount}</p>
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <p className="mb-2 px-2 text-[11px] uppercase tracking-[0.14em] text-slate-500">Core</p>
          <nav className="space-y-1">
            {coreItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "block rounded-md px-3 py-2 text-sm transition-colors",
                    active ? "bg-slate-800 text-cyan-200" : "text-slate-300 hover:bg-slate-900 hover:text-slate-100"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between px-2">
            <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Roadmap</p>
            <Badge variant="info">v.next</Badge>
          </div>
          <nav className="space-y-1">
            {roadmapItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "block rounded-md px-3 py-2 text-sm transition-colors",
                    active ? "bg-slate-800 text-cyan-200" : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="mt-8 border-t border-slate-800 pt-4">
        <Button variant="outline" className="w-full" onClick={onLogout}>
          Logout
        </Button>
      </div>
    </aside>
  );
}
