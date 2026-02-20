"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Users,
  FolderKanban,
  MessageSquareText,
  ListChecks,
  Handshake,
  ShieldAlert,
  Sparkles,
  Radar,
  Newspaper,
  Clock,
  X,
  ArrowRight,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useCrossSearch } from "@/hooks/use-cross-search";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";

// ── Result Type Icons ──────────────────────────────────────────

const TYPE_CONFIG = {
  client: { icon: Users, label: "Клиенты", color: "text-primary" },
  project: { icon: FolderKanban, label: "Проекты", color: "text-primary" },
  message: { icon: MessageSquareText, label: "Сообщения", color: "text-muted-foreground" },
  job: { icon: ListChecks, label: "Задачи", color: "text-primary" },
  agreement: { icon: Handshake, label: "Договоренности", color: "text-success" },
  risk: { icon: ShieldAlert, label: "Риски", color: "text-destructive" },
  offer: { icon: Sparkles, label: "Офферы", color: "text-warning" },
  signal: { icon: Radar, label: "Сигналы", color: "text-primary" },
  digest: { icon: Newspaper, label: "Дайджесты", color: "text-muted-foreground" },
};

// ── Search Result Item ─────────────────────────────────────────

function SearchResultItem({ result, isSelected, onSelect }) {
  const config = TYPE_CONFIG[result.type] || TYPE_CONFIG.message;
  const Icon = config.icon;

  return (
    <button
      className={cn(
        "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
        "hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none",
        isSelected && "bg-accent/50",
      )}
      onClick={() => onSelect(result)}
      data-selected={isSelected || undefined}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", config.color)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{result.title}</span>
          {result.status ? (
            <Badge variant="outline" className="shrink-0 text-xs">
              {result.status}
            </Badge>
          ) : null}
        </div>
        {result.excerpt ? (
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
            {result.excerpt}
          </p>
        ) : null}
        {result.projectName ? (
          <span className="mt-0.5 text-xs text-muted-foreground">
            {result.projectName}
          </span>
        ) : null}
      </div>
      <ArrowRight className="mt-1 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

// ── Type Filter Pills ──────────────────────────────────────────

function TypeFilters({ countsByType, activeTypes, onToggleType }) {
  const types = Object.entries(countsByType).filter(([, count]) => count > 0);
  if (!types.length) return null;

  return (
    <div className="flex flex-wrap gap-1 px-3 pb-2">
      {types.map(([type, count]) => {
        const config = TYPE_CONFIG[type] || TYPE_CONFIG.message;
        const isActive = activeTypes.includes(type);
        return (
          <button
            key={type}
            onClick={() => onToggleType(type)}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors",
              isActive
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:bg-accent/50",
            )}
          >
            {config.label}
            <span className="font-semibold">{count}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Recent Searches ────────────────────────────────────────────

function RecentSearches({ searches, onSelect, onClear }) {
  if (!searches.length) return null;

  return (
    <div className="px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Недавние запросы</span>
        <button
          onClick={onClear}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Очистить
        </button>
      </div>
      <div className="mt-1.5 space-y-0.5">
        {searches.map((q) => (
          <button
            key={q}
            onClick={() => onSelect(q)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
          >
            <Clock className="size-3.5 shrink-0" />
            <span className="truncate">{q}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Command Search Dialog ──────────────────────────────────────

/**
 * CommandSearch — global search dialog (Cmd+K / Ctrl+K).
 *
 * Features:
 * - Keyboard shortcut to open (Cmd/Ctrl + K)
 * - Debounced search with faceted results
 * - Recent search history
 * - Keyboard navigation (arrow keys + Enter)
 * - Type filter pills
 *
 * @param {{
 *   open?: boolean,
 *   onOpenChange?: (open: boolean) => void,
 * }} props
 */
export function CommandSearch({ open: controlledOpen, onOpenChange }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [activeTypes, setActiveTypes] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const router = useRouter();

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;

  const {
    query,
    setQuery,
    isSearching,
    results,
    totalCount,
    countsByType,
    suggestions,
    recentSearches,
    search,
    clearResults,
    clearRecentSearches,
  } = useCrossSearch({
    filters: { types: activeTypes.length ? activeTypes : undefined },
    enabled: isOpen,
  });

  // Keyboard shortcut: Cmd/Ctrl + K
  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape" && isOpen) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, setOpen]);

  // Focus input when dialog opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      clearResults();
      setActiveTypes([]);
      setSelectedIndex(0);
    }
  }, [isOpen, clearResults]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  const handleToggleType = useCallback((type) => {
    setActiveTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  }, []);

  const handleSelect = useCallback(
    (result) => {
      if (result?.href) {
        router.push(result.href);
        setOpen(false);
      }
    },
    [router, setOpen],
  );

  const handleRecentSelect = useCallback(
    (q) => {
      setQuery(q);
      search(q);
    },
    [setQuery, search],
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && results[selectedIndex]) {
        e.preventDefault();
        handleSelect(results[selectedIndex]);
      }
    },
    [results, selectedIndex, handleSelect],
  );

  const showRecent = !query && recentSearches.length > 0;
  const showResults = query.length >= 2 && results.length > 0;
  const showEmpty = query.length >= 2 && !isSearching && results.length === 0;

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0 sm:max-w-xl">
        {/* Search input */}
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Поиск по клиентам, проектам, сообщениям..."
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            aria-label="Глобальный поиск"
          />
          {query ? (
            <button
              onClick={clearResults}
              className="rounded-sm p-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-4" />
            </button>
          ) : (
            <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground sm:inline-block">
              ESC
            </kbd>
          )}
        </div>

        {/* Content area */}
        <div className="max-h-[400px] overflow-y-auto">
          {/* Type filters */}
          {Object.keys(countsByType).length > 0 ? (
            <div className="border-b pt-2">
              <TypeFilters
                countsByType={countsByType}
                activeTypes={activeTypes}
                onToggleType={handleToggleType}
              />
            </div>
          ) : null}

          {/* Recent searches */}
          {showRecent ? (
            <RecentSearches
              searches={recentSearches}
              onSelect={handleRecentSelect}
              onClear={clearRecentSearches}
            />
          ) : null}

          {/* Loading */}
          {isSearching ? (
            <div className="flex items-center justify-center py-8">
              <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : null}

          {/* Results */}
          {showResults && !isSearching ? (
            <div className="p-2">
              {results.map((result, index) => (
                <SearchResultItem
                  key={result.id}
                  result={result}
                  isSelected={index === selectedIndex}
                  onSelect={handleSelect}
                />
              ))}
              {totalCount > results.length ? (
                <div className="px-3 py-2 text-center">
                  <button
                    onClick={() => {
                      router.push(`/search?q=${encodeURIComponent(query)}`);
                      setOpen(false);
                    }}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Показать все {totalCount} результатов
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Empty state */}
          {showEmpty ? (
            <div className="p-4">
              <EmptyState
                title="Ничего не найдено"
                description={`По запросу "${query}" нет результатов.`}
              />
              {suggestions.length > 0 ? (
                <div className="mt-3 text-center">
                  <span className="text-xs text-muted-foreground">Попробуйте: </span>
                  {suggestions.map((s, i) => (
                    <button
                      key={s}
                      onClick={() => handleRecentSelect(s)}
                      className="text-xs text-primary hover:underline"
                    >
                      {i > 0 ? ", " : ""}
                      {s}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Hint when empty and no recent */}
          {!showRecent && !showResults && !showEmpty && !isSearching ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              Введите запрос для поиска (от 2 символов)
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <kbd className="rounded border bg-muted px-1 py-0.5">&uarr;&darr;</kbd>
            <span>навигация</span>
            <kbd className="rounded border bg-muted px-1 py-0.5">&crarr;</kbd>
            <span>открыть</span>
          </div>
          {totalCount > 0 ? (
            <span>{totalCount} результатов</span>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
