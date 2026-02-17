"use client";

import { useMemo, useState } from "react";

import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useProjectContext } from "@/hooks/use-project-context";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

type RiskStatus = "active" | "proposed" | "closed";
type RiskSeverity = "low" | "medium" | "high";

interface RiskItem {
  id: string;
  title: string;
  status: RiskStatus;
  severity: RiskSeverity;
  probability: number;
  nextAction: string;
  evidence: string[];
}

const mockRisks: RiskItem[] = [
  {
    id: "risk-1",
    title: "Timeline drift due to delayed client approvals",
    status: "active",
    severity: "high",
    probability: 0.72,
    nextAction: "Escalate with revised milestone options and explicit approval deadline.",
    evidence: ["cwmsg:1:3478", "cwmsg:1:3492"],
  },
  {
    id: "risk-2",
    title: "Scope creep in onboarding flow requests",
    status: "proposed",
    severity: "medium",
    probability: 0.56,
    nextAction: "Split additional asks into phase 2 proposal.",
    evidence: ["cwmsg:1:3401"],
  },
  {
    id: "risk-3",
    title: "No dedicated stakeholder for legal review",
    status: "closed",
    severity: "low",
    probability: 0.22,
    nextAction: "Resolved after assigning legal contact.",
    evidence: ["cwmsg:1:3332"],
  },
];

export default function RisksPage() {
  const { loading: authLoading, session } = useAuthGuard();
  const { loading: projectsLoading, projects, activeProject } = useProjectContext(
    !authLoading && Boolean(session?.authenticated)
  );
  const [selectedId, setSelectedId] = useState(mockRisks[0]?.id ?? "");
  const selected = useMemo(() => mockRisks.find((item) => item.id === selectedId) || null, [selectedId]);

  if (authLoading || !session || projectsLoading) {
    return <div className="p-8 text-slate-300">Loading...</div>;
  }

  return (
    <PageShell
      title="Risks"
      subtitle="Severity + probability + next action pattern prepared for future extraction pipeline."
      activeProjectName={activeProject?.name || null}
      activeProjectId={activeProject?.id || null}
      projectCount={projects.length}
      actions={<Badge variant="info">Roadmap API integration pending</Badge>}
    >
      {!activeProject ? (
        <EmptyState
          title="Active project required"
          description="Risks must never mix context across projects."
          actionHref="/projects"
          actionLabel="Open Projects"
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Risk radar</CardTitle>
              <CardDescription>Prototype queue with active/proposed/closed categories.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {mockRisks.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full rounded-md border p-3 text-left transition-colors ${
                    selectedId === item.id ? "border-cyan-600 bg-slate-900" : "border-slate-800 hover:bg-slate-900/60"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-100">{item.title}</p>
                    <Badge variant={item.severity === "high" ? "danger" : item.severity === "medium" ? "warning" : "default"}>
                      {item.severity}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-400">Probability: {(item.probability * 100).toFixed(0)}%</p>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
              <CardDescription>Evidence and mitigation action (prototype).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {selected ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={selected.status === "active" ? "success" : selected.status === "proposed" ? "warning" : "default"}>
                      {selected.status}
                    </Badge>
                    <Badge variant="default">p={(selected.probability * 100).toFixed(0)}%</Badge>
                  </div>
                  <p className="text-sm text-slate-200">{selected.nextAction}</p>
                  <div>
                    <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">Evidence</p>
                    <div className="space-y-1">
                      {selected.evidence.map((evidenceId) => (
                        <p key={evidenceId} className="font-mono text-xs text-cyan-200">
                          {evidenceId}
                        </p>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button size="sm" disabled>
                      Accept
                    </Button>
                    <Button size="sm" variant="secondary" disabled>
                      Mitigated
                    </Button>
                    <Button size="sm" variant="outline" disabled>
                      Dismiss
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-400">Select risk from list.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </PageShell>
  );
}
