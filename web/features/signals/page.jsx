"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageLoadingSkeleton } from "@/components/ui/page-loading-skeleton";
import { ProjectScopeRequired } from "@/components/project-scope-required";
import { Toast } from "@/components/ui/toast";
import { StatusChip } from "@/components/ui/status-chip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Filters } from "@/components/ui/filters";
import { apiFetch } from "@/lib/api";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useProjectGate } from "@/hooks/use-project-gate";

export default function SignalsFeaturePage() {
  const { loading, session } = useAuthGuard();
  const { hasProject, loadingProjects } = useProjectGate();
  const [signals, setSignals] = useState([]);
  const [nba, setNba] = useState([]);
  const [upsell, setUpsell] = useState([]);
  const [identitySuggestions, setIdentitySuggestions] = useState([]);
  const [continuityActions, setContinuityActions] = useState([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState({ type: "info", message: "" });
  const [selectedSuggestions, setSelectedSuggestions] = useState({});
  const [selectedContinuity, setSelectedContinuity] = useState({});

  const load = useCallback(async () => {
    if (!hasProject) return;
    setBusy(true);
    try {
      const [signalsResp, nbaResp, upsellResp, suggestionsResp, continuityResp] = await Promise.all([
        apiFetch("/signals"),
        apiFetch("/nba"),
        apiFetch("/upsell/radar"),
        apiFetch("/identity/suggestions"),
        apiFetch("/continuity/actions?status=previewed"),
      ]);
      setSignals(Array.isArray(signalsResp?.signals) ? signalsResp.signals : []);
      setNba(Array.isArray(nbaResp?.items) ? nbaResp.items : []);
      setUpsell(Array.isArray(upsellResp?.opportunities) ? upsellResp.opportunities : []);
      setIdentitySuggestions(Array.isArray(suggestionsResp?.suggestions) ? suggestionsResp.suggestions : []);
      setContinuityActions(Array.isArray(continuityResp?.actions) ? continuityResp.actions : []);
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Failed to load signals stack" });
    } finally {
      setBusy(false);
    }
  }, [hasProject]);

  useEffect(() => {
    if (!loading && !loadingProjects && session?.authenticated && hasProject) {
      load();
    }
  }, [loading, loadingProjects, session, hasProject, load]);

  const filteredSignals = useMemo(() => {
    if (!query) return signals;
    const q = query.toLowerCase();
    return signals.filter((row) =>
      [row.signal_type, row.summary, row.status].some((field) => String(field || "").toLowerCase().includes(q))
    );
  }, [signals, query]);

  async function runExtraction() {
    try {
      await apiFetch("/signals/extract", { method: "POST" });
      setToast({ type: "success", message: "Signals extraction completed" });
      await load();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Signals extraction failed" });
    }
  }

  async function refreshUpsell() {
    try {
      await apiFetch("/upsell/radar/refresh", { method: "POST" });
      setToast({ type: "success", message: "Upsell radar refreshed" });
      await load();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Upsell refresh failed" });
    }
  }

  async function previewIdentity() {
    try {
      await apiFetch("/identity/suggestions/preview", { method: "POST", body: { limit: 120 } });
      setToast({ type: "success", message: "Identity suggestions updated" });
      await load();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Identity preview failed" });
    }
  }

  async function applyIdentity() {
    const ids = Object.keys(selectedSuggestions).filter((id) => selectedSuggestions[id]);
    if (!ids.length) return;
    try {
      await apiFetch("/identity/suggestions/apply", {
        method: "POST",
        body: { suggestion_ids: ids },
      });
      setSelectedSuggestions({});
      setToast({ type: "success", message: "Identity links applied" });
      await load();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Identity apply failed" });
    }
  }

  async function previewContinuity() {
    try {
      await apiFetch("/continuity/preview", { method: "POST" });
      setToast({ type: "success", message: "Continuity preview generated" });
      await load();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Continuity preview failed" });
    }
  }

  async function applyContinuity() {
    const ids = Object.keys(selectedContinuity).filter((id) => selectedContinuity[id]);
    if (!ids.length) return;
    try {
      await apiFetch("/continuity/apply", { method: "POST", body: { action_ids: ids } });
      setSelectedContinuity({});
      setToast({ type: "success", message: "Continuity actions applied to Linear backlog" });
      await load();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Continuity apply failed" });
    }
  }

  async function setNbaStatus(id, status) {
    try {
      await apiFetch(`/nba/${id}/status`, { method: "POST", body: { status } });
      await load();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Failed to update NBA status" });
    }
  }

  if (loading || !session || loadingProjects) {
    return (
      <PageShell title="Signals + NBA" subtitle="Extraction, deduplication, identity graph and actionable next-best-actions">
        <PageLoadingSkeleton />
      </PageShell>
    );
  }

  if (!hasProject) {
    return (
      <PageShell title="Signals" subtitle="Signals, NBA and identity graph linking">
        <ProjectScopeRequired
          title="Сначала выберите активный проект"
          description="Сигналы и NBA считаются в проектном контексте. Выберите проект и обновите страницу."
        />
      </PageShell>
    );
  }

  return (
    <PageShell title="Signals + NBA" subtitle="Extraction, deduplication, identity graph and actionable next-best-actions">
      <div className="space-y-4">
        <Card data-motion-item>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Actions</CardTitle>
            <Button size="sm" variant="outline" onClick={load} disabled={busy}>
              {busy ? "Refreshing..." : "Refresh"}
            </Button>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button onClick={runExtraction}>Extract signals</Button>
            <Button variant="secondary" onClick={refreshUpsell}>
              Refresh upsell radar
            </Button>
            <Button variant="secondary" onClick={previewIdentity}>
              Preview identity links
            </Button>
            <Button variant="outline" onClick={applyIdentity}>
              Apply selected links
            </Button>
            <Button variant="secondary" onClick={previewContinuity}>
              Preview deal→delivery
            </Button>
            <Button variant="outline" onClick={applyContinuity}>
              Apply selected continuity
            </Button>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Identity link suggestions</CardTitle>
          </CardHeader>
          <CardContent>
            <Table aria-label="Identity graph suggestions">
              <TableHeader>
                <TableRow>
                  <TableHead>Pick</TableHead>
                  <TableHead>Link</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {identitySuggestions.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={Boolean(selectedSuggestions[row.id])}
                        onChange={(event) =>
                          setSelectedSuggestions((prev) => ({ ...prev, [row.id]: event.target.checked }))
                        }
                      />
                    </TableCell>
                    <TableCell>
                      {row.left_entity_type}:{row.left_entity_id} ↔ {row.right_entity_type}:{row.right_entity_id}
                    </TableCell>
                    <TableCell>{Number(row.confidence || 0).toFixed(2)}</TableCell>
                    <TableCell>
                      <StatusChip status={row.status} />
                    </TableCell>
                  </TableRow>
                ))}
                {!identitySuggestions.length ? (
                  <TableRow>
                    <TableCell colSpan={4}>No suggestions yet.</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Detected signals</CardTitle>
          </CardHeader>
          <CardContent>
            <Filters queryValue={query} onQueryChange={setQuery} queryPlaceholder="Filter signal summary/type..." />
            <div className="mt-3">
              <Table aria-label="Signals">
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Summary</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSignals.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.signal_type}</TableCell>
                      <TableCell>{row.summary}</TableCell>
                      <TableCell>{row.severity}</TableCell>
                      <TableCell>{Number(row.confidence || 0).toFixed(2)}</TableCell>
                      <TableCell>
                        <StatusChip status={row.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {!filteredSignals.length ? (
                    <TableRow>
                      <TableCell colSpan={5}>No signals yet. Run extraction.</TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Next Best Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <Table aria-label="NBA list">
              <TableHeader>
                <TableRow>
                  <TableHead>Summary</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {nba.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.summary}</TableCell>
                    <TableCell>{row.priority}</TableCell>
                    <TableCell>
                      <StatusChip status={row.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => setNbaStatus(row.id, "accepted")}>
                          Accept
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setNbaStatus(row.id, "done")}>
                          Done
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!nba.length ? (
                  <TableRow>
                    <TableCell colSpan={4}>No NBA yet.</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Upsell radar</CardTitle>
          </CardHeader>
          <CardContent>
            <Table aria-label="Upsell radar">
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Suggested outbound</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upsell.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.title}</TableCell>
                    <TableCell>{Number(row.score || 0).toFixed(2)}</TableCell>
                    <TableCell>
                      <StatusChip status={row.status} />
                    </TableCell>
                    <TableCell>{row.suggested_outbound_payload?.message || "-"}</TableCell>
                  </TableRow>
                ))}
                {!upsell.length ? (
                  <TableRow>
                    <TableCell colSpan={4}>No upsell opportunities yet.</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Deal→Delivery continuity preview</CardTitle>
          </CardHeader>
          <CardContent>
            <Table aria-label="Continuity actions">
              <TableHeader>
                <TableRow>
                  <TableHead>Pick</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {continuityActions.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={Boolean(selectedContinuity[row.id])}
                        onChange={(event) =>
                          setSelectedContinuity((prev) => ({ ...prev, [row.id]: event.target.checked }))
                        }
                      />
                    </TableCell>
                    <TableCell>{row.title}</TableCell>
                    <TableCell>{row.source_type}</TableCell>
                    <TableCell>
                      <StatusChip status={row.status} />
                    </TableCell>
                  </TableRow>
                ))}
                {!continuityActions.length ? (
                  <TableRow>
                    <TableCell colSpan={4}>No continuity previews yet.</TableCell>
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
