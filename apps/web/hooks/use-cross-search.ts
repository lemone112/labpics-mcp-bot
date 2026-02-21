"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;
const MAX_RECENT_SEARCHES = 8;
const STORAGE_KEY = "labpics:recent-searches";

type SearchFilters = {
  types?: string[];
  projectId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  status?: string[];
};

type SearchResult = Record<string, unknown>;

type CrossSearchState = {
  query: string;
  setQuery: (value: string) => void;
  filters: Required<SearchFilters>;
  isSearching: boolean;
  results: SearchResult[];
  totalCount: number;
  countsByType: Record<string, number>;
  suggestions: string[];
  recentSearches: string[];
  error: string | null;
  search: (q?: string) => Promise<void>;
  clearResults: () => void;
  clearRecentSearches: () => void;
};

function loadRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item || "")).filter(Boolean).slice(0, MAX_RECENT_SEARCHES)
      : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string): void {
  if (typeof window === "undefined" || !query.trim()) return;
  try {
    const existing = loadRecentSearches();
    const filtered = existing.filter((q) => q !== query);
    const updated = [query, ...filtered].slice(0, MAX_RECENT_SEARCHES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore storage errors
  }
}

export function useCrossSearch(options: { filters?: SearchFilters; enabled?: boolean } = {}): CrossSearchState {
  const { filters = {}, enabled = true } = options;

  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [countsByType, setCountsByType] = useState<Record<string, number>>({});
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => loadRecentSearches());
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stableFilters = useMemo<Required<SearchFilters>>(
    () => ({
      types: filters.types || [],
      projectId: filters.projectId || null,
      dateFrom: filters.dateFrom || null,
      dateTo: filters.dateTo || null,
      status: filters.status || [],
    }),
    [
      filters.types?.join(","),
      filters.projectId,
      filters.dateFrom,
      filters.dateTo,
      filters.status?.join(","),
    ]
  );

  const performSearch = useCallback(
    async (searchQuery: string) => {
      const trimmed = String(searchQuery || "").trim();
      if (trimmed.length < MIN_QUERY_LENGTH) {
        setResults([]);
        setTotalCount(0);
        setCountsByType({});
        setSuggestions([]);
        setError(null);
        return;
      }

      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      setIsSearching(true);
      setError(null);

      try {
        const params = new URLSearchParams({ q: trimmed });
        if (stableFilters.types.length) params.set("types", stableFilters.types.join(","));
        if (stableFilters.projectId) params.set("project_id", stableFilters.projectId);
        if (stableFilters.dateFrom) params.set("date_from", stableFilters.dateFrom);
        if (stableFilters.dateTo) params.set("date_to", stableFilters.dateTo);
        if (stableFilters.status.length) params.set("status", stableFilters.status.join(","));

        const data = await apiFetch(`/search?${params.toString()}`);
        if (controller.signal.aborted) return;

        setResults(Array.isArray((data as { results?: unknown[] } | null)?.results) ? ((data as { results: unknown[] }).results as SearchResult[]) : []);
        setTotalCount((data as { totalCount?: number } | null)?.totalCount ?? 0);
        setCountsByType((data as { countsByType?: Record<string, number> } | null)?.countsByType ?? {});
        setSuggestions(
          Array.isArray((data as { suggestions?: unknown[] } | null)?.suggestions)
            ? (data as { suggestions: unknown[] }).suggestions.map((s) => String(s || "")).filter(Boolean)
            : []
        );

        saveRecentSearch(trimmed);
        setRecentSearches(loadRecentSearches());
      } catch (err) {
        if (controller.signal.aborted) return;
        setError((err as { message?: string } | null)?.message || "Search failed");
        setResults([]);
        setTotalCount(0);
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      }
    },
    [stableFilters]
  );

  useEffect(() => {
    if (!enabled) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < MIN_QUERY_LENGTH) {
      setResults([]);
      setTotalCount(0);
      setCountsByType({});
      setIsSearching(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      void performSearch(query);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, enabled, performSearch]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const clearResults = useCallback(() => {
    setQuery("");
    setResults([]);
    setTotalCount(0);
    setCountsByType({});
    setSuggestions([]);
    setError(null);
  }, []);

  const clearRecentSearches = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    setRecentSearches([]);
  }, []);

  const search = useCallback(
    async (q?: string) => {
      const searchQuery = q !== undefined ? q : query;
      setQuery(searchQuery);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      await performSearch(searchQuery);
    },
    [query, performSearch]
  );

  return {
    query,
    setQuery,
    filters: stableFilters,
    isSearching,
    results,
    totalCount,
    countsByType,
    suggestions,
    recentSearches,
    error,
    search,
    clearResults,
    clearRecentSearches,
  };
}
