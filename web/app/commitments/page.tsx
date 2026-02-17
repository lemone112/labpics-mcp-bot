"use client";

import { useMemo, useState } from "react";

import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useProjectContext } from "@/hooks/use-project-context";
import { formatDateTime } from "@/lib/utils";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

type CommitmentStatus = "active" | "proposed" | "closed";

interface CommitmentItem {
  id: string;
  title: string;
  owner: string;
  due_at: string;
  status: CommitmentStatus;
  confidence: "high" | "medium";
  evidence: string[];
  summary: string;
}

const mockCommitments: CommitmentItem[] = [
  {
    id: "cmp-1",
    title: "Send updated design concept package",
    owner: "Studio",
    due_at: "2026-02-19T10:00:00Z",
    status: "active",
    confidence: "high",
    evidence: ["cwmsg:1:3453", "cwmsg:1:3461"],
    summary: "Client explicitly asked to receive v3 design package before Friday.",
  },
  {
    id: "cmp-2",
    title: "Client to provide legal copy for landing page",
    owner: "Client",
    due_at: "2026-02-20T14:00:00Z",
    status: "proposed",
    confidence: "medium",
    evidence: ["cwmsg:1:3478"],
    summary: "Phrasing is tentative and requires PM confirmation.",
  },
  {
    id: "cmp-3",
    title: "Finalize analytics tagging checklist",
    owner: "Studio",
    due_at: "2026-02-10T11:00:00Z",
    status: "closed",
    confidence: "high",
    evidence: ["cwmsg:1:3299", "cwmsg:1:3320"],
    summary: "Marked done after QA sign-off in conversation thread.",
  },
];

export default function CommitmentsPage() {
  const { loading: authLoading, session } = useAuthGuard();
  const { loading: projectsLoading, projects, activeProject } = useProjectContext(
    !authLoading && Boolean(session?.authenticated)
  );
  const [selectedId, setSelectedId] = useState(mockCommitments[0]?.id ?? "");
  const selected = useMemo(() => mockCommitments.find((item) => item.id === selectedId) || null, [selectedId]);

  if (authLoading || !session || projectsLoading) {
    return <div className="p-8 text-slate-300">Loading...</div>;
  }

  return (
    <PageShell
      title="Commitments"
      subtitle="List -> details interaction prepared for confirmation workflow."
      activeProjectName={activeProject?.name || null}
      activeProjectId={activeProject?.id || null}
      projectCount={projects.length}
      actions={<Badge variant="info">Roadmap API integration pending</Badge>}
    >
      {!activeProject ? (
        <EmptyState
          title="Select active project"
          description="Commitments must remain project-scoped. Select project before triage."
          actionHref="/projects"
          actionLabel="Open Projects"
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Commitment queue</CardTitle>
              <CardDescription>Prototype data for interaction and information architecture.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {mockCommitments.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full rounded-md border p-3 text-left transition-colors ${
                    selectedId === item.id ? "border-cyan-600 bg-slate-900" : "border-slate-800 hover:bg-slate-900/60"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-100">{item.title}</p>
                    <Badge
                      variant={item.status === "active" ? "success" : item.status === "proposed" ? "warning" : "default"}
                    >
                      {item.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-400">Due: {formatDateTime(item.due_at)}</p>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
              <CardDescription>Evidence-first detail panel (prototype).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {selected ? (
                <>
                  <p className="text-sm text-slate-200">{selected.summary}</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded border border-slate-800 p-2">
                      <p className="text-slate-500">Owner</p>
                      <p>{selected.owner}</p>
                    </div>
                    <div className="rounded border border-slate-800 p-2">
                      <p className="text-slate-500">Confidence</p>
                      <p>{selected.confidence}</p>
                    </div>
                  </div>
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
                      Confirm
                    </Button>
                    <Button size="sm" variant="secondary" disabled>
                      Mark done
                    </Button>
                    <Button size="sm" variant="outline" disabled>
                      Edit
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-400">Select commitment from list.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </PageShell>
  );
}
