import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface EmptyStateProps {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
}

export function EmptyState({ title, description, actionHref, actionLabel }: EmptyStateProps) {
  return (
    <Card className="border-dashed border-slate-700/90">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {actionHref && actionLabel ? (
        <CardContent>
          <Link
            href={actionHref}
            className="inline-flex h-10 items-center justify-center rounded-md bg-cyan-400 px-4 py-2 text-sm font-medium text-slate-950 transition-colors hover:bg-cyan-300"
          >
            {actionLabel}
          </Link>
        </CardContent>
      ) : null}
    </Card>
  );
}
