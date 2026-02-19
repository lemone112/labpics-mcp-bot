"use client";

import { memo, useMemo } from "react";
import { AlertTriangle, Clock3 } from "lucide-react";

import { ProjectBadge } from "@/components/project-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { numberValue, formatHumanDateRu, formatRelativeTimeRu, EMPTY_WIZARD, PRIMARY_CTA } from "../lib/formatters";

function formatRiskSourceRu(source) {
  const key = String(source || "").trim().toLowerCase();
  if (key === "risk_radar") return "Радар риска";
  if (key === "risk_pattern") return "Паттерн";
  if (key === "signal") return "Сигнал";
  return "Источник";
}

function formatRiskSeverityMeta(severityValue) {
  const severity = Math.max(0, Math.round(numberValue(severityValue)));
  if (severity >= 5) return { label: "Критическое влияние", className: "border-destructive/35 bg-destructive/10 text-destructive" };
  if (severity >= 4) return { label: "Высокое влияние", className: "border-warning/30 bg-warning/10 text-warning" };
  if (severity >= 3) return { label: "Среднее влияние", className: "border-warning/20 bg-warning/5 text-warning" };
  if (severity >= 2) return { label: "Низкое влияние", className: "border-border bg-muted text-muted-foreground" };
  return { label: "Минимальное влияние", className: "border-border bg-muted text-muted-foreground" };
}

function formatRiskProbabilityMeta(probabilityValue) {
  const probabilityPct = Math.round(numberValue(probabilityValue) * 100);
  if (probabilityPct >= 70) {
    return { label: `Вероятность ${probabilityPct}%`, className: "border-destructive/35 bg-destructive/10 text-destructive" };
  }
  if (probabilityPct >= 40) {
    return { label: `Вероятность ${probabilityPct}%`, className: "border-warning/30 bg-warning/10 text-warning" };
  }
  return { label: `Вероятность ${Math.max(0, probabilityPct)}%`, className: "border-border bg-muted text-muted-foreground" };
}

function formatRiskTitleRu(rawTitle) {
  const title = String(rawTitle || "").trim();
  if (!title) return "Риск без названия";
  if (title === "Project delivery/commercial risk composite") return "Комбинированный риск delivery и коммерции";
  if (title === "Delivery risk pattern cluster") return "Кластер паттернов delivery-риска";
  return title;
}

function compactUniqueRisks(risks, max = 12) {
  if (!Array.isArray(risks)) return [];
  const sorted = [...risks].sort((left, right) => {
    const rightTs = right?.updated_at ? Date.parse(right.updated_at) : 0;
    const leftTs = left?.updated_at ? Date.parse(left.updated_at) : 0;
    if (rightTs !== leftTs) return rightTs - leftTs;
    return numberValue(right?.severity) - numberValue(left?.severity);
  });
  const seen = new Set();
  const compacted = [];
  for (const risk of sorted) {
    const dedupeKey = [
      String(risk?.project_id || ""),
      String(risk?.source || ""),
      String(risk?.title || "").trim().toLowerCase(),
    ].join("|");
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    compacted.push(risk);
    if (compacted.length >= max) break;
  }
  return compacted;
}

export const RisksSection = memo(function RisksSection({ risks, isAllProjects }) {
  const visibleRisks = useMemo(() => compactUniqueRisks(risks, 12), [risks]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Показано {visibleRisks.length} из {Array.isArray(risks) ? risks.length : 0} рисков. Дубликаты автоматически свернуты.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {visibleRisks.map((risk) => {
        const severityMeta = formatRiskSeverityMeta(risk.severity);
        const probabilityMeta = formatRiskProbabilityMeta(risk.probability);
        const updatedAt = formatHumanDateRu(risk.updated_at);
        const relativeTime = formatRelativeTimeRu(risk.updated_at);
        return (
        <Card key={`${risk.source}-${risk.id}`} data-motion-item>
          <CardContent className="space-y-3 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {isAllProjects ? <ProjectBadge projectId={risk.project_id} projectName={risk.project_name} /> : <Badge variant="outline">{risk.project_name}</Badge>}
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{formatRiskSourceRu(risk.source)}</Badge>
                <Badge className={cn("border", severityMeta.className)}>{severityMeta.label}</Badge>
              </div>
            </div>
            <p className="text-sm font-medium leading-snug">{formatRiskTitleRu(risk.title)}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={cn("border", probabilityMeta.className)}>
                <AlertTriangle className="mr-1 size-3.5" />
                {probabilityMeta.label}
              </Badge>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Clock3 className="size-3.5" />
                {updatedAt}
                {relativeTime ? ` (${relativeTime})` : ""}
              </span>
            </div>
          </CardContent>
        </Card>
      );
      })}
      {!visibleRisks.length ? (
        <EmptyState
          title="Риски"
          reason={EMPTY_WIZARD.risks.reason}
          steps={EMPTY_WIZARD.risks.steps}
          primaryAction={<Button>{PRIMARY_CTA.risks}</Button>}
        />
      ) : null}
      </div>
    </div>
  );
});
