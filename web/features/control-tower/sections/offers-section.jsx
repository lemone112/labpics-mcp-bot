"use client";

import { memo } from "react";

import { ProjectBadge } from "@/components/project-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { numberValue, EMPTY_WIZARD, PRIMARY_CTA } from "../lib/formatters";

export const OffersSection = memo(function OffersSection({ payload, isAllProjects, moneyFormatter }) {
  const offers = payload?.offers || { upsell: [], recent_offers: [], discount_policy: [] };
  const loopsStats = payload?.loops || { contacts_with_email: 0, unique_emails: 0 };

  return (
    <div className="space-y-4">
      <Card data-motion-item>
        <CardHeader><CardTitle>Loops база</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Контактов с email: {numberValue(loopsStats.contacts_with_email)}, уникальных email: {numberValue(loopsStats.unique_emails)}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card data-motion-item>
          <CardHeader><CardTitle>Возможности допродажи</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(offers.upsell || []).map((item) => (
              <div key={item.id} className="rounded-md border p-2">
                <div className="mb-1 flex items-center justify-between gap-2">
                  {isAllProjects ? <ProjectBadge projectId={item.project_id} projectName={item.project_name} /> : <Badge variant="outline">{item.project_name}</Badge>}
                  <Badge variant="secondary">{Math.round(numberValue(item.score) * 100)}%</Badge>
                </div>
                <p className="text-sm">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.rationale || "Без описания"}</p>
              </div>
            ))}
            {!offers.upsell?.length ? (
              <EmptyState
                title="Возможности допродажи"
                reason={EMPTY_WIZARD.offers.reason}
                steps={EMPTY_WIZARD.offers.steps}
                primaryAction={<Button>{PRIMARY_CTA.offers}</Button>}
              />
            ) : null}
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader><CardTitle>Политика скидок</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(offers.discount_policy || []).map((item) => (
              <div key={item.project_id} className="rounded-md border p-2">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <ProjectBadge projectId={item.project_id} projectName={item.project_name} />
                  <Badge variant="outline">Макс. скидка {numberValue(item.max_discount_pct)}%</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Ценность клиента: {numberValue(item.client_value_score)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card data-motion-item>
        <CardHeader><CardTitle>Последние офферы</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(offers.recent_offers || []).map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
              <div>
                <p className="text-sm">{item.title}</p>
                {isAllProjects ? (
                  <ProjectBadge projectId={item.project_id} projectName={item.project_name} className="mt-1" />
                ) : (
                  <p className="text-xs text-muted-foreground">{item.project_name}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm">{moneyFormatter.format(numberValue(item.total))}</p>
                <p className="text-xs text-muted-foreground">Скидка {numberValue(item.discount_pct)}%</p>
              </div>
            </div>
          ))}
          {!offers.recent_offers?.length ? (
            <EmptyState
              title="Последние офферы"
              reason={EMPTY_WIZARD.offers.reason}
              steps={EMPTY_WIZARD.offers.steps}
              primaryAction={<Button>{PRIMARY_CTA.offers}</Button>}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
});
