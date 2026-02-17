"use client";

import { useState } from "react";

import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api";
import { useAuthGuard } from "@/hooks/use-auth-guard";

export default function SearchPage() {
  const { loading, session } = useAuthGuard();
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
      setToast({ type: "success", message: `Found ${data?.results?.length || 0} chunks` });
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Search failed" });
    } finally {
      setBusy(false);
    }
  }

  if (loading || !session) {
    return <div className="p-8 text-sm">Loading...</div>;
  }

  return (
    <PageShell title="Search" subtitle="Vector similarity search over ready embeddings">
      <div className="space-y-4">
        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Search form</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_120px_120px]" onSubmit={onSearch}>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="What did client promise about timeline?"
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
                {busy ? "Searching..." : "Search"}
              </Button>
            </form>

            {meta ? (
              <div className="mt-3 text-sm text-muted-foreground">
                model: {meta.embedding_model || "-"} • topK: {meta.topK || "-"}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Results</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Distance</TableHead>
                  <TableHead>Conversation</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Chunk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.distance != null ? Number(row.distance).toFixed(4) : "-"}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{row.conversation_global_id || "-"}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{row.message_global_id || "-"}</TableCell>
                    <TableCell className="max-w-[460px] whitespace-pre-wrap">{row.text}</TableCell>
                  </TableRow>
                ))}
                {!results.length ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
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
