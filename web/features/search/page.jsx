"use client";

import { useState } from "react";

import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyStateWizard } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const seed = [
  { id: "1", type: "note", text: "We should add filters", score: 0.92 },
  { id: "2", type: "doc", text: "Design system tokens", score: 0.78 },
  { id: "3", type: "ticket", text: "Fix lint violations", score: 0.65 },
];

export default function SearchPage() {
  const [q, setQ] = useState("");

  const rows = seed.filter((r) => r.text.toLowerCase().includes(q.toLowerCase()));

  return (
    <PageShell
      title="Search"
      description="Find notes, docs and records."
      data-testid="ct-hero"
      primaryCta={<Button data-testid="primary-cta">New record</Button>}
    >
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">Index</CardTitle>
          <div className="flex items-center gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-9" />
            <Button variant="outline" size="sm">
              Clear
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {rows.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead className="max-w-lg">Text</TableHead>
                  <TableHead>Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Badge variant="secondary">{row.type}</Badge>
                    </TableCell>
                    <TableCell className="max-w-lg whitespace-pre-wrap">{row.text}</TableCell>
                    <TableCell className="text-muted-foreground">{row.score.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyStateWizard
              data-testid="empty-wizard"
              title="No results"
              reason="Try a different query or add content to index."
              steps={["Change query", "Add a record", "Search again"]}
              cta={{ label: "Add record", href: "/new" }}
            />
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
