"use client";

import { memo } from "react";

import { ProjectBadge } from "@/components/project-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile } from "@/components/ui/stat-tile";
import { EMPTY_WIZARD, PRIMARY_CTA } from "../lib/formatters";

export const AgreementsSection = memo(function AgreementsSection({ agreements, isAllProjects }) {
  const totalCount = agreements.length;
  const projectCount = new Set(agreements.map((a) => a.project_id)).size;

  return (
    <div className="space-y-4">
      {totalCount > 0 ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <StatTile label="Всего договоренностей" value={totalCount} />
          <StatTile label="Проектов" value={projectCount} />
          <StatTile label="Последняя" value={agreements[0]?.created_at ? new Date(agreements[0].created_at).toLocaleDateString("ru-RU") : "-"} />
        </div>
      ) : null}
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {agreements.map((item) => (
        <Card key={item.id} data-motion-item>
          <CardContent className="space-y-2 pt-4">
            <div className="flex items-center justify-between gap-2">
              {isAllProjects ? <ProjectBadge projectId={item.project_id} projectName={item.project_name} /> : <Badge variant="outline">{item.project_name}</Badge>}
              <span className="text-xs text-muted-foreground">{item.created_at ? new Date(item.created_at).toLocaleDateString("ru-RU") : "-"}</span>
            </div>
            <p className="text-sm">{item.summary}</p>
            <p className="text-xs text-muted-foreground">
              {item.source_table} • {item.source_pk}
            </p>
          </CardContent>
        </Card>
      ))}
      {!agreements.length ? (
        <EmptyState
          title="Договоренности"
          reason={EMPTY_WIZARD.agreements.reason}
          steps={EMPTY_WIZARD.agreements.steps}
          primaryAction={<Button>{PRIMARY_CTA.agreements}</Button>}
        />
      ) : null}
    </div>
    </div>
  );
});
