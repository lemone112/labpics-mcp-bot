"use client";

import { useState } from "react";

import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLoadingSkeleton } from "@/components/ui/page-loading-skeleton";
import { ProjectScopeRequired } from "@/components/project-scope-required";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useProjectGate } from "@/hooks/use-project-gate";

export default function SearchFeaturePage() {
  const { loading, session } = useAuthGuard();
  const { hasProject, loadingProjects } = useProjectGate();
  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState(10);
  const [chunks, setChunks] = useState([]);
  const [evidence, setEvidence] = useState([]);
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState(null);
  const [answer, setAnswer] = useState("");
  const [toast, setToast] = useState({ type: "info", message: "" });

  async function onSearch(event) {
    event.preventDefault();
    setBusy(true);
    setToast({ type: "info", message: "" });
    try {
      const data = await apiFetch("/lightrag/query", {
        method: "POST",
        body: { query, topK: Number(topK) || 10 },
        timeoutMs: 25_000,
      });
      setChunks(Array.isArray(data?.chunks) ? data.chunks : []);
      setEvidence(Array.isArray(data?.evidence) ? data.evidence : []);
      setAnswer(String(data?.answer || ""));
      setMeta({
        stats: data?.stats || {},
        topK: data?.topK,
      });
      setToast({ type: "success", message: `Найдено ${data?.stats?.chunks || 0} релевантных chunk-фрагментов` });
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Не удалось выполнить запрос LightRAG" });
    } finally {
      setBusy(false);
    }
  }

  if (loading || !session || loadingProjects) {
    return (
      <PageShell title="LightRAG" subtitle="Единый retrieval-слой по сообщениям, задачам и сделкам">
        <PageLoadingSkeleton />
      </PageShell>
    );
  }

  if (!hasProject) {
    return (
      <PageShell title="LightRAG" subtitle="Единый retrieval-слой по сообщениям, задачам и сделкам">
        <ProjectScopeRequired
          title="Сначала выберите активный проект"
          description="LightRAG выполняется в project scope. Выберите проект перед выполнением запроса."
        />
      </PageShell>
    );
  }

  return (
    <PageShell title="LightRAG" subtitle="Единый retrieval-слой по сообщениям, задачам и сделкам">
      <div className="space-y-4">
        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Запрос к LightRAG</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_120px_120px]" onSubmit={onSearch}>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Что обещал клиент по дедлайну релиза?"
                required
              />
              <Input
                type="number"
                min={1}
                max={50}
                value={topK}
                onChange={(e) => setTopK(e.target.value)}
              />
              <Button type="submit" loading={busy}>
                Выполнить
              </Button>
            </form>

            {meta ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="outline">topK: {meta.topK || "-"}</Badge>
                <Badge variant="outline">chunk: {meta?.stats?.chunks || 0}</Badge>
                <Badge variant="outline">сообщения: {meta?.stats?.messages || 0}</Badge>
                <Badge variant="outline">задачи: {meta?.stats?.issues || 0}</Badge>
                <Badge variant="outline">сделки: {meta?.stats?.opportunities || 0}</Badge>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Краткий ответ</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-muted-foreground">{answer || "Ответ появится после запроса."}</p>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Chunk-результаты</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Distance</TableHead>
                  <TableHead>Conversation</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Фрагмент</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {chunks.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.distance != null ? Number(row.distance).toFixed(4) : "-"}</TableCell>
                    <TableCell className="font-mono text-xs">{row.conversation_global_id || "-"}</TableCell>
                    <TableCell className="font-mono text-xs">{row.message_global_id || "-"}</TableCell>
                    <TableCell className="max-w-[460px] whitespace-pre-wrap">{row.text}</TableCell>
                  </TableRow>
                ))}
                {!chunks.length ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      Пока нет результатов.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Evidence из источников</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {evidence.slice(0, 20).map((item, idx) => (
              <div key={`${item.source_type}-${item.source_pk || idx}`} className="rounded-md border p-2">
                <p className="mb-1 text-xs text-muted-foreground">
                  {item.source_type} • {item.source_ref || item.source_pk || "-"}
                </p>
                <p className="text-sm">{item.title || item.snippet || "Без описания"}</p>
              </div>
            ))}
            {!evidence.length ? <p className="text-sm text-muted-foreground">Evidence появится после запроса.</p> : null}
          </CardContent>
        </Card>

        <Toast type={toast.type} message={toast.message} />
      </div>
    </PageShell>
  );
}
