"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search as SearchIcon, SlidersHorizontal } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageLoadingSkeleton } from "@/components/ui/page-loading-skeleton";
import { ProjectScopeRequired } from "@/components/project-scope-required";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useProjectGate } from "@/hooks/use-project-gate";

import { SearchFilters, createDefaultFilters } from "./search-filters";
import { SearchResultCard, SearchResultsEmpty } from "./search-result-card";
import { SearchSuggestions, addToSearchHistory } from "./search-suggestions";

export default function SearchFeaturePage() {
  const { loading, session } = useAuthGuard();
  const { hasProject, loadingProjects } = useProjectGate();

  // Search state
  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState(10);
  const [busy, setBusy] = useState(false);
  const [debouncePending, setDebouncePending] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const inputRef = useRef(null);
  const skipDebouncedSearchRef = useRef(false);

  // Results state
  const [chunks, setChunks] = useState([]);
  const [evidence, setEvidence] = useState([]);
  const [answer, setAnswer] = useState("");
  const [meta, setMeta] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Filters state
  const [filters, setFilters] = useState(createDefaultFilters);

  const { addToast } = useToast();

  const totalEvidence = Number(meta?.evidenceTotal || 0);
  const totalPages = Math.max(1, Math.ceil(totalEvidence / pageSize));

  /**
   * Execute search with current query and filters.
   */
  const executeSearch = useCallback(async (searchQuery, searchFilters, options = {}) => {
    const q = (searchQuery ?? query).trim();
    if (!q) return;

    setBusy(true);
    setHasSearched(true);
    setSuggestionsOpen(false);


    try {
      // Build source filter from selected types
      const sourceFilter = searchFilters?.sourceTypes?.length
        ? searchFilters.sourceTypes
        : null;
      const dateFrom = searchFilters?.dateRange?.from || null;
      const dateTo = searchFilters?.dateRange?.to || null;

      const offset = Math.max(0, Number(options.offset) || 0);
      const limit = Math.max(1, Number(options.limit) || pageSize);

      if (offset === 0 && options.saveHistory !== false) {
        addToSearchHistory(q);
      }

      const startTime = Date.now();
      const data = await apiFetch("/lightrag/query", {
        method: "POST",
        body: {
          query: q,
          topK: Number(topK) || 10,
          sourceFilter,
          date_from: dateFrom,
          date_to: dateTo,
          offset,
          limit,
        },
        timeoutMs: 10_000,
      });
      const clientDuration = Date.now() - startTime;

      setChunks(Array.isArray(data?.chunks) ? data.chunks : []);
      setEvidence(Array.isArray(data?.evidence) ? data.evidence : []);
      setAnswer(String(data?.answer || ""));
      const totalResults = Number(data?.evidence_total) || (data?.evidence || []).length;
      setMeta({
        stats: data?.stats || {},
        topK: data?.topK,
        rankingStats: data?.ranking_stats || null,
        durationMs: data?.duration_ms || clientDuration,
        qualityScore: data?.quality_score,
        evidenceTotal: totalResults,
        evidenceOffset: Number(data?.evidence_offset) || offset,
        evidenceLimit: Number(data?.evidence_limit) || limit,
      });

      if (!options.silentToast) {
        addToast({
          type: "success",
          message: `Найдено ${totalResults} результатов (${data?.stats?.chunks || 0} chunks)`,
        });
      }

      // Track search analytics (fire-and-forget)
      apiFetch("/search/analytics", {
        method: "POST",
        body: {
          query: q,
          result_count: totalResults,
          filters: { sourceFilter, topK: Number(topK) || 10, dateFrom, dateTo },
          event_type: "search",
          duration_ms: data?.duration_ms || clientDuration,
        },
      }).catch(() => {});
    } catch (error) {
      addToast({
        type: "error",
        message: error?.message || "Не удалось выполнить запрос LightRAG",
      });
    } finally {
      setBusy(false);
    }
  }, [query, topK, addToast, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [query, filters, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (!hasSearched) return;

    if (skipDebouncedSearchRef.current) {
      skipDebouncedSearchRef.current = false;
      setDebouncePending(false);
      return;
    }

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setDebouncePending(false);
      return;
    }

    setDebouncePending(true);
    const timeoutId = setTimeout(() => {
      executeSearch(trimmedQuery, filters, { offset: 0, limit: pageSize, silentToast: true, saveHistory: false });
      setDebouncePending(false);
    }, 300);

    return () => {
      clearTimeout(timeoutId);
      setDebouncePending(false);
    };
  }, [query, filters, hasSearched, executeSearch, pageSize]);

  /**
   * Form submission handler.
   */
  function onSearch(event) {
    event.preventDefault();
    skipDebouncedSearchRef.current = true;
    executeSearch(query, filters, { offset: 0, limit: pageSize });
  }

  /**
   * Handle suggestion selection from dropdown.
   */
  function onSelectSuggestion(suggestion) {
    setQuery(suggestion);
    // Execute search immediately with the suggestion
    skipDebouncedSearchRef.current = true;
    executeSearch(suggestion, filters, { offset: 0, limit: pageSize });
  }

  /**
   * Handle filter changes — re-execute search if there's a query.
   */
  function onFiltersChange(nextFilters) {
    setFilters(nextFilters);
    if (query.trim() && hasSearched) {
      skipDebouncedSearchRef.current = true;
      executeSearch(query, nextFilters, { offset: 0, limit: pageSize });
    }
  }


  useEffect(() => {
    if (!hasSearched || !query.trim()) return;
    const offset = (currentPage - 1) * pageSize;
    skipDebouncedSearchRef.current = true;
    executeSearch(query, filters, { offset, limit: pageSize, silentToast: true, saveHistory: false });
  }, [currentPage, pageSize, hasSearched, query, filters, executeSearch]);

  /**
   * Track result click analytics.
   */
  function onClickResult(item) {
    apiFetch("/search/analytics", {
      method: "POST",
      body: {
        query,
        result_count: totalEvidence,
        filters: { sourceFilter: filters.sourceTypes, topK },
        clicked_result_id: item.source_pk || item.source_ref || null,
        clicked_source_type: item.source_type || null,
        event_type: "click",
      },
    }).catch(() => {});
  }

  // --- Guard states ---
  if (loading || !session || loadingProjects) {
    return (
      <PageShell title="Search" subtitle="Единый поиск по сообщениям, задачам и сделкам">
        <PageLoadingSkeleton />
      </PageShell>
    );
  }

  if (!hasProject) {
    return (
      <PageShell title="Search" subtitle="Единый поиск по сообщениям, задачам и сделкам">
        <ProjectScopeRequired
          title="Сначала выберите активный проект"
          description="Поиск выполняется в project scope. Выберите проект перед выполнением запроса."
        />
      </PageShell>
    );
  }

  return (
    <PageShell title="Search" subtitle="Единый поиск по сообщениям, задачам и сделкам">
      <div className="space-y-4">
        {/* Search input bar */}
        <Card data-motion-item>
          <CardContent className="p-4">
            <form className="flex items-center gap-3" onSubmit={onSearch}>
              <div className="relative flex-1">
                <SearchSuggestions
                  query={query}
                  open={suggestionsOpen}
                  onOpenChange={setSuggestionsOpen}
                  onSelectQuery={onSelectSuggestion}
                >
                  <div className="relative">
                    <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      ref={inputRef}
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        if (e.target.value.length >= 2) {
                          setSuggestionsOpen(true);
                        }
                      }}
                      onFocus={() => {
                        if (query.length >= 2 || !query) {
                          setSuggestionsOpen(true);
                        }
                      }}
                      placeholder="Что обещал клиент по дедлайну релиза?"
                      className="pl-9"
                      required
                      autoComplete="off"
                    />
                  </div>
                </SearchSuggestions>
              </div>
              <Input
                type="number"
                min={1}
                max={50}
                value={topK}
                onChange={(e) => setTopK(e.target.value)}
                className="w-20"
                title="Top K результатов"
              />
              <Button type="submit" loading={busy}>
                <SearchIcon className="size-4" />
                Найти
              </Button>
              {debouncePending ? (
                <Badge variant="secondary" className="whitespace-nowrap">
                  Обновляем через 300мс…
                </Badge>
              ) : null}
              <Button
                type="button"
                variant={showFilters ? "secondary" : "outline"}
                size="icon"
                onClick={() => setShowFilters((v) => !v)}
                title={showFilters ? "Скрыть фильтры" : "Показать фильтры"}
              >
                <SlidersHorizontal className="size-4" />
              </Button>
            </form>

            {/* Stats badges */}
            {meta ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="outline">topK: {meta.topK || "-"}</Badge>
                <Badge variant="outline">chunks: {meta?.stats?.chunks || 0}</Badge>
                <Badge variant="outline">сообщения: {meta?.stats?.messages || 0}</Badge>
                <Badge variant="outline">задачи: {meta?.stats?.issues || 0}</Badge>
                <Badge variant="outline">сделки: {meta?.stats?.opportunities || 0}</Badge>
                {meta.durationMs ? (
                  <Badge variant="outline">{meta.durationMs}ms</Badge>
                ) : null}
                {meta.qualityScore != null ? (
                  <Badge variant="outline">quality: {meta.qualityScore}%</Badge>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Main content area: filters sidebar + results */}
        <div className="flex gap-4">
          {/* Filters sidebar */}
          {showFilters ? (
            <aside className="hidden w-64 shrink-0 lg:block" data-motion-item>
              <Card className="sticky top-20">
                <CardContent className="p-4">
                  <SearchFilters
                    filters={filters}
                    onFiltersChange={onFiltersChange}
                  />
                </CardContent>
              </Card>
            </aside>
          ) : null}

          {/* Results area */}
          <div className="min-w-0 flex-1 space-y-4">
            {/* Brief answer */}
            {answer ? (
              <Card data-motion-item>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Краткий ответ</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-muted-foreground">{answer}</p>
                </CardContent>
              </Card>
            ) : null}

            {/* Evidence results — rich cards */}
            {evidence.length > 0 ? (
              <div className="space-y-3" data-motion-item>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-foreground">
                    Результаты
                    <span className="ml-2 text-muted-foreground">({totalEvidence})</span>
                  </h3>
                  {meta?.rankingStats ? (
                    <span className="text-xs text-muted-foreground">
                      avg score: {Math.round((meta.rankingStats.avgScore || 0) * 100)}%
                    </span>
                  ) : null}
                </div>
                {evidence.map((item, idx) => (
                  <SearchResultCard
                    key={`${item.source_type}-${item.source_pk || idx}`}
                    item={item}
                    query={query}
                    onClickResult={onClickResult}
                  />
                ))}

                {totalEvidence > 0 ? (
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                    <p className="text-xs text-muted-foreground">
                      Показано {Math.min((meta?.evidenceOffset || 0) + 1, totalEvidence)}-{Math.min((meta?.evidenceOffset || 0) + evidence.length, totalEvidence)} из {totalEvidence}
                    </p>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-muted-foreground" htmlFor="search-page-size">
                        На странице
                      </label>
                      <select
                        id="search-page-size"
                        value={String(pageSize)}
                        onChange={(e) => { setCurrentPage(1); setPageSize(Number(e.target.value)); }}
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                      >
                        <option value="5">5</option>
                        <option value="10">10</option>
                        <option value="20">20</option>
                      </select>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={currentPage <= 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      >
                        Назад
                      </Button>
                      <span className="min-w-20 text-center text-xs text-muted-foreground">
                        {currentPage} / {totalPages}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={currentPage >= totalPages}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      >
                        Вперёд
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : hasSearched ? (
              <SearchResultsEmpty query={query} />
            ) : (
              <EmptyState
                title="Поиск по всем источникам"
                description="Введите запрос для поиска по сообщениям Chatwoot, задачам Linear и сделкам Attio."
              />
            )}

            {/* Chunk detail table (collapsible, for advanced users) */}
            {chunks.length > 0 ? (
              <Card data-motion-item>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Chunk-результаты (debug)</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Distance</TableHead>
                        <TableHead>Conversation</TableHead>
                        <TableHead>Message</TableHead>
                        <TableHead>Фрагмент</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {chunks.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>
                            {row.distance != null ? Number(row.distance).toFixed(4) : "-"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {row.conversation_global_id || "-"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {row.message_global_id || "-"}
                          </TableCell>
                          <TableCell className="max-w-[460px] whitespace-pre-wrap">
                            {row.text}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
