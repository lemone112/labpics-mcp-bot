"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Handshake,
  LayoutDashboard,
  MessageSquareText,
  ShieldAlert,
  Sparkles,
  Wallet,
} from "lucide-react";

import { cn } from "@/lib/utils";

const MOBILE_BUSINESS_ITEMS = [
  { key: "dashboard", label: "Дашборд", href: "/control-tower/dashboard", icon: LayoutDashboard },
  { key: "messages", label: "Переписки", href: "/control-tower/messages", icon: MessageSquareText },
  { key: "agreements", label: "Договоренности", href: "/control-tower/agreements", icon: Handshake },
  { key: "risks", label: "Риски", href: "/control-tower/risks", icon: ShieldAlert },
  { key: "finance", label: "Финансы", href: "/control-tower/finance", icon: Wallet },
  { key: "offers", label: "Офферы", href: "/control-tower/offers", icon: Sparkles },
];

const KNOWN_ROOT_SEGMENTS = [
  "control-tower",
  "projects",
  "jobs",
  "search",
  "crm",
  "signals",
  "offers",
  "digests",
  "analytics",
  "login",
];

function resolveBasePrefix(pathname) {
  const path = String(pathname || "");
  const rootsPattern = KNOWN_ROOT_SEGMENTS.join("|");
  const match = path.match(new RegExp(`^(.*?)/(?:${rootsPattern})(?:/|$)`));
  if (!match) return "";
  return String(match[1] || "");
}

function withPrefix(prefix, href) {
  return prefix ? `${prefix}${href}` : href;
}

export function MobileControlTowerTabbar() {
  const pathname = usePathname();
  const prefix = resolveBasePrefix(pathname);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-[60] border-t bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-lg backdrop-blur md:hidden">
      <div className="grid grid-cols-6">
        {MOBILE_BUSINESS_ITEMS.map((item) => {
          const Icon = item.icon;
          const targetHref = withPrefix(prefix, item.href);
          const active = pathname === targetHref || pathname.startsWith(`${targetHref}/`);
          return (
            <Link
              key={item.key}
              href={targetHref}
              aria-label={item.label}
              className={cn(
                "flex h-14 items-center justify-center text-muted-foreground transition-colors hover:text-foreground",
                active && "text-primary"
              )}
            >
              <Icon className="size-5" />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
