"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageLoadingSkeleton } from "@/components/ui/page-loading-skeleton";
import { Toast } from "@/components/ui/toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { useAuthGuard } from "@/hooks/use-auth-guard";

export default function DigestsFeaturePage() {
  const { loading, session } = useAuthGuard();
  const [daily, setDaily] = useState([]);
  const [weekly, setWeekly] = useState([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState({ type: "info", message: "" });

  const load = useCallback(async () => {
    if (!session?.active_project_id) return;
    setBusy(true);
    try {
      const [dailyResp, weeklyResp] = await Promise.all([apiFetch("/digests/daily"), apiFetch("/digests/weekly")]);
      setDaily(Array.isArray(dailyResp?.digests) ? dailyResp.digests : []);
      setWeekly(Array.isArray(weeklyResp?.digests) ? weeklyResp.digests : []);
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Failed to load digests" });
    } finally {
      setBusy(false);
    }
  }, [session?.active_project_id]);

  useEffect(() => {
    if (!loading && session?.authenticated && session?.active_project_id) {
      load();
    }
  }, [loading, session, load]);

  async function generateDaily() {
    try {
      await apiFetch("/digests/daily/generate", { method: "POST" });
      setToast({ type: "success", message: "Daily digest generated" });
      await load();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Failed to generate daily digest" });
    }
  }

  async function generateWeekly() {
    try {
      await apiFetch("/digests/weekly/generate", { method: "POST" });
      setToast({ type: "success", message: "Weekly digest generated" });
      await load();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Failed to generate weekly digest" });
    }
  }

  if (loading || !session) {
    return (
      <PageShell title="Digests" subtitle="Daily operations digest + weekly portfolio digest">
        <PageLoadingSkeleton />
      </PageShell>
    );
  }

  if (!session.active_project_id) {
    return (
      <PageShell title="Digests" subtitle="Daily and weekly project intelligence">
        <Card data-motion-item>
          <CardContent>
            <EmptyState
              title="Select active project first"
              description="Digests are generated per active project/account."
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
    <PageShell title="Digests" subtitle="Daily operations digest + weekly portfolio digest">
      <div className="space-y-4">
        <Card data-motion-item>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Generate digests</CardTitle>
            <Button variant="outline" size="sm" onClick={load} disabled={busy}>
              {busy ? "Refreshing..." : "Refresh"}
            </Button>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button onClick={generateDaily}>Generate daily</Button>
            <Button variant="secondary" onClick={generateWeekly}>
              Generate weekly
            </Button>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Daily digest history</CardTitle>
          </CardHeader>
          <CardContent>
            <Table aria-label="Daily digests">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Highlights</TableHead>
                  <TableHead>Top actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {daily.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.digest_date}</TableCell>
                    <TableCell>
                      Proposed signals: {row.summary?.highlights?.proposed_signals ?? 0}, overdue issues:{" "}
                      {row.summary?.highlights?.overdue_issues ?? 0}
                    </TableCell>
                    <TableCell>{row.summary?.top_nba?.length ?? 0}</TableCell>
                  </TableRow>
                ))}
                {!daily.length ? (
                  <TableRow>
                    <TableCell colSpan={3}>No daily digests yet.</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Weekly digest history</CardTitle>
          </CardHeader>
          <CardContent>
            <Table aria-label="Weekly digests">
              <TableHeader>
                <TableRow>
                  <TableHead>Week start</TableHead>
                  <TableHead>Open pipeline</TableHead>
                  <TableHead>Top risks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {weekly.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.week_start}</TableCell>
                    <TableCell>{row.summary?.portfolio?.open_pipeline ?? 0}</TableCell>
                    <TableCell>{row.summary?.risk?.top_risks?.length ?? 0}</TableCell>
                  </TableRow>
                ))}
                {!weekly.length ? (
                  <TableRow>
                    <TableCell colSpan={3}>No weekly digests yet.</TableCell>
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
