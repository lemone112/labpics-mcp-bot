// TODO: Migrate manual useState/useEffect data fetching to useQuery (@tanstack/react-query).
// This page has 3 parallel fetches + 2 mutations — good candidate for useQuery + useMutation.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLoadingSkeleton } from "@/components/ui/page-loading-skeleton";
import { ProjectScopeRequired } from "@/components/project-scope-required";
import { StatTile } from "@/components/ui/stat-tile";
import { Toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Kanban } from "@/components/ui/kanban";
import { Filters } from "@/components/ui/filters";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useProjectGate } from "@/hooks/use-project-gate";

const stages = ["discovery", "qualified", "proposal", "negotiation", "won", "lost"];

export default function CrmFeaturePage() {
  const { loading, session } = useAuthGuard();
  const { hasProject, loadingProjects } = useProjectGate();
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
    if (!hasProject) return;
    setBusy(true);
    try {
      const results = await Promise.allSettled([
        apiFetch("/crm/overview"),
        apiFetch("/crm/accounts"),
        apiFetch("/crm/opportunities"),
      ]);
      const [overviewRes, accountsRes, opportunitiesRes] = results;
      const errors = [];
      if (overviewRes.status === "fulfilled") {
        setOverview(overviewRes.value);
      } else { errors.push("обзор"); }
      if (accountsRes.status === "fulfilled") {
        setAccounts(Array.isArray(accountsRes.value?.accounts) ? accountsRes.value.accounts : []);
      } else { errors.push("аккаунты"); }
      if (opportunitiesRes.status === "fulfilled") {
        setOpportunities(Array.isArray(opportunitiesRes.value?.opportunities) ? opportunitiesRes.value.opportunities : []);
      } else { errors.push("возможности"); }
      if (errors.length) {
        setToast({ type: "error", message: `Не удалось загрузить: ${errors.join(", ")}` });
      }
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Ошибка загрузки данных CRM" });
    } finally {
      setBusy(false);
    }
  }, [hasProject]);

  useEffect(() => {
    if (!loading && !loadingProjects && session?.authenticated && hasProject) {
      load();
    }
  }, [loading, loadingProjects, session, hasProject, load]);

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
            subtitle: item.account_name || "Без аккаунта",
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
        body: { name: newAccountName.trim() },
      });
      setNewAccountName("");
      setToast({ type: "success", message: "Аккаунт создан" });
      await load();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Ошибка создания аккаунта" });
    }
  }

  async function createOpportunity() {
    if (!newOpportunityTitle.trim() || !newOpportunityAccountId) return;
    try {
      await apiFetch("/crm/opportunities", {
        method: "POST",
        body: {
          title: newOpportunityTitle.trim(),
          account_id: newOpportunityAccountId,
          next_step: "Qualify needs and scope",
          amount_estimate: 5000,
          probability: 0.35,
        },
      });
      setNewOpportunityTitle("");
      setToast({ type: "success", message: "Возможность создана" });
      await load();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Ошибка создания возможности" });
    }
  }

  if (loading || !session || loadingProjects) {
    return (
      <PageShell title="CRM" subtitle="Аккаунты и возможности с kanban-стадиями и дисциплиной следующего шага">
        <PageLoadingSkeleton />
      </PageShell>
    );
  }

  if (!hasProject) {
    return (
      <PageShell title="CRM" subtitle="Аккаунты, возможности и прогресс стадий">
        <ProjectScopeRequired
          title="Сначала выберите активный проект"
          description="CRM сущности и стадии ведутся в рамках выбранного проекта."
        />
      </PageShell>
    );
  }

  return (
    <PageShell title="CRM" subtitle="Аккаунты и возможности с kanban-стадиями и дисциплиной следующего шага">
      <div className="space-y-4">
        <Card data-motion-item>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Обзор CRM</CardTitle>
            <Button size="sm" variant="outline" onClick={load} loading={busy}>
              Обновить
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <StatTile label="Аккаунты" value={overview?.accounts ?? 0} />
              <StatTile
                label="Открытые возможности"
                value={filteredOpportunities.filter((item) => !["won", "lost"].includes(item.stage)).length}
              />
              <StatTile label="Identity-связи" value={overview?.links_by_status?.[0]?.count ?? 0} />
            </div>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Создание записей</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-2 md:flex-row">
              <Input
                value={newAccountName}
                onChange={(event) => setNewAccountName(event.target.value)}
                placeholder="Название аккаунта"
                className="md:max-w-sm"
              />
              <Button onClick={createAccount}>Создать аккаунт</Button>
            </div>
            <div className="flex flex-col gap-2 md:flex-row">
              <Input
                value={newOpportunityTitle}
                onChange={(event) => setNewOpportunityTitle(event.target.value)}
                placeholder="Название возможности"
                className="md:max-w-sm"
              />
              <Select value={newOpportunityAccountId} onValueChange={setNewOpportunityAccountId}>
                <SelectTrigger className="md:max-w-sm">
                  <SelectValue placeholder="Выбрать аккаунт" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={createOpportunity}>Создать возможность</Button>
            </div>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Kanban возможностей</CardTitle>
          </CardHeader>
          <CardContent>
            <Filters queryValue={query} onQueryChange={setQuery} queryPlaceholder="Поиск возможностей..." />
            <div className="mt-3">
              <Kanban columns={columns} />
            </div>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Аккаунты</CardTitle>
          </CardHeader>
          <CardContent>
            <Table aria-label="CRM accounts">
              <TableHeader>
                <TableRow>
                  <TableHead>Название</TableHead>
                  <TableHead>Домен</TableHead>
                  <TableHead>Стадия</TableHead>
                  <TableHead>Обновлён</TableHead>
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
                    <TableCell colSpan={4} className="text-muted-foreground">Аккаунтов пока нет.</TableCell>
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
