"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { Toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Kanban } from "@/components/ui/kanban";
import { Filters } from "@/components/ui/filters";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import { useAuthGuard } from "@/hooks/use-auth-guard";

const stages = ["discovery", "qualified", "proposal", "negotiation", "won", "lost"];

export default function CrmFeaturePage() {
  const { loading, session } = useAuthGuard();
  const [overview, setOverview] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState({ type: "info", message: "" });
  const [newAccountName, setNewAccountName] = useState("");
  const [newOpportunityTitle, setNewOpportunityTitle] = useState("");
  const [newOpportunityAccountId, setNewOpportunityAccountId] = useState("");

  const load = useCallback(async () => {
    if (!session?.active_project_id) return;
    setBusy(true);
    try {
      const [overviewResp, accountsResp, opportunitiesResp] = await Promise.all([
        apiFetch("/crm/overview"),
        apiFetch("/crm/accounts"),
        apiFetch("/crm/opportunities"),
      ]);
      setOverview(overviewResp);
      setAccounts(Array.isArray(accountsResp?.accounts) ? accountsResp.accounts : []);
      setOpportunities(Array.isArray(opportunitiesResp?.opportunities) ? opportunitiesResp.opportunities : []);
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Failed to load CRM data" });
    } finally {
      setBusy(false);
    }
  }, [session?.active_project_id]);

  useEffect(() => {
    if (!loading && session?.authenticated && session?.active_project_id) {
      load();
    }
  }, [loading, session, load]);

  const filteredOpportunities = useMemo(() => {
    if (!query) return opportunities;
    const q = query.toLowerCase();
    return opportunities.filter((row) =>
      [row.title, row.account_name, row.stage, row.next_step].some((field) => String(field || "").toLowerCase().includes(q))
    );
  }, [opportunities, query]);

  const columns = useMemo(
    () =>
      stages.map((stage) => ({
        id: stage,
        title: stage[0].toUpperCase() + stage.slice(1),
        items: filteredOpportunities
          .filter((item) => item.stage === stage)
          .map((item) => ({
            id: item.id,
            title: item.title,
            subtitle: item.account_name || "Unlinked account",
            status: item.stage,
            meta: item.amount_estimate ? `$${Number(item.amount_estimate).toLocaleString()}` : "$0",
          })),
      })),
    [filteredOpportunities]
  );

  async function createAccount() {
    if (!newAccountName.trim()) return;
    try {
      await apiFetch("/crm/accounts", {
        method: "POST",
        body: JSON.stringify({ name: newAccountName.trim() }),
      });
      setNewAccountName("");
      setToast({ type: "success", message: "Account created" });
      await load();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Failed to create account" });
    }
  }

  async function createOpportunity() {
    if (!newOpportunityTitle.trim() || !newOpportunityAccountId) return;
    try {
      await apiFetch("/crm/opportunities", {
        method: "POST",
        body: JSON.stringify({
          title: newOpportunityTitle.trim(),
          account_id: newOpportunityAccountId,
          next_step: "Qualify needs and scope",
          amount_estimate: 5000,
          probability: 0.35,
        }),
      });
      setNewOpportunityTitle("");
      setToast({ type: "success", message: "Opportunity created" });
      await load();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Failed to create opportunity" });
    }
  }

  if (loading || !session) {
    return <div className="p-8 text-sm">Loading...</div>;
  }

  if (!session.active_project_id) {
    return (
      <PageShell title="CRM" subtitle="Accounts, opportunities and stage progression">
        <Card data-motion-item>
          <CardContent>
            <EmptyState
              title="Select active project first"
              description="CRM entities are strictly project scoped."
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
    <PageShell title="CRM" subtitle="Accounts/Opportunities with kanban stages and next-step discipline">
      <div className="space-y-4">
        <Card data-motion-item>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>CRM overview</CardTitle>
            <Button size="sm" variant="outline" onClick={load} disabled={busy}>
              {busy ? "Refreshing..." : "Refresh"}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <StatTile label="Accounts" value={overview?.accounts ?? 0} />
              <StatTile
                label="Open opportunities"
                value={filteredOpportunities.filter((item) => !["won", "lost"].includes(item.stage)).length}
              />
              <StatTile label="Identity links" value={overview?.links_by_status?.[0]?.count ?? 0} />
            </div>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Create records</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-2 md:flex-row">
              <Input
                value={newAccountName}
                onChange={(event) => setNewAccountName(event.target.value)}
                placeholder="New account name"
                className="md:max-w-sm"
              />
              <Button onClick={createAccount}>Create account</Button>
            </div>
            <div className="flex flex-col gap-2 md:flex-row">
              <Input
                value={newOpportunityTitle}
                onChange={(event) => setNewOpportunityTitle(event.target.value)}
                placeholder="Opportunity title"
                className="md:max-w-sm"
              />
              <Select value={newOpportunityAccountId} onValueChange={setNewOpportunityAccountId}>
                <SelectTrigger className="md:max-w-sm">
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={createOpportunity}>Create opportunity</Button>
            </div>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Opportunity kanban</CardTitle>
          </CardHeader>
          <CardContent>
            <Filters queryValue={query} onQueryChange={setQuery} queryPlaceholder="Search opportunities..." />
            <div className="mt-3">
              <Kanban columns={columns} />
            </div>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            <Table aria-label="CRM accounts">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.domain || "-"}</TableCell>
                    <TableCell>{row.stage}</TableCell>
                    <TableCell>{row.updated_at ? new Date(row.updated_at).toLocaleString() : "-"}</TableCell>
                  </TableRow>
                ))}
                {!accounts.length ? (
                  <TableRow>
                    <TableCell colSpan={4}>No accounts yet.</TableCell>
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
