"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusChip } from "@/components/ui/status-chip";
import { EmptyStateWizard } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

const demo = [
  { id: "job_1", name: "Export invoices", status: "ok", error: null },
  { id: "job_2", name: "Sync contacts", status: "warn", error: "Transient API error" },
  { id: "job_3", name: "Cleanup", status: "down", error: "Permission denied" },
];

export default function JobsPage() {
  const [rows, setRows] = useState(demo);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);

  const refresh = useCallback(() => {
    setLoading(true);
    timer.current = setTimeout(() => {
      setRows((r) => r.map((x) => ({ ...x, status: x.status })));
      setLoading(false);
    }, 350);
  }, []);

  useEffect(() => {
    refresh();
    return () => timer.current && clearTimeout(timer.current);
  }, [refresh]);

  return (
    <PageShell
      title="Jobs"
      description="Background work and system tasks."
      data-testid="ct-hero"
      primaryCta={<Button data-testid="primary-cta">Run job</Button>}
    >
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recent</CardTitle>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {rows.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="max-w-xs">Last error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-medium">{job.name}</TableCell>
                    <TableCell>
                      <StatusChip tone={job.status}>{job.status}</StatusChip>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-destructive">
                      {job.error || "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyStateWizard
              data-testid="empty-wizard"
              title="No jobs"
              reason="You’ll see jobs here once background tasks are configured."
              steps={["Create a job", "Run it", "Return to this page"]}
              cta={{ label: "Create job", href: "/jobs/new" }}
            />
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
