"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { animate, stagger } from "animejs";

import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { useProjectContext } from "@/hooks/use-project-context";
import { Button } from "@/components/ui/button";

const items = [
  { href: "/projects", label: "Projects" },
  { href: "/jobs", label: "Jobs" },
  { href: "/search", label: "Search" },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const navRef = useRef(null);
  const { loading: projectLoading, activeProject, error: projectError } = useProjectContext(true);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav || typeof window === "undefined") return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    const links = nav.querySelectorAll("[data-nav-item]");
    if (!links.length) return undefined;

    const animation = animate(links, {
      opacity: [0, 1],
      translateX: [-6, 0],
      delay: stagger(45),
      duration: 360,
      ease: "outQuad",
    });

    return () => {
      animation.cancel();
    };
  }, []);

  async function onLogout() {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <aside className="flex w-full max-w-56 shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--surface-2)] p-3">
      <div className="mb-4 border-b border-[var(--border-subtle)] px-2 pb-3">
        <h1 className="text-sm font-semibold text-[var(--text-strong)]">Labpics</h1>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">Operations workspace</p>
      </div>

      <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-2.5 py-2">
        <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-subtle)]">Active project</p>
        <p className="mt-1 line-clamp-2 text-sm font-medium text-[var(--text-strong)]">
          {projectLoading ? "Loading..." : activeProject?.name || "Not selected"}
        </p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          {projectError
            ? "Unable to read scope. Open Projects to restore context."
            : activeProject
              ? "All operational actions should stay within this project."
              : "Select a project before running jobs or search."}
        </p>
        <Link
          href="/projects"
          className="mt-2 inline-flex rounded-[var(--radius-sm)] border border-[var(--border-subtle)] px-2 py-1 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-soft)]"
        >
          Switch project
        </Link>
      </div>

      <p className="mb-2 px-2 text-xs text-[var(--text-subtle)]">Navigation</p>
      <nav ref={navRef} className="space-y-1.5">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              data-nav-item
              className={cn(
                "block rounded-[var(--radius-sm)] border px-2.5 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "border-[var(--border-subtle)] bg-[var(--surface-1)] text-[var(--text-strong)]"
                  : "border-transparent text-[var(--text-primary)] hover:border-[var(--border-subtle)] hover:bg-[var(--surface-1)]"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-[var(--border-subtle)] px-2 pt-3">
        <Button variant="secondary" className="w-full justify-start" onClick={onLogout}>
          Logout
        </Button>
      </div>
    </aside>
  );
}
