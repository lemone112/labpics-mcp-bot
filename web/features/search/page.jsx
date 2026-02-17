"use client";

import { useState } from "react";

import { PageShell } from "@/components/page-shell";
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
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState(null);
  const [toast, setToast] = useState({ type: "info", message: "" });

  async function onSearch(event) {
    event.preventDefault();
    setBusy(true);
    setToast({ type: "info", message: "" });
    try {
      const data = await apiFetch("/search", {
        method: "POST",
        body: { query, topK: Number(topK) || 10 },
        timeoutMs: 25_000,
      });
      setResults(Array.isArray(data?.results) ? data.results : []);
      setMeta({
        embedding_model: data?.embedding_model,
        topK: data?.topK,
      });
      setToast({ type: "success", message: `Найдено ${data?.results?.length || 0} фрагментов` });
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Ошибка поиска" });
    } finally {
      setBusy(false);
    }
  }

  if (loading || !session || loadingProjects) {
    return (
      <PageShell title="Поиск" subtitle="Векторный поиск по готовым эмбеддингам">
        <PageLoadingSkeleton />
      </PageShell>
    );
  }

  if (!hasProject) {
    return (
      <PageShell title="Поиск" subtitle="Векторный поиск по готовым эмбеддингам">
        <ProjectScopeRequired
          title="Сначала выберите активный проект"
          description="Поиск выполняется в project scope. Выберите проект перед поиском по embeddings."
        />
      </PageShell>
    );
  }

  return (
    <PageShell title="Поиск" subtitle="Векторный поиск по готовым эмбеддингам">
      <div className="space-y-4">
        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Форма поиска</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_120px_120px]" onSubmit={onSearch}>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Что клиент обещал по срокам?"
                required
              />
              <Input
                type="number"
                min={1}
                max={50}
                value={topK}
                onChange={(e) => setTopK(e.target.value)}
              />
              <Button type="submit" disabled={busy}>
                {busy ? "Поиск..." : "Найти"}
              </Button>
            </form>

            {meta ? (
              <div className="mt-3 text-sm text-muted-foreground">
                модель: {meta.embedding_model || "-"} • topK: {meta.topK || "-"}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Результаты</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Расстояние</TableHead>
                  <TableHead>Диалог</TableHead>
                  <TableHead>Сообщение</TableHead>
                  <TableHead>Фрагмент</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.distance != null ? Number(row.distance).toFixed(4) : "-"}</TableCell>
                    <TableCell className="font-mono text-xs">{row.conversation_global_id || "-"}</TableCell>
                    <TableCell className="font-mono text-xs">{row.message_global_id || "-"}</TableCell>
                    <TableCell className="max-w-[460px] whitespace-pre-wrap">{row.text}</TableCell>
                  </TableRow>
                ))}
                {!results.length ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      Результатов пока нет.
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
