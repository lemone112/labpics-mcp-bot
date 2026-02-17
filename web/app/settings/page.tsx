"use client";

import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useProjectContext } from "@/hooks/use-project-context";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

const integrations = [
  { name: "Chatwoot", status: "connected", note: "Source for conversations and messages" },
  { name: "Linear", status: "planned", note: "Preview/approve flow in roadmap" },
  { name: "Attio", status: "planned", note: "CRM sync with audit guardrails" },
];

const linksChecklist = [
  "Project ↔ Chatwoot inbox mapping",
  "Project ↔ Linear project mapping",
  "Project ↔ Attio company mapping",
  "Historical data migration policy warning",
];

export default function SettingsPage() {
  const { loading: authLoading, session } = useAuthGuard();
  const { loading: projectsLoading, projects, activeProject } = useProjectContext(
    !authLoading && Boolean(session?.authenticated)
  );

  if (authLoading || !session || projectsLoading) {
    return <div className="p-8 text-slate-300">Loading...</div>;
  }

  return (
    <PageShell
      title="Settings"
      subtitle="Integration and link-management scaffold for safe-by-default operation."
      activeProjectName={activeProject?.name || null}
      activeProjectId={activeProject?.id || null}
      projectCount={projects.length}
      actions={<Badge variant="info">Roadmap API integration pending</Badge>}
    >
      {!activeProject ? (
        <EmptyState
          title="Select active project"
          description="Source links and policies should be edited in the context of an active project."
          actionHref="/projects"
          actionLabel="Open Projects"
        />
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Integrations</CardTitle>
              <CardDescription>Current status for external systems.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {integrations.map((integration) => (
                <div key={integration.name} className="rounded-md border border-slate-800 p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-100">{integration.name}</p>
                    <Badge variant={integration.status === "connected" ? "success" : "warning"}>{integration.status}</Badge>
                  </div>
                  <p className="text-xs text-slate-400">{integration.note}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Project links checklist</CardTitle>
              <CardDescription>Spec 0006-driven structure for source identity mapping.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {linksChecklist.map((item) => (
                <div key={item} className="rounded-md border border-slate-800 px-3 py-2 text-sm text-slate-200">
                  {item}
                </div>
              ))}
              <div className="pt-2">
                <Button variant="outline" disabled>
                  Edit links (next iteration)
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </PageShell>
  );
}
