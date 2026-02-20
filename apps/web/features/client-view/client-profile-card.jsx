"use client";

import { Mail, Phone, Building2, Calendar, ExternalLink } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// ── Avatar ─────────────────────────────────────────────────────

function ClientAvatar({ name, avatarUrl, size = "md" }) {
  const sizeClass = size === "lg" ? "size-14" : "size-10";
  const textSize = size === "lg" ? "text-lg" : "text-sm";

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={cn(sizeClass, "rounded-full object-cover")}
      />
    );
  }

  // Fallback: initials
  const initials = String(name || "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div
      className={cn(
        sizeClass,
        "flex items-center justify-center rounded-full bg-primary/10 font-semibold text-primary",
        textSize,
      )}
    >
      {initials}
    </div>
  );
}

// ── Contact Detail ─────────────────────────────────────────────

function ContactDetail({ icon: Icon, value, href }) {
  if (!value) return null;

  const content = (
    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{value}</span>
    </span>
  );

  if (href) {
    return (
      <a href={href} className="hover:text-foreground transition-colors">
        {content}
      </a>
    );
  }

  return content;
}

// ── Loading Skeleton ───────────────────────────────────────────

function ClientProfileCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Skeleton className="size-14 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-40 rounded-sm" />
            <Skeleton className="h-3 w-24 rounded-sm" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-4 w-48 rounded-sm" />
        <Skeleton className="h-4 w-36 rounded-sm" />
        <Skeleton className="h-4 w-44 rounded-sm" />
      </CardContent>
    </Card>
  );
}

// ── Main Component ─────────────────────────────────────────────

/**
 * ClientProfileCard — displays client identity, contact info, and tags.
 *
 * @param {{
 *   profile: import("@/types/client-view").ClientProfile | null,
 *   loading?: boolean,
 *   onOpenCrm?: () => void,
 *   className?: string,
 * }} props
 */
export function ClientProfileCard({ profile, loading = false, onOpenCrm, className }) {
  if (loading) return <ClientProfileCardSkeleton />;
  if (!profile) return null;

  const firstContactDate = profile.firstContactAt
    ? new Date(profile.firstContactAt).toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <Card className={cn(className)} data-motion-item>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <ClientAvatar name={profile.name} avatarUrl={profile.avatarUrl} size="lg" />
            <div>
              <CardTitle as="h2">{profile.name}</CardTitle>
              {profile.company ? (
                <p className="mt-0.5 text-sm text-muted-foreground">{profile.company}</p>
              ) : null}
            </div>
          </div>
          {profile.externalCrmId && onOpenCrm ? (
            <Button variant="outline" size="sm" onClick={onOpenCrm}>
              <ExternalLink className="size-3.5" />
              CRM
            </Button>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <ContactDetail icon={Mail} value={profile.email} href={profile.email ? `mailto:${profile.email}` : undefined} />
          <ContactDetail icon={Phone} value={profile.phone} href={profile.phone ? `tel:${profile.phone}` : undefined} />
          <ContactDetail icon={Building2} value={profile.company} />
          {firstContactDate ? (
            <ContactDetail icon={Calendar} value={`Клиент с ${firstContactDate}`} />
          ) : null}
        </div>

        {profile.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {profile.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export { ClientAvatar };
