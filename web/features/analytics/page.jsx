"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageLoadingSkeleton } from "@/components/ui/page-loading-skeleton";
import { Toast } from "@/components/ui/toast";
import { StatTile } from "@/components/ui/stat-tile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { useAuthGuard } from "@/hooks/use-auth-guard";

export default function AnalyticsFeaturePage() {
  const { loading, session } = useAuthGuard();
  const [overview, setOverview] = useState(null);
  const [risk, setRisk] = useState(null);
  const [evidence, setEvidence] = useState([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState({ type: "info", message: "" });

  const load = useCallback(async () => {
    if (!session?.active_project_id) return;
    setBusy(true);
    try {
      const [overviewResp, riskResp, evidenceResp] = await Promise.all([
        apiFetch("/analytics/overview"),
        apiFetch("/risk/overview"),
        apiFetch("/analytics/drilldown?limit=30"),
      ]);
      setOverview(overviewResp);
      setRisk(riskResp);
      setEvidence(Array.isArray(evidenceResp?.evidence) ? evidenceResp.evidence : []);
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Failed to load analytics" });
    } finally {
      setBusy(false);
    }
  }, [session?.active_project_id]);

  useEffect(() => {
    if (!loading && session?.authenticated && session?.active_project_id) {
      load();
    }
  }, [loading, session, load]);

  async function refreshAnalytics() {
    try {
      await apiFetch("/analytics/refresh", { method: "POST", body: JSON.stringify({ period_days: 30 }) });
      setToast({ type: "success", message: "Analytics snapshots refreshed" });
      await load();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Failed to refresh analytics" });
    }
  }

  async function refreshRisk() {
    try {
      await apiFetch("/risk/refresh", { method: "POST" });
      setToast({ type: "success", message: "Risk/health refreshed" });
      await load();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Failed to refresh risk" });
    }
  }

  if (loading || !session) {
    return (
      <PageShell title="Analytics + Risk" subtitle="Pipeline forecast, delivery/comms metrics and drill-down evidence">
        <PageLoadingSkeleton />
      </PageShell>
    );
  }

  if (!session.active_project_id) {
    return (
      <PageShell title="Analytics" subtitle="Forecast, delivery, communications and risk metrics">
        <Card data-motion-item>
          <CardContent>
            <EmptyState
              title="Select active project first"
              description="Analytics snapshots are scoped to active project/account."
              actions={
                <Link href="/projects">
                  <Button>Go to Projects</Button>
                </Link>
              }
            />
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell title="Analytics + Risk" subtitle="Pipeline forecast, delivery/comms metrics and drill-down evidence">
      <div className="space-y-4">
        <Card data-motion-item>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Refresh snapshots</CardTitle>
            <Button variant="outline" size="sm" onClick={load} disabled={busy}>
              {busy ? "Refreshing..." : "Refresh"}
            </Button>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button onClick={refreshAnalytics}>Refresh analytics</Button>
            <Button variant="secondary" onClick={refreshRisk}>
              Refresh risk/health
            </Button>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Portfolio metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <StatTile
                label="Pipeline (30/60/90)"
                value={
                  Array.isArray(overview?.revenue)
                    ? `$${overview.revenue.reduce((sum, item) => sum + Number(item.pipeline_amount || 0), 0).toLocaleString()}`
                    : "$0"
                }
              />
              <StatTile
                label="Expected revenue"
                value={
                  Array.isArray(overview?.revenue)
                    ? `$${overview.revenue.reduce((sum, item) => sum + Number(item.expected_revenue || 0), 0).toLocaleString()}`
                    : "$0"
                }
              />
              <StatTile label="Open issues" value={overview?.delivery?.open_issues ?? 0} />
              <StatTile label="Health score" value={risk?.health?.score ?? "N/A"} />
            </div>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Revenue forecast snapshots</CardTitle>
          </CardHeader>
          <CardContent>
            <Table aria-label="Forecast snapshots">
              <TableHeader>
                <TableRow>
                  <TableHead>Horizon</TableHead>
                  <TableHead>Pipeline</TableHead>
                  <TableHead>Expected</TableHead>
                  <TableHead>Generated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(overview?.revenue || []).map((row) => (
                  <TableRow key={`${row.horizon_days}-${row.generated_at}`}>
                    <TableCell>{row.horizon_days}d</TableCell>
                    <TableCell>${Number(row.pipeline_amount || 0).toLocaleString()}</TableCell>
                    <TableCell>${Number(row.expected_revenue || 0).toLocaleString()}</TableCell>
                    <TableCell>{row.generated_at ? new Date(row.generated_at).toLocaleString() : "-"}</TableCell>
                  </TableRow>
                ))}
                {!overview?.revenue?.length ? (
                  <TableRow>
                    <TableCell colSpan={4}>No snapshots yet.</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Risk radar</CardTitle>
          </CardHeader>
          <CardContent>
            <Table aria-label="Risk radar">
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Probability</TableHead>
                  <TableHead>Mitigation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(risk?.risks || []).map((row, idx) => (
                  <TableRow key={`${row.title}-${idx}`}>
                    <TableCell>{row.title}</TableCell>
                    <TableCell>{row.severity}</TableCell>
                    <TableCell>{Number(row.probability || 0).toFixed(2)}</TableCell>
                    <TableCell>{row.mitigation_action}</TableCell>
                  </TableRow>
                ))}
                {!risk?.risks?.length ? (
                  <TableRow>
                    <TableCell colSpan={4}>No risk radar items yet.</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Evidence drill-down</CardTitle>
          </CardHeader>
          <CardContent>
            <Table aria-label="Evidence list">
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>PK</TableHead>
                  <TableHead>Snippet</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {evidence.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.source_table}</TableCell>
                    <TableCell>{row.source_pk}</TableCell>
                    <TableCell>{row.snippet || "-"}</TableCell>
                    <TableCell>{row.created_at ? new Date(row.created_at).toLocaleString() : "-"}</TableCell>
                  </TableRow>
                ))}
                {!evidence.length ? (
                  <TableRow>
                    <TableCell colSpan={4}>No evidence yet.</TableCell>
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
