"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { animate, stagger } from "animejs";

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
  const navRef = useRef(null);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav || typeof window === "undefined") return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    const links = nav.querySelectorAll("[data-nav-item]");
    if (!links.length) return undefined;

    const animation = animate(links, {
      opacity: [0, 1],
      translateX: [-10, 0],
      delay: stagger(55),
      duration: 540,
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
    <aside className="app-surface-elevated sticky top-4 flex h-[calc(100vh-2rem)] w-full max-w-64 flex-col rounded-[var(--radius-lg)] p-4">
      <div className="mb-6 border-b border-[var(--border-subtle)] pb-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-accent)] bg-[rgba(99,91,255,0.08)] px-2 py-1">
          <span className="h-2 w-2 rounded-full bg-[var(--brand-400)]" />
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--brand-500)]">Workspace</span>
        </div>
        <h1 className="mt-3 text-sm font-semibold tracking-[0.08em] text-[var(--text-strong)]">
          LABPICS CONSOLE
        </h1>
        <p className="mt-1 text-xs text-[var(--text-muted)]">Fastify + pgvector + Hero UI</p>
      </div>

      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.09em] text-[var(--text-subtle)]">
        Navigation
      </p>
      <nav ref={navRef} className="space-y-1.5">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              data-nav-item
              className={cn(
                "block rounded-[var(--radius-sm)] border px-3 py-2 text-sm font-medium transition-all",
                active
                  ? "border-[var(--border-accent)] bg-[rgba(99,91,255,0.08)] text-[var(--brand-500)] shadow-[var(--shadow-glow)]"
                  : "border-transparent text-[var(--text-primary)] hover:border-[var(--border-subtle)] hover:bg-[rgba(99,91,255,0.04)]"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-[var(--border-subtle)] pt-4">
        <Button variant="outline" className="w-full" onClick={onLogout}>
          Logout
        </Button>
      </div>
    </aside>
  );
}
