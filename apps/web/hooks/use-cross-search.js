"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;
const MAX_RECENT_SEARCHES = 8;
const STORAGE_KEY = "labpics:recent-searches";

/**
 * Reads recent searches from localStorage.
 * @returns {string[]}
 */
function loadRecentSearches() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw).slice(0, MAX_RECENT_SEARCHES) : [];
  } catch {
    return [];
  }
}

/**
 * Saves a query to recent searches in localStorage.
 * @param {string} query
 */
function saveRecentSearch(query) {
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

/**
 * useCrossSearch — global search across all sections.
 *
 * Features:
 * - Debounced query (300ms)
 * - Faceted results by type
 * - Recent search history (localStorage)
 * - Minimum query length (2 chars)
 *
 * @param {{
 *   filters?: import("@/types/cross-search").SearchFilters,
 *   enabled?: boolean,
 * }} options
 * @returns {import("@/types/cross-search").SearchState & {
 *   setQuery: (q: string) => void,
 *   search: (q?: string) => Promise<void>,
 *   clearResults: () => void,
 *   clearRecentSearches: () => void,
 * }}
 */
export function useCrossSearch(options = {}) {
  const { filters = {}, enabled = true } = options;

  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [countsByType, setCountsByType] = useState({});
  const [suggestions, setSuggestions] = useState([]);
  const [recentSearches, setRecentSearches] = useState(() => loadRecentSearches());
  const [error, setError] = useState(null);

  const debounceRef = useRef(null);
  const abortRef = useRef(null);

  const stableFilters = useMemo(
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
    ],
  );

  const performSearch = useCallback(
    async (searchQuery) => {
      const trimmed = String(searchQuery || "").trim();
      if (trimmed.length < MIN_QUERY_LENGTH) {
        setResults([]);
        setTotalCount(0);
        setCountsByType({});
        setSuggestions([]);
        setError(null);
        return;
      }

      // Abort any in-flight request
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      setIsSearching(true);
      setError(null);

      try {
        const params = new URLSearchParams({ q: trimmed });
        if (stableFilters.types.length) {
          params.set("types", stableFilters.types.join(","));
        }
        if (stableFilters.projectId) {
          params.set("project_id", stableFilters.projectId);
        }
        if (stableFilters.dateFrom) {
          params.set("date_from", stableFilters.dateFrom);
        }
        if (stableFilters.dateTo) {
          params.set("date_to", stableFilters.dateTo);
        }
        if (stableFilters.status.length) {
          params.set("status", stableFilters.status.join(","));
        }

        const data = await apiFetch(`/search?${params.toString()}`);

        // Check if request was aborted during fetch
        if (controller.signal.aborted) return;

        setResults(Array.isArray(data?.results) ? data.results : []);
        setTotalCount(data?.totalCount ?? 0);
        setCountsByType(data?.countsByType ?? {});
        setSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []);

        // Save to recent searches
        saveRecentSearch(trimmed);
        setRecentSearches(loadRecentSearches());
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err?.message || "Search failed");
        setResults([]);
        setTotalCount(0);
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      }
    },
    [stableFilters],
  );

  // Debounced auto-search on query change
  useEffect(() => {
    if (!enabled) return;

    clearTimeout(debounceRef.current);

    if (query.trim().length < MIN_QUERY_LENGTH) {
      setResults([]);
      setTotalCount(0);
      setCountsByType({});
      setIsSearching(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      performSearch(query);
    }, DEBOUNCE_MS);

    return () => clearTimeout(debounceRef.current);
  }, [query, enabled, performSearch]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimeout(debounceRef.current);
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
    async (q) => {
      const searchQuery = q !== undefined ? q : query;
      setQuery(searchQuery);
      clearTimeout(debounceRef.current);
      await performSearch(searchQuery);
    },
    [query, performSearch],
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
