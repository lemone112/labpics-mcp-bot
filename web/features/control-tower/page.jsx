"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLoadingSkeleton } from "@/components/ui/page-loading-skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusChip } from "@/components/ui/status-chip";
import { Toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { InboxList } from "@/components/ui/inbox-list";
import { Drawer } from "@/components/ui/drawer";
import { apiFetch } from "@/lib/api";
import { useAuthGuard } from "@/hooks/use-auth-guard";

export default function ControlTowerFeaturePage() {
  const { loading, session } = useAuthGuard();
  const [payload, setPayload] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState({ type: "info", message: "" });
  const [drawerItem, setDrawerItem] = useState(null);

  const load = useCallback(async () => {
    if (!session?.active_project_id) return;
    setBusy(true);
    try {
      const data = await apiFetch("/control-tower");
      setPayload(data);
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Failed to load control tower" });
    } finally {
      setBusy(false);
    }
  }, [session?.active_project_id]);

  useEffect(() => {
    if (!loading && session?.authenticated && session?.active_project_id) {
      load();
    }
  }, [loading, session, load]);

  const syncRows = useMemo(
    () => (Array.isArray(payload?.integrations?.sync_watermarks) ? payload.integrations.sync_watermarks : []),
    [payload?.integrations?.sync_watermarks]
  );
  const topNba = useMemo(() => (Array.isArray(payload?.top_nba) ? payload.top_nba : []), [payload?.top_nba]);
  const evidenceList = useMemo(
    () =>
      (Array.isArray(payload?.evidence) ? payload.evidence : []).map((item) => ({
        id: item.id,
        title: `${item.source_table} • ${item.source_pk}`,
        snippet: item.snippet || "",
        status: "ready",
        meta: item.created_at ? new Date(item.created_at).toLocaleString() : "",
        payload: item,
      })),
    [payload?.evidence]
  );

  if (loading || !session) {
    return (
      <PageShell title="Control Tower" subtitle="Unified Project/Account status across Chatwoot, Attio, Linear and NBA">
        <PageLoadingSkeleton />
      </PageShell>
    );
  }

  if (!session.active_project_id) {
    return (
      <PageShell title="Control Tower" subtitle="Project and account control center">
        <Card data-motion-item>
          <CardContent>
            <EmptyState
              title="Select active project first"
              description="Control Tower aggregates scoped Linear, Attio and Chatwoot context per active project."
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
    <PageShell title="Control Tower" subtitle="Unified Project/Account status across Chatwoot, Attio, Linear and NBA">
      <div className="space-y-4">
        <Card data-motion-item>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Global status</CardTitle>
            <Button variant="outline" size="sm" onClick={load} disabled={busy}>
              {busy ? "Refreshing..." : "Refresh"}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <StatTile label="Attio accounts" value={payload?.integrations?.attio?.accounts ?? 0} />
              <StatTile label="Linear open issues" value={payload?.integrations?.linear?.issues_open ?? 0} />
              <StatTile label="Chatwoot messages (7d)" value={payload?.integrations?.chatwoot?.messages_7d ?? 0} />
            </div>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Integration sync status</CardTitle>
          </CardHeader>
          <CardContent>
            <Table aria-label="Control tower sync status">
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Cursor TS</TableHead>
                  <TableHead>Cursor ID</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {syncRows.map((row) => (
                  <TableRow key={row.source}>
                    <TableCell>{row.source}</TableCell>
                    <TableCell>{row.cursor_ts ? new Date(row.cursor_ts).toLocaleString() : "-"}</TableCell>
                    <TableCell className="font-mono text-xs">{row.cursor_id || "-"}</TableCell>
                    <TableCell>{row.updated_at ? new Date(row.updated_at).toLocaleString() : "-"}</TableCell>
                  </TableRow>
                ))}
                {!syncRows.length ? (
                  <TableRow>
                    <TableCell colSpan={4}>No sync runs yet.</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Top Next Best Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <Table aria-label="Top next best actions">
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topNba.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.summary}</TableCell>
                    <TableCell>{row.priority}</TableCell>
                    <TableCell>
                      <StatusChip status={row.status} />
                    </TableCell>
                    <TableCell>{row.updated_at ? new Date(row.updated_at).toLocaleString() : "-"}</TableCell>
                  </TableRow>
                ))}
                {!topNba.length ? (
                  <TableRow>
                    <TableCell colSpan={4}>No NBA yet. Run Signals extraction first.</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Recent evidence context</CardTitle>
          </CardHeader>
          <CardContent>
            <InboxList items={evidenceList} onSelect={(item) => setDrawerItem(item)} />
          </CardContent>
        </Card>

        <Drawer
          isOpen={Boolean(drawerItem)}
          onOpenChange={(open) => {
            if (!open) setDrawerItem(null);
          }}
          title="Evidence details"
          footer={() => <Button onClick={() => setDrawerItem(null)}>Close</Button>}
        >
          {drawerItem ? (
            <pre className="overflow-x-auto rounded-md bg-muted/50 p-3 text-xs">
              {JSON.stringify(drawerItem.payload, null, 2)}
            </pre>
          ) : null}
        </Drawer>

        <Toast type={toast.type} message={toast.message} />
      </div>
    </PageShell>
  );
}
