"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { CalendarIcon, Filter, MessageSquare, TicketCheck, Handshake, X } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/** Available source type filters */
const SOURCE_TYPES = [
  { id: "messages", label: "Chatwoot", Icon: MessageSquare, color: "text-primary" },
  { id: "issues", label: "Linear", Icon: TicketCheck, color: "text-accent-foreground" },
  { id: "deals", label: "Attio", Icon: Handshake, color: "text-muted-foreground" },
];

/**
 * Debounce utility: returns a function that delays invocation.
 */
function useDebounce(callback, delayMs = 300) {
  const timerRef = useRef(null);
  return useCallback(
    (...args) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => callback(...args), delayMs);
    },
    [callback, delayMs]
  );
}

/**
 * SearchFilters component for filtering search results.
 *
 * @param {object} props
 * @param {object} props.filters - Current filter state
 * @param {string[]} props.filters.sourceTypes - Selected source type IDs
 * @param {{ from?: Date, to?: Date }} props.filters.dateRange - Date range
 * @param {string|null} props.filters.project - Selected project ID
 * @param {(filters: object) => void} props.onFiltersChange - Callback when filters change
 * @param {Array<{id: string, name: string}>} [props.projects] - Available projects
 * @param {string} [props.className]
 */
export function SearchFilters({ filters, onFiltersChange, projects = [], className }) {
  const debouncedChange = useDebounce(onFiltersChange, 300);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.sourceTypes?.length > 0 && filters.sourceTypes.length < SOURCE_TYPES.length) count += 1;
    if (filters.dateRange?.from || filters.dateRange?.to) count += 1;
    if (filters.project) count += 1;
    return count;
  }, [filters]);

  function updateFilters(partial) {
    const next = { ...filters, ...partial };
    debouncedChange(next);
  }

  function toggleSourceType(typeId) {
    const current = filters.sourceTypes || [];
    const next = current.includes(typeId)
      ? current.filter((id) => id !== typeId)
      : [...current, typeId];
    updateFilters({ sourceTypes: next });
  }

  function setDateRange(range) {
    updateFilters({ dateRange: range || {} });
  }

  function setProject(projectId) {
    updateFilters({ project: projectId === "__all__" ? null : projectId });
  }

  function clearAllFilters() {
    onFiltersChange({
      sourceTypes: [],
      dateRange: {},
      project: null,
    });
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Filter header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Filter className="size-4" />
          <span>Фильтры</span>
          {activeFilterCount > 0 ? (
            <Badge variant="secondary" className="h-5 min-w-5 justify-center px-1.5 text-[10px]">
              {activeFilterCount}
            </Badge>
          ) : null}
        </div>
        {activeFilterCount > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground"
            onClick={clearAllFilters}
          >
            <X className="size-3" />
            Сбросить
          </Button>
        ) : null}
      </div>

      <Separator />

      {/* Source type filter */}
      <div className="space-y-2.5">
        <Label className="text-xs font-semibold tracking-wide text-muted-foreground">
          Источники
        </Label>
        <div className="space-y-2">
          {SOURCE_TYPES.map(({ id, label, Icon, color }) => {
            const checked = !filters.sourceTypes?.length || filters.sourceTypes.includes(id);
            return (
              <label
                key={id}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggleSourceType(id)}
                />
                <Icon className={cn("size-4", color)} />
                <span>{label}</span>
              </label>
            );
          })}
        </div>
      </div>

      <Separator />

      {/* Date range filter */}
      <div className="space-y-2.5">
        <Label className="text-xs font-semibold tracking-wide text-muted-foreground">
          Период
        </Label>
        <DateRangePicker
          dateRange={filters.dateRange || {}}
          onDateRangeChange={setDateRange}
        />
      </div>

      <Separator />

      {/* Project filter */}
      {projects.length > 0 ? (
        <div className="space-y-2.5">
          <Label className="text-xs font-semibold tracking-wide text-muted-foreground">
            Проект
          </Label>
          <Select
            value={filters.project || "__all__"}
            onValueChange={setProject}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Все проекты" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Все проекты</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Date range picker using two Calendar popovers (From / To).
 */
function DateRangePicker({ dateRange, onDateRangeChange }) {
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);

  const fromDate = dateRange?.from || undefined;
  const toDate = dateRange?.to || undefined;

  function handleFromSelect(date) {
    onDateRangeChange({ ...dateRange, from: date || undefined });
    setFromOpen(false);
  }

  function handleToSelect(date) {
    onDateRangeChange({ ...dateRange, to: date || undefined });
    setToOpen(false);
  }

  function clearDateRange() {
    onDateRangeChange({});
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {/* From date */}
        <Popover open={fromOpen} onOpenChange={setFromOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-8 flex-1 justify-start gap-1.5 px-2.5 text-xs font-normal",
                !fromDate && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="size-3.5" />
              {fromDate ? format(fromDate, "dd MMM yyyy", { locale: ru }) : "От"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={fromDate}
              onSelect={handleFromSelect}
              disabled={(date) => (toDate ? date > toDate : false)}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        <span className="text-xs text-muted-foreground">—</span>

        {/* To date */}
        <Popover open={toOpen} onOpenChange={setToOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-8 flex-1 justify-start gap-1.5 px-2.5 text-xs font-normal",
                !toDate && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="size-3.5" />
              {toDate ? format(toDate, "dd MMM yyyy", { locale: ru }) : "До"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={toDate}
              onSelect={handleToSelect}
              disabled={(date) => (fromDate ? date < fromDate : false)}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      {(fromDate || toDate) ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-2 text-xs text-muted-foreground"
          onClick={clearDateRange}
        >
          <X className="size-3" />
          Очистить даты
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Default filter state factory.
 */
export function createDefaultFilters() {
  return {
    sourceTypes: [],
    dateRange: {},
    project: null,
  };
}
