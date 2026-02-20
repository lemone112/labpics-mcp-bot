"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink, MessageSquare, TicketCheck, Handshake, FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

/** Source type display config: label, color, icon */
const SOURCE_CONFIG = {
  chatwoot_message: {
    label: "Chatwoot",
    className: "border-primary/30 bg-primary/10 text-primary",
    Icon: MessageSquare,
  },
  linear_issue: {
    label: "Linear",
    className: "border-accent-foreground/30 bg-accent text-accent-foreground",
    Icon: TicketCheck,
  },
  attio_opportunity: {
    label: "Attio",
    className: "border-muted-foreground/30 bg-muted text-muted-foreground",
    Icon: Handshake,
  },
  rag_chunk: {
    label: "RAG",
    className: "border-secondary-foreground/30 bg-secondary text-secondary-foreground",
    Icon: FileText,
  },
};

function getSourceConfig(sourceType) {
  return SOURCE_CONFIG[sourceType] || {
    label: sourceType || "Unknown",
    className: "border-border bg-secondary text-secondary-foreground",
    Icon: FileText,
  };
}

/**
 * Highlight matching text fragments in a snippet.
 * Returns an array of React elements with <mark> tags for matches.
 */
function highlightMatches(text, query) {
  if (!text || !query) return text || "";

  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 3)
    .slice(0, 6);

  if (!tokens.length) return text;

  // Build regex from tokens, escape special chars
  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`(${escaped.join("|")})`, "gi");

  const parts = text.split(regex);
  return parts.map((part, i) => {
    const isMatch = tokens.some((t) => part.toLowerCase() === t);
    if (isMatch) {
      return (
        <mark key={i} className="rounded-sm bg-accent px-0.5">
          {part}
        </mark>
      );
    }
    return part;
  });
}

function formatDate(dateValue) {
  if (!dateValue) return null;
  try {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return null;
  }
}

function formatScore(score) {
  if (score == null || !Number.isFinite(score)) return null;
  return `${Math.round(score * 100)}%`;
}

/**
 * Build a link to the original source.
 */
function getSourceLink(item) {
  const ref = item.source_ref;
  if (!ref) return null;

  switch (item.source_type) {
    case "chatwoot_message": {
      // Conversation link pattern
      const conversationId = item.metadata?.conversation_global_id || ref;
      return conversationId ? `#chatwoot:${conversationId}` : null;
    }
    case "linear_issue": {
      return ref ? `#linear:${ref}` : null;
    }
    case "attio_opportunity": {
      return ref ? `#attio:${ref}` : null;
    }
    default:
      return null;
  }
}

/**
 * Search result card with rich display, collapsible content, and source badge.
 *
 * @param {object} props
 * @param {object} props.item - Evidence item from search results
 * @param {string} [props.query] - Original search query for highlight
 * @param {(item: object) => void} [props.onClickResult] - Click tracking callback
 */
export function SearchResultCard({ item, query = "", onClickResult }) {
  const [isOpen, setIsOpen] = useState(false);
  const config = getSourceConfig(item.source_type);
  const { Icon } = config;
  const dateStr = formatDate(item.created_at);
  const scoreStr = formatScore(item._score);
  const sourceLink = getSourceLink(item);

  const title = item.title || item.source_ref || item.source_pk || "Без заголовка";
  const snippet = item.snippet || "";
  const shortSnippet = snippet.length > 200 ? `${snippet.slice(0, 200)}...` : snippet;
  const hasFullContent = snippet.length > 200;

  function handleCardClick() {
    onClickResult?.(item);
  }

  return (
    <Card
      className="group transition-shadow hover:shadow-md"
      data-motion-item
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Source icon */}
          <div className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border",
            config.className
          )}>
            <Icon className="size-4" />
          </div>

          {/* Content area */}
          <div className="min-w-0 flex-1 space-y-1.5">
            {/* Header row: title + badges */}
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-medium leading-tight text-foreground">
                {highlightMatches(String(title), query)}
              </h4>
              <Badge
                className={cn("text-[10px] font-medium", config.className)}
              >
                {config.label}
              </Badge>
              {scoreStr ? (
                <Badge variant="outline" className="text-[10px] font-mono">
                  {scoreStr}
                </Badge>
              ) : null}
            </div>

            {/* Snippet */}
            {shortSnippet ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {highlightMatches(shortSnippet, query)}
              </p>
            ) : null}

            {/* Collapsible full content */}
            {hasFullContent ? (
              <Collapsible open={isOpen} onOpenChange={setIsOpen}>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                  >
                    <ChevronDown
                      className={cn(
                        "size-3 transition-transform duration-200",
                        isOpen && "rotate-180"
                      )}
                    />
                    {isOpen ? "Свернуть" : "Показать полностью"}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 rounded-md border bg-muted/30 p-3 text-sm leading-relaxed text-muted-foreground">
                    {highlightMatches(snippet, query)}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ) : null}

            {/* Footer: date + link */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              {dateStr ? (
                <span className="text-xs text-muted-foreground">{dateStr}</span>
              ) : null}

              {item._scoreBreakdown ? (
                <span className="text-[10px] font-mono text-muted-foreground/70">
                  sem:{Math.round(item._scoreBreakdown.semantic * 100)}
                  {" "}rec:{Math.round(item._scoreBreakdown.recency * 100)}
                  {" "}auth:{Math.round(item._scoreBreakdown.authority * 100)}
                </span>
              ) : null}

              {sourceLink ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-6 gap-1 px-2 text-xs text-muted-foreground"
                  onClick={handleCardClick}
                  asChild
                >
                  <a href={sourceLink} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-3" />
                    Источник
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Empty state for when no search results are found.
 */
export function SearchResultsEmpty({ query }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border bg-muted/30 px-6 py-12 text-center">
      <div className="text-sm font-medium text-foreground">
        Ничего не найдено
      </div>
      {query ? (
        <p className="mt-1.5 text-sm text-muted-foreground">
          По запросу &laquo;{query}&raquo; результатов не найдено. Попробуйте другие ключевые слова.
        </p>
      ) : (
        <p className="mt-1.5 text-sm text-muted-foreground">
          Введите запрос для поиска по сообщениям, задачам и сделкам.
        </p>
      )}
    </div>
  );
}
