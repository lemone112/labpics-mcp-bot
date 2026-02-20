"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageLoadingSkeleton } from "@/components/ui/page-loading-skeleton";
import { ProjectScopeRequired } from "@/components/project-scope-required";
import { Toast } from "@/components/ui/toast";
import { StatusChip } from "@/components/ui/status-chip";
import { Checkbox } from "@/components/ui/checkbox";
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
      setToast({ type: "error", message: error?.message || "Не удалось загрузить данные сигналов" });
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
      setToast({ type: "success", message: "Извлечение сигналов завершено" });
      await load();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Ошибка извлечения сигналов" });
    }
  }

  async function refreshUpsell() {
    try {
      await apiFetch("/upsell/radar/refresh", { method: "POST" });
      setToast({ type: "success", message: "Радар допродаж обновлён" });
      await load();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Ошибка обновления радара" });
    }
  }

  async function previewIdentity() {
    try {
      await apiFetch("/identity/suggestions/preview", { method: "POST", body: { limit: 120 } });
      setToast({ type: "success", message: "Предложения identity обновлены" });
      await load();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Ошибка preview identity" });
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
      setToast({ type: "success", message: "Identity-связи применены" });
      await load();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Ошибка применения identity" });
    }
  }

  async function previewContinuity() {
    try {
      await apiFetch("/continuity/preview", { method: "POST" });
      setToast({ type: "success", message: "Предпросмотр continuity сгенерирован" });
      await load();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Ошибка предпросмотра continuity" });
    }
  }

  async function applyContinuity() {
    const ids = Object.keys(selectedContinuity).filter((id) => selectedContinuity[id]);
    if (!ids.length) return;
    try {
      await apiFetch("/continuity/apply", { method: "POST", body: { action_ids: ids } });
      setSelectedContinuity({});
      setToast({ type: "success", message: "Continuity-действия применены к бэклогу Linear" });
      await load();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Ошибка применения continuity" });
    }
  }

  async function setNbaStatus(id, status) {
    try {
      await apiFetch(`/nba/${id}/status`, { method: "POST", body: { status } });
      await load();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Не удалось обновить статус NBA" });
    }
  }

  if (loading || !session || loadingProjects) {
    return (
      <PageShell title="Signals" subtitle="Извлечение, дедупликация, граф идентификации и next-best-actions">
        <PageLoadingSkeleton />
      </PageShell>
    );
  }

  if (!hasProject) {
    return (
      <PageShell title="Signals" subtitle="Сигналы, NBA и граф идентификации">
        <ProjectScopeRequired
          title="Сначала выберите активный проект"
          description="Сигналы и NBA считаются в проектном контексте. Выберите проект и обновите страницу."
        />
      </PageShell>
    );
  }

  return (
    <PageShell title="Signals" subtitle="Извлечение, дедупликация, граф идентификации и next-best-actions">
      <div className="space-y-4">
        <Card data-motion-item>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Действия</CardTitle>
            <Button size="sm" variant="outline" onClick={load} loading={busy}>
              Обновить
            </Button>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button onClick={runExtraction}>Извлечь сигналы</Button>
            <Button variant="secondary" onClick={refreshUpsell}>
              Обновить радар допродаж
            </Button>
            <Button variant="secondary" onClick={previewIdentity}>
              Предпросмотр identity-связей
            </Button>
            <Button variant="outline" onClick={applyIdentity}>
              Применить выбранные связи
            </Button>
            <Button variant="secondary" onClick={previewContinuity}>
              Предпросмотр deal→delivery
            </Button>
            <Button variant="outline" onClick={applyContinuity}>
              Применить выбранные continuity
            </Button>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Предложения identity-связей</CardTitle>
          </CardHeader>
          <CardContent>
            <Table aria-label="Предложения идентификации">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Связь</TableHead>
                  <TableHead>Уверенность</TableHead>
                  <TableHead>Статус</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {identitySuggestions.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Checkbox
                        checked={Boolean(selectedSuggestions[row.id])}
                        onCheckedChange={(checked) =>
                          setSelectedSuggestions((prev) => ({ ...prev, [row.id]: checked }))
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
                    <TableCell colSpan={4} className="text-muted-foreground">Предложений пока нет.</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Обнаруженные сигналы</CardTitle>
          </CardHeader>
          <CardContent>
            <Filters queryValue={query} onQueryChange={setQuery} queryPlaceholder="Фильтр по типу или описанию сигнала..." />
            <div className="mt-3">
              <Table aria-label="Сигналы">
                <TableHeader>
                  <TableRow>
                    <TableHead>Тип</TableHead>
                    <TableHead>Описание</TableHead>
                    <TableHead>Критичность</TableHead>
                    <TableHead>Уверенность</TableHead>
                    <TableHead>Статус</TableHead>
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
                      <TableCell colSpan={5} className="text-muted-foreground">Сигналов пока нет. Запустите извлечение.</TableCell>
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
            <Table aria-label="Список NBA">
              <TableHeader>
                <TableRow>
                  <TableHead>Описание</TableHead>
                  <TableHead>Приоритет</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Действие</TableHead>
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
                          Принять
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setNbaStatus(row.id, "done")}>
                          Выполнено
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!nba.length ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">NBA пока нет.</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Радар допродаж</CardTitle>
          </CardHeader>
          <CardContent>
            <Table aria-label="Радар допродаж">
              <TableHeader>
                <TableRow>
                  <TableHead>Название</TableHead>
                  <TableHead>Оценка</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Предложенное сообщение</TableHead>
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
                    <TableCell colSpan={4} className="text-muted-foreground">Возможностей допродаж пока нет.</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Предпросмотр deal→delivery continuity</CardTitle>
          </CardHeader>
          <CardContent>
            <Table aria-label="Continuity-действия">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Название</TableHead>
                  <TableHead>Источник</TableHead>
                  <TableHead>Статус</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {continuityActions.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Checkbox
                        checked={Boolean(selectedContinuity[row.id])}
                        onCheckedChange={(checked) =>
                          setSelectedContinuity((prev) => ({ ...prev, [row.id]: checked }))
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
                    <TableCell colSpan={4} className="text-muted-foreground">Предпросмотров continuity пока нет.</TableCell>
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
