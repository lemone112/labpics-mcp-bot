"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock, Search, Trash2, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "labpics:search_history";
const MAX_HISTORY = 20;

/** Popular query suggestions (static, could be dynamic from analytics later) */
const POPULAR_QUERIES = [
  "статус проекта",
  "дедлайн релиза",
  "обратная связь от клиента",
  "блокирующие задачи",
  "план на спринт",
  "бюджет и расходы",
];

// --- localStorage helpers ---

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

function saveHistory(history) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  } catch {
    // Quota exceeded or unavailable - silently ignore
  }
}

/**
 * Add a query to search history (deduplicates, moves to top, trims to MAX_HISTORY).
 */
export function addToSearchHistory(query) {
  const trimmed = String(query || "").trim();
  if (!trimmed || trimmed.length < 2) return;

  const history = loadHistory();
  const filtered = history.filter((h) => h.toLowerCase() !== trimmed.toLowerCase());
  const next = [trimmed, ...filtered].slice(0, MAX_HISTORY);
  saveHistory(next);
}

/**
 * Clear all search history.
 */
export function clearSearchHistory() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Search suggestions component with recent history and popular queries.
 * Uses shadcn/ui Command for keyboard navigation.
 *
 * @param {object} props
 * @param {string} props.query - Current input value
 * @param {boolean} props.open - Whether the suggestion dropdown is open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {(query: string) => void} props.onSelectQuery - Callback when a suggestion is selected
 * @param {React.ReactNode} props.children - The trigger element (search input)
 * @param {string} [props.className]
 */
export function SearchSuggestions({
  query,
  open,
  onOpenChange,
  onSelectQuery,
  children,
  className,
}) {
  const [history, setHistory] = useState([]);

  // Load history on mount and when popover opens
  useEffect(() => {
    if (open) {
      setHistory(loadHistory());
    }
  }, [open]);

  const filteredHistory = useMemo(() => {
    if (!query) return history;
    const lowerQuery = query.toLowerCase();
    return history.filter((h) => h.toLowerCase().includes(lowerQuery));
  }, [history, query]);

  const filteredPopular = useMemo(() => {
    if (!query) return POPULAR_QUERIES;
    const lowerQuery = query.toLowerCase();
    // Exclude items that are already in history
    const historySet = new Set(history.map((h) => h.toLowerCase()));
    return POPULAR_QUERIES.filter(
      (p) => p.toLowerCase().includes(lowerQuery) && !historySet.has(p.toLowerCase())
    );
  }, [query, history]);

  function handleSelect(value) {
    onSelectQuery(value);
    onOpenChange(false);
  }

  function handleClearHistory() {
    clearSearchHistory();
    setHistory([]);
  }

  function handleRemoveHistoryItem(item, event) {
    event.stopPropagation();
    const next = history.filter((h) => h !== item);
    saveHistory(next);
    setHistory(next);
  }

  const hasContent = filteredHistory.length > 0 || filteredPopular.length > 0;

  return (
    <Popover open={open && hasContent} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command className={cn("rounded-lg", className)}>
          <CommandList>
            {/* Recent searches */}
            {filteredHistory.length > 0 ? (
              <CommandGroup heading="Недавние запросы">
                {filteredHistory.map((item) => (
                  <CommandItem
                    key={`history-${item}`}
                    value={item}
                    onSelect={() => handleSelect(item)}
                    className="group/item"
                  >
                    <Clock className="size-3.5 text-muted-foreground" />
                    <span className="flex-1 truncate">{item}</span>
                    <button
                      type="button"
                      className="invisible shrink-0 rounded-sm p-0.5 text-muted-foreground/50 transition-colors hover:text-destructive group-data-[selected=true]/item:visible"
                      onClick={(e) => handleRemoveHistoryItem(item, e)}
                      aria-label={`Удалить "${item}" из истории`}
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}

            {filteredHistory.length > 0 && filteredPopular.length > 0 ? (
              <CommandSeparator />
            ) : null}

            {/* Popular queries */}
            {filteredPopular.length > 0 ? (
              <CommandGroup heading="Популярные запросы">
                {filteredPopular.map((item) => (
                  <CommandItem
                    key={`popular-${item}`}
                    value={item}
                    onSelect={() => handleSelect(item)}
                  >
                    <TrendingUp className="size-3.5 text-muted-foreground" />
                    <span className="flex-1 truncate">{item}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}

            <CommandEmpty className="py-3 text-xs">
              Нет подходящих подсказок
            </CommandEmpty>

            {/* Clear history footer */}
            {history.length > 0 ? (
              <>
                <CommandSeparator />
                <div className="p-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-full justify-start gap-2 px-2 text-xs text-muted-foreground"
                    onClick={handleClearHistory}
                  >
                    <Trash2 className="size-3" />
                    Очистить историю
                  </Button>
                </div>
              </>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
