"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { animate, stagger } from "animejs";

import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { MOTION, motionEnabled } from "@/lib/motion";

const items = [
  { href: "/projects", label: "Projects" },
  { href: "/control-tower", label: "Control Tower" },
  { href: "/jobs", label: "Jobs" },
  { href: "/search", label: "Search" },
  { href: "/crm", label: "CRM" },
  { href: "/signals", label: "Signals" },
  { href: "/offers", label: "Offers" },
  { href: "/digests", label: "Digests" },
  { href: "/analytics", label: "Analytics" },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const navRef = useRef(null);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav || typeof window === "undefined") return undefined;
    if (!motionEnabled()) return undefined;

    const links = nav.querySelectorAll("[data-nav-item]");
    if (!links.length) return undefined;

    const animation = animate(links, {
      opacity: [0, 1],
      translateX: [-6, 0],
      delay: stagger(MOTION.stagger.base),
      duration: MOTION.durations.base,
      ease: MOTION.easing.standard,
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

      <p className="mb-2 px-2 text-xs text-[var(--text-subtle)]">Navigation</p>
      <nav ref={navRef} className="space-y-1.5">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
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
