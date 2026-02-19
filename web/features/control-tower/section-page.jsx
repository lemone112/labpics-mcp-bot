"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyStateWizard } from "@/components/ui/empty-state";
import { StatusChip } from "@/components/ui/status-chip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import { cn } from "@/lib/utils";

const statuses = [
  { value: "ok", label: "Operational", tone: "ok" },
  { value: "warn", label: "Degraded", tone: "warn" },
  { value: "down", label: "Down", tone: "down" },
];

function SectionPage() {
  const [selected, setSelected] = useState("ok");
  const [data, setData] = useState([]);

  useEffect(() => {
    const now = Date.now();
    setData([
      { t: now - 5 * 60 * 1000, v: 8 },
      { t: now - 4 * 60 * 1000, v: 12 },
      { t: now - 3 * 60 * 1000, v: 9 },
      { t: now - 2 * 60 * 1000, v: 14 },
      { t: now - 1 * 60 * 1000, v: 11 },
      { t: now, v: 10 },
    ]);
  }, []);

  const selectedMeta = useMemo(() => statuses.find((s) => s.value === selected) || statuses[0], [selected]);

  return (
    <div className="grid gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">Control Tower</h1>
            <StatusChip tone={selectedMeta.tone}>{selectedMeta.label}</StatusChip>
          </div>
          <p className="text-sm text-muted-foreground">High-level status signals for your workspace.</p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-3 text-sm font-medium">
              {selectedMeta.label}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {statuses.map((s) => (
              <DropdownMenuItem key={s.value} onSelect={() => setSelected(s.value)}>
                {s.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Live Signal</CardTitle>
        </CardHeader>
        <CardContent>
          {data.length ? (
            <div className="h-60 w-full">
              <ResponsiveContainer>
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="t" hide />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="v" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyStateWizard
              data-testid="empty-wizard"
              title="No signal yet"
              reason="We’ll show a live signal once your first integration reports data."
              steps={[
                "Connect at least one integration",
                "Generate an event",
                "Return to Control Tower",
              ]}
              cta={{ label: "Connect integration", href: "/integrations" }}
            />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {statuses.map((s) => (
                <div key={s.value} className={cn("flex items-center justify-between rounded-md border p-3", selected === s.value && "border-primary") }>
                  <div className="flex items-center gap-2">
                    <StatusChip tone={s.tone}>{s.label}</StatusChip>
                    <span className="text-sm text-muted-foreground">Last 5 min</span>
                  </div>
                  <Badge variant="secondary">{Math.floor(Math.random() * 100)}%</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              <div className="flex items-center justify-between rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <StatusChip tone="ok">Export</StatusChip>
                  <span className="text-sm text-muted-foreground">Queued</span>
                </div>
                <Badge variant="secondary">2</Badge>
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <StatusChip tone="warn">Sync</StatusChip>
                  <span className="text-sm text-muted-foreground">Delayed</span>
                </div>
                <Badge variant="secondary">7</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default memo(SectionPage);
