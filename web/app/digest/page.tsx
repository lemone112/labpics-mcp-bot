"use client";

import { useState } from "react";

import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useProjectContext } from "@/hooks/use-project-context";
import { formatDateTime } from "@/lib/utils";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

const mockDigests = [
  {
    id: "dg-2026-w07-v2",
    created_at: "2026-02-15T18:30:00Z",
    summary:
      "Project moved into content QA. Main risk is dependency on delayed legal assets. Next week priority is alignment on revised timeline.",
    commitments: {
      new: 2,
      closed: 1,
      overdue: 1,
    },
    risks: {
      new: 1,
      escalated: 1,
    },
  },
  {
    id: "dg-2026-w06-v1",
    created_at: "2026-02-08T19:20:00Z",
    summary: "Kickoff and initial discovery completed. Scope baseline accepted by client.",
    commitments: {
      new: 3,
      closed: 0,
      overdue: 0,
    },
    risks: {
      new: 0,
      escalated: 0,
    },
  },
];

export default function DigestPage() {
  const { loading: authLoading, session } = useAuthGuard();
  const { loading: projectsLoading, projects, activeProject } = useProjectContext(
    !authLoading && Boolean(session?.authenticated)
  );
  const [selectedId, setSelectedId] = useState(mockDigests[0]?.id ?? "");
  const selected = mockDigests.find((item) => item.id === selectedId) || null;

  if (authLoading || !session || projectsLoading) {
    return <div className="p-8 text-slate-300">Loading...</div>;
  }

  return (
    <PageShell
      title="Digest"
      subtitle="Weekly management snapshot with version history."
      activeProjectName={activeProject?.name || null}
      activeProjectId={activeProject?.id || null}
      projectCount={projects.length}
      actions={
        <>
          <Badge variant="info">Roadmap API integration pending</Badge>
          <Button disabled>Generate now</Button>
        </>
      }
    >
      {!activeProject ? (
        <EmptyState
          title="Select active project"
          description="Digest is project-specific and should not mix studio-wide context."
          actionHref="/projects"
          actionLabel="Open Projects"
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1.2fr]">
          <Card>
            <CardHeader>
              <CardTitle>Digest history</CardTitle>
              <CardDescription>Versioned output for reproducible weekly summaries.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {mockDigests.map((digest) => (
                <button
                  key={digest.id}
                  onClick={() => setSelectedId(digest.id)}
                  className={`w-full rounded-md border p-3 text-left transition-colors ${
                    selectedId === digest.id ? "border-cyan-600 bg-slate-900" : "border-slate-800 hover:bg-slate-900/60"
                  }`}
                >
                  <p className="text-sm font-medium text-slate-100">{digest.id}</p>
                  <p className="mt-1 text-xs text-slate-400">{formatDateTime(digest.created_at)}</p>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Selected digest</CardTitle>
              <CardDescription>{selected ? selected.id : "No version selected"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {selected ? (
                <>
                  <p className="text-sm text-slate-200">{selected.summary}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded border border-slate-800 p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Commitments</p>
                      <p className="mt-2 text-sm text-slate-200">new: {selected.commitments.new}</p>
                      <p className="text-sm text-slate-200">closed: {selected.commitments.closed}</p>
                      <p className="text-sm text-slate-200">overdue: {selected.commitments.overdue}</p>
                    </div>
                    <div className="rounded border border-slate-800 p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Risks</p>
                      <p className="mt-2 text-sm text-slate-200">new: {selected.risks.new}</p>
                      <p className="text-sm text-slate-200">escalated: {selected.risks.escalated}</p>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-400">No digest selected.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </PageShell>
  );
}
