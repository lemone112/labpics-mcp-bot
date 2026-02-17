"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";

const items = [
  { href: "/projects", label: "Projects" },
  { href: "/jobs", label: "Jobs" },
  { href: "/search", label: "Search" },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function onLogout() {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <aside className="w-full max-w-56 border-r border-slate-800 bg-slate-950/95 p-4">
      <div className="mb-6">
        <h1 className="text-base font-semibold text-slate-100">LABPICS MVP</h1>
        <p className="mt-1 text-xs text-slate-500">Fastify + pgvector</p>
      </div>

      <nav className="space-y-1">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "block rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-cyan-500/20 text-cyan-200"
                  : "text-slate-300 hover:bg-slate-800 hover:text-slate-100"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-8">
        <Button variant="outline" className="w-full" onClick={onLogout}>
          Logout
        </Button>
      </div>
    </aside>
  );
}
