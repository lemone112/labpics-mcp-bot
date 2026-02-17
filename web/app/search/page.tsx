"use client";

import { useState, type FormEvent } from "react";

import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useProjectContext } from "@/hooks/use-project-context";
import { searchChunks } from "@/lib/api";
import type { SearchResultItem, ToastType } from "@/lib/types";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toast } from "@/components/ui/toast";

export default function SearchPage() {
  const { loading: authLoading, session } = useAuthGuard();
  const { loading: projectsLoading, projects, activeProject } = useProjectContext(
    !authLoading && Boolean(session?.authenticated)
  );
  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState(10);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [embeddingModel, setEmbeddingModel] = useState("-");
  const [toast, setToast] = useState<{ type: ToastType; message: string }>({
    type: "info",
    message: "",
  });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setToast({ type: "info", message: "" });
    try {
      const payload = await searchChunks(query, Number(topK) || 10);
      setResults(payload.results || []);
      setEmbeddingModel(payload.embedding_model || "-");
      setToast({ type: "success", message: `Found ${payload.results?.length || 0} matches` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Search failed";
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
      title="Evidence Search"
      subtitle="Vector similarity over memory chunks with source references."
      activeProjectName={activeProject?.name || null}
      activeProjectId={activeProject?.id || null}
      projectCount={projects.length}
      actions={<Badge variant="warning">Backend search is not project-scoped yet</Badge>}
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Query</CardTitle>
            <CardDescription>Use natural language and validate output against message/conversation IDs.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_120px_150px]" onSubmit={onSubmit}>
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="What was promised about delivery timeline?"
                required
              />
              <Input
                type="number"
                min={1}
                max={50}
                value={topK}
                onChange={(event) => setTopK(Number(event.target.value))}
              />
              <Button type="submit" disabled={busy}>
                {busy ? "Searching..." : "Search"}
              </Button>
            </form>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span>model: {embeddingModel}</span>
              <span>topK: {topK}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
            <CardDescription>Every row should be auditable by source IDs.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Distance</TableHead>
                  <TableHead>Conversation ID</TableHead>
                  <TableHead>Message ID</TableHead>
                  <TableHead>Chunk text</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.distance != null ? Number(row.distance).toFixed(4) : "-"}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-300">{row.conversation_global_id || "-"}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-300">{row.message_global_id || "-"}</TableCell>
                    <TableCell className="max-w-[560px] whitespace-pre-wrap">{row.text}</TableCell>
                  </TableRow>
                ))}
                {!results.length ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-slate-400">
                      No results yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Toast type={toast.type} message={toast.message} />
      </div>
    </PageShell>
  );
}
