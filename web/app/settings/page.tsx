"use client";

import { useEffect, useState, type FormEvent } from "react";

import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useProjectContext } from "@/hooks/use-project-context";
import { createProjectLink, deleteProjectLink, getProjectLinks } from "@/lib/api";
import type { ProjectSourceLink, ToastType } from "@/lib/types";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Toast } from "@/components/ui/toast";

export default function SettingsPage() {
  const { loading: authLoading, session } = useAuthGuard();
  const { loading: projectsLoading, projects, activeProject } = useProjectContext(
    !authLoading && Boolean(session?.authenticated)
  );
  const [links, setLinks] = useState<ProjectSourceLink[]>([]);
  const [newInboxId, setNewInboxId] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ type: ToastType; message: string }>({
    type: "info",
    message: "",
  });

  async function loadLinks() {
    if (!activeProject?.id) {
      setLinks([]);
      return;
    }

    setBusy(true);
    setToast({ type: "info", message: "" });
    try {
      const data = await getProjectLinks("chatwoot_inbox");
      setLinks(data.links || []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load links";
      setToast({ type: "error", message });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!authLoading && session?.authenticated && activeProject?.id) {
      void loadLinks();
      return;
    }
    setLinks([]);
  }, [authLoading, session?.authenticated, activeProject?.id]);

  async function onAddInbox(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeProject?.id) return;

    setBusy(true);
    setToast({ type: "info", message: "" });
    try {
      await createProjectLink({
        source_type: "chatwoot_inbox",
        source_external_id: newInboxId.trim(),
      });
      setNewInboxId("");
      await loadLinks();
      setToast({ type: "success", message: "Inbox link added" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add inbox link";
      setToast({ type: "error", message });
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteLink(id: string) {
    setBusy(true);
    setToast({ type: "info", message: "" });
    try {
      await deleteProjectLink(id);
      await loadLinks();
      setToast({ type: "success", message: "Inbox link removed" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete inbox link";
      setToast({ type: "error", message });
    } finally {
      setBusy(false);
    }
  }

  if (authLoading || !session || projectsLoading) {
    return <div className="p-8 text-slate-300">Loading...</div>;
  }

  return (
    <PageShell
      title="Settings"
      subtitle="Integration and link management with safe-by-default controls."
      activeProjectName={activeProject?.name || null}
      activeProjectId={activeProject?.id || null}
      projectCount={projects.length}
      actions={
        <>
          <Badge variant="success">Chatwoot links API connected</Badge>
          <Button variant="outline" onClick={() => void loadLinks()} disabled={busy || !activeProject?.id}>
            {busy ? "Refreshing..." : "Refresh links"}
          </Button>
        </>
      }
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
              <CardDescription>Connection state and rollout phases.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                {
                  name: "Chatwoot",
                  status: links.length > 0 ? "connected" : "configured but unlinked",
                  note: "Link at least one inbox to allow project-scoped sync.",
                },
                { name: "Linear", status: "planned", note: "Preview/approve flow in roadmap." },
                { name: "Attio", status: "planned", note: "CRM sync with audit guardrails." },
              ].map((integration) => (
                <div key={integration.name} className="rounded-md border border-slate-800 p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-100">{integration.name}</p>
                    <Badge variant={integration.status.includes("connected") ? "success" : "warning"}>
                      {integration.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-400">{integration.note}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Project ↔ Chatwoot inbox links</CardTitle>
              <CardDescription>
                Required for strict project isolation. Unlinked inboxes are skipped during sync.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <form className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px]" onSubmit={onAddInbox}>
                <Input
                  placeholder="Chatwoot inbox id (e.g. 42)"
                  value={newInboxId}
                  onChange={(event) => setNewInboxId(event.target.value)}
                  inputMode="numeric"
                  pattern="[0-9]+"
                  required
                />
                <Button type="submit" disabled={busy}>
                  Add inbox link
                </Button>
              </form>

              <div className="space-y-2">
                {links.map((link) => (
                  <div key={link.id} className="flex items-center justify-between rounded-md border border-slate-800 px-3 py-2">
                    <div>
                      <p className="text-sm text-slate-100">Inbox {link.source_external_id}</p>
                      <p className="font-mono text-xs text-slate-500">account {link.source_account_id}</p>
                    </div>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void onDeleteLink(link.id)}>
                      Remove
                    </Button>
                  </div>
                ))}
                {!links.length ? (
                  <p className="text-sm text-slate-400">
                    No inbox links yet. Sync will skip all conversations until at least one link is added.
                  </p>
                ) : null}
              </div>

              <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-300">
                If inbox mapping is reassigned to another project, historical data does not move automatically.
                New sync runs use the new mapping only.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Roadmap links (next)</CardTitle>
              <CardDescription>Planned source mappings for upcoming integrations.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                "Project ↔ Linear project mapping",
                "Project ↔ Attio company mapping",
                "Historical data migration policy",
              ].map((item) => (
                <div key={item} className="rounded-md border border-slate-800 px-3 py-2 text-sm text-slate-200">
                  {item}
                </div>
              ))}
            </CardContent>
          </Card>
          <Toast type={toast.type} message={toast.message} />
        </div>
      )}
    </PageShell>
  );
}
