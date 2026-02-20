"use client";

import { useCallback, useEffect, useState } from "react";

import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageLoadingSkeleton } from "@/components/ui/page-loading-skeleton";
import { ProjectScopeRequired } from "@/components/project-scope-required";
import { Toast } from "@/components/ui/toast";
import { StatusChip } from "@/components/ui/status-chip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useProjectGate } from "@/hooks/use-project-gate";

export default function OffersFeaturePage() {
  const { loading, session } = useAuthGuard();
  const { hasProject, loadingProjects } = useProjectGate();
  const [offers, setOffers] = useState([]);
  const [outbound, setOutbound] = useState([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState({ type: "info", message: "" });
  const [form, setForm] = useState({ title: "", subtotal: "12000", discount_pct: "0" });

  const load = useCallback(async () => {
    if (!hasProject) return;
    setBusy(true);
    try {
      const [offersResp, outboundResp] = await Promise.all([apiFetch("/offers"), apiFetch("/outbound")]);
      setOffers(Array.isArray(offersResp?.offers) ? offersResp.offers : []);
      setOutbound(Array.isArray(outboundResp?.outbound) ? outboundResp.outbound : []);
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Ошибка загрузки офферов/исходящих" });
    } finally {
      setBusy(false);
    }
  }, [hasProject]);

  useEffect(() => {
    if (!loading && !loadingProjects && session?.authenticated && hasProject) {
      load();
    }
  }, [loading, loadingProjects, session, hasProject, load]);

  async function createOffer() {
    if (!form.title.trim()) return;
    try {
      await apiFetch("/offers", {
        method: "POST",
        body: {
          title: form.title.trim(),
          subtotal: Number(form.subtotal || 0),
          discount_pct: Number(form.discount_pct || 0),
        },
      });
      setForm({ title: "", subtotal: "12000", discount_pct: "0" });
      setToast({ type: "success", message: "Оффер создан" });
      await load();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Ошибка создания оффера" });
    }
  }

  async function approveDiscount(id) {
    try {
      await apiFetch(`/offers/${id}/approve-discount`, { method: "POST", body: {} });
      setToast({ type: "success", message: "Скидка утверждена" });
      await load();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Ошибка утверждения скидки" });
    }
  }

  async function approveAndSend(id) {
    try {
      await apiFetch(`/offers/${id}/approve-send`, { method: "POST", body: {} });
      setToast({ type: "success", message: "Оффер помечен как отправленный" });
      await load();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Ошибка утверждения отправки" });
    }
  }

  async function createOutboundDraft() {
    try {
      await apiFetch("/outbound/draft", {
        method: "POST",
        body: {
          channel: "email",
          recipient_ref: "client@example.com",
          body_text: "Prepared updated offer and next steps for your review.",
          idempotency_key: `offer-draft-${Date.now()}`,
        },
      });
      setToast({ type: "success", message: "Черновик исходящего создан" });
      await load();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Ошибка создания черновика" });
    }
  }

  async function approveOutbound(id) {
    try {
      await apiFetch(`/outbound/${id}/approve`, { method: "POST", body: {} });
      await load();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Ошибка утверждения исходящего" });
    }
  }

  async function sendOutbound(id) {
    try {
      await apiFetch(`/outbound/${id}/send`, { method: "POST", body: {} });
      await load();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Ошибка отправки исходящего" });
    }
  }

  if (loading || !session || loadingProjects) {
    return (
      <PageShell title="Офферы и исходящие" subtitle="Жизненный цикл черновик→утверждение→отправка с идемпотентностью и лимитами">
        <PageLoadingSkeleton />
      </PageShell>
    );
  }

  if (!hasProject) {
    return (
      <PageShell title="Офферы" subtitle="Конструктор офферов и pipeline утверждения исходящих">
        <ProjectScopeRequired
          title="Сначала выберите активный проект"
          description="Offers и Outbox используют project scope для расчётов и политик отправки."
        />
      </PageShell>
    );
  }

  return (
    <PageShell title="Офферы и исходящие" subtitle="Жизненный цикл черновик→утверждение→отправка с идемпотентностью и лимитами">
      <div className="space-y-4">
        <Card data-motion-item>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Создать оффер</CardTitle>
            <Button variant="outline" size="sm" onClick={load} loading={busy}>
              Обновить
            </Button>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-2 md:grid-cols-4">
            <Input
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="Название оффера"
            />
            <Input
              type="number"
              value={form.subtotal}
              onChange={(event) => setForm((prev) => ({ ...prev, subtotal: event.target.value }))}
              placeholder="Сумма"
            />
            <Input
              type="number"
              value={form.discount_pct}
              onChange={(event) => setForm((prev) => ({ ...prev, discount_pct: event.target.value }))}
              placeholder="Скидка %"
            />
            <Button onClick={createOffer}>Создать</Button>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Офферы</CardTitle>
          </CardHeader>
          <CardContent>
            <Table aria-label="Offers table">
              <TableHeader>
                <TableRow>
                  <TableHead>Название</TableHead>
                  <TableHead>Цена</TableHead>
                  <TableHead>Скидка</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {offers.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.title}</TableCell>
                    <TableCell>${Number(row.total || 0).toLocaleString()}</TableCell>
                    <TableCell>{Number(row.discount_pct || 0)}%</TableCell>
                    <TableCell>
                      <StatusChip status={row.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => approveDiscount(row.id)}>
                          Утвердить скидку
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => approveAndSend(row.id)}>
                          Утвердить отправку
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!offers.length ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">Офферов пока нет.</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Очередь утверждения исходящих</CardTitle>
            <Button variant="secondary" size="sm" onClick={createOutboundDraft}>
              Новый черновик
            </Button>
          </CardHeader>
          <CardContent>
            <Table aria-label="Outbox queue">
              <TableHeader>
                <TableRow>
                  <TableHead>Получатель</TableHead>
                  <TableHead>Канал</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outbound.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.recipient_ref || "-"}</TableCell>
                    <TableCell>{row.channel}</TableCell>
                    <TableCell>
                      <StatusChip status={row.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => approveOutbound(row.id)}>
                          Утвердить
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => sendOutbound(row.id)}>
                          Отправить
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!outbound.length ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">Исходящих сообщений пока нет.</TableCell>
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
