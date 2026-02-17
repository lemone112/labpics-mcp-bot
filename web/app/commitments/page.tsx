"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useProjectContext } from "@/hooks/use-project-context";
import { createCommitment, getCommitments, updateCommitment } from "@/lib/api";
import type { Commitment, ToastType } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Toast } from "@/components/ui/toast";

export default function CommitmentsPage() {
  const { loading: authLoading, session } = useAuthGuard();
  const { loading: projectsLoading, projects, activeProject } = useProjectContext(
    !authLoading && Boolean(session?.authenticated)
  );
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createOwner, setCreateOwner] = useState<Commitment["owner"]>("unknown");
  const [createDueAt, setCreateDueAt] = useState("");
  const [toast, setToast] = useState<{ type: ToastType; message: string }>({ type: "info", message: "" });

  const selected = useMemo(() => commitments.find((item) => item.id === selectedId) || null, [commitments, selectedId]);

  async function loadCommitments() {
    if (!activeProject?.id) {
      setCommitments([]);
      setSelectedId("");
      return;
    }

    setBusy(true);
    setToast({ type: "info", message: "" });
    try {
      const data = await getCommitments(undefined, 200);
      const rows = data.commitments || [];
      setCommitments(rows);
      setSelectedId((current) => current || rows[0]?.id || "");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load commitments";
      setToast({ type: "error", message });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!authLoading && session?.authenticated && activeProject?.id) {
      void loadCommitments();
      return;
    }
    setCommitments([]);
    setSelectedId("");
  }, [authLoading, session?.authenticated, activeProject?.id]);

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeProject?.id) return;

    setMutating(true);
    setToast({ type: "info", message: "" });
    try {
      const dueAt = createDueAt ? new Date(`${createDueAt}T12:00:00.000Z`).toISOString() : null;
      const data = await createCommitment({
        title: createTitle.trim(),
        owner: createOwner,
        due_at: dueAt,
        status: "proposed",
      });
      setCreateTitle("");
      setCreateOwner("unknown");
      setCreateDueAt("");
      await loadCommitments();
      setSelectedId(data.commitment.id);
      setToast({ type: "success", message: "Commitment created" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create commitment";
      setToast({ type: "error", message });
    } finally {
      setMutating(false);
    }
  }

  async function setStatus(status: Commitment["status"]) {
    if (!selected) return;
    setMutating(true);
    setToast({ type: "info", message: "" });
    try {
      await updateCommitment(selected.id, { status });
      await loadCommitments();
      setToast({ type: "success", message: `Status updated: ${status}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update commitment";
      setToast({ type: "error", message });
    } finally {
      setMutating(false);
    }
  }

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
      actions={
        <>
          <Badge variant="success">API connected</Badge>
          <Button variant="outline" onClick={() => void loadCommitments()} disabled={busy || !activeProject?.id}>
            {busy ? "Refreshing..." : "Refresh"}
          </Button>
        </>
      }
    >
      {!activeProject ? (
        <EmptyState
          title="Select active project"
          description="Commitments must remain project-scoped. Select project before triage."
          actionHref="/projects"
          actionLabel="Open Projects"
        />
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Create commitment</CardTitle>
              <CardDescription>Manual capture loop before automated extraction rollout.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_170px_140px_140px]" onSubmit={onCreate}>
                <Input
                  placeholder="What was committed and by whom?"
                  value={createTitle}
                  onChange={(event) => setCreateTitle(event.target.value)}
                  required
                  minLength={3}
                  maxLength={300}
                />
                <select
                  value={createOwner}
                  onChange={(event) => setCreateOwner(event.target.value as Commitment["owner"])}
                  className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
                >
                  <option value="unknown">Owner: unknown</option>
                  <option value="studio">Owner: studio</option>
                  <option value="client">Owner: client</option>
                </select>
                <Input type="date" value={createDueAt} onChange={(event) => setCreateDueAt(event.target.value)} />
                <Button type="submit" disabled={mutating}>
                  {mutating ? "Saving..." : "Create"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Commitment queue</CardTitle>
                <CardDescription>Project-scoped commitments with actionable statuses.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {commitments.map((item) => (
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
                {!commitments.length ? (
                  <p className="text-sm text-slate-400">No commitments yet. Create first item above.</p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
                <CardDescription>Evidence-first detail panel (iteration 2).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {selected ? (
                  <>
                    <p className="text-sm text-slate-200">{selected.summary || "No summary provided yet."}</p>
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
                      {selected.evidence.length ? (
                        <div className="space-y-1">
                          {selected.evidence.map((evidenceId) => (
                            <p key={evidenceId} className="font-mono text-xs text-cyan-200">
                              {evidenceId}
                            </p>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-400">No evidence references yet.</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2">
                      <Button size="sm" disabled={mutating || selected.status === "active"} onClick={() => void setStatus("active")}>
                        Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={mutating || selected.status === "done"}
                        onClick={() => void setStatus("done")}
                      >
                        Mark done
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={mutating || selected.status === "closed"}
                        onClick={() => void setStatus("closed")}
                      >
                        Close
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-slate-400">Select commitment from list.</p>
                )}
              </CardContent>
            </Card>
          </div>
          <Toast type={toast.type} message={toast.message} />
        </div>
      )}
    </PageShell>
  );
}
