import { runEmbeddings, searchChunks } from "./embeddings.js";
import type { Pool, ProjectScope } from "../../types/index.js";

type LoggerLike = {
  warn?: (obj: Record<string, unknown>, msg?: string) => void;
};

type SourceRow = Record<string, unknown>;

type ChunkSearchRow = {
  id: string;
  text?: string | null;
  created_at?: string | null;
  message_global_id?: string | null;
  conversation_global_id?: string | null;
  distance?: number;
  chunk_index?: number;
};

type ChunkSearchResult = {
  results: ChunkSearchRow[];
  embedding_model?: string | null;
  search_config?: Record<string, unknown> | null;
};

export function toPositiveInt(
  value: unknown,
  fallback: number,
  min = 1,
  max = 200
): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function asText(value: unknown, max = 4000): string {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.slice(0, max);
}

export function tokenizeQuery(query: unknown): string[] {
  const source = asText(query, 4000).toLowerCase();
  if (!source) return [];
  const tokens = source
    .split(/[^a-zA-Zа-яА-Я0-9_]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3);
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    deduped.push(token);
    if (deduped.length >= 6) break;
  }
  return deduped;
}

export function sanitizeLike(text: unknown): string {
  return String(text || "").replace(/[%\\_]/g, "");
}

export function buildLikePatterns(query: unknown): string[] {
  const tokens = tokenizeQuery(query);
  if (!tokens.length) {
    const fallback = sanitizeLike(asText(query, 300));
    return fallback ? [`%${fallback}%`] : [];
  }
  return tokens.map((token) => `%${sanitizeLike(token)}%`);
}

function toDateOrNull(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function lightragAnswer(
  query: unknown,
  chunkCount: number,
  messageCount: number,
  issueCount: number,
  opportunityCount: number
): string {
  const parts = [];
  parts.push(`Запрос: "${asText(query, 500)}".`);
  parts.push(`Найдено chunk-фрагментов: ${chunkCount}.`);
  parts.push(`Совпадений в сообщениях: ${messageCount}.`);
  parts.push(`Совпадений в задачах Linear: ${issueCount}.`);
  parts.push(`Совпадений в сделках/офферах: ${opportunityCount}.`);
  return parts.join(" ");
}

export function buildEvidenceFromRows(
  rows: SourceRow[],
  sourceType: string
): Array<Record<string, unknown>> {
  return rows.map((row) => ({
    source_type: sourceType,
    source_pk: row.id,
    source_ref: row.source_ref || null,
    title: row.title || row.name || null,
    snippet: row.snippet || null,
    created_at: row.created_at || row.updated_at || null,
    metadata: row.metadata || {},
  }));
}

function computeQualityScore(
  evidence: Array<Record<string, unknown>>,
  stats: { chunks: number }
): number {
  if (!evidence.length) return 0;
  const sourceTypes = new Set(evidence.map((e) => String(e.source_type || "")));
  const diversity = sourceTypes.size;
  const coverageScore = Math.min(1, evidence.length / 10) * 40;
  const diversityScore = Math.min(1, diversity / 3) * 35;
  const depthScore = Math.min(1, (stats.chunks || 0) / 5) * 25;
  return Math.round(Math.min(100, coverageScore + diversityScore + depthScore));
}

async function persistLightRagQueryRun(
  pool: Pool,
  scope: ProjectScope,
  payload: Record<string, unknown> = {},
  logger: LoggerLike = console
): Promise<number | null> {
  try {
    const { rows } = await pool.query<{ id: number }>(
      `
        INSERT INTO lightrag_query_runs(
          project_id,
          account_scope_id,
          query_text,
          top_k,
          chunk_hits,
          source_hits,
          evidence,
          answer,
          created_by,
          quality_score,
          source_diversity
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)
        RETURNING id
      `,
      [
        scope.projectId,
        scope.accountScopeId,
        asText(payload.query, 4000),
        toPositiveInt(payload.topK, 10, 1, 50),
        toPositiveInt(payload.chunkHits, 0, 0, 1_000_000),
        toPositiveInt(payload.sourceHits, 0, 0, 1_000_000),
        JSON.stringify(Array.isArray(payload.evidence) ? payload.evidence.slice(0, 50) : []),
        asText(payload.answer, 10_000),
        asText(payload.createdBy, 200) || null,
        payload.qualityScore ?? null,
        payload.sourceDiversity ?? 0,
      ]
    );
    return rows[0]?.id || null;
  } catch (error) {
    logger.warn?.(
      { err: String((error as Error)?.message || error || "persist_lightrag_query_failed") },
      "unable to persist lightrag query run"
    );
    return null;
  }
}

export async function getLightRagStatus(
  pool: Pool,
  scope: ProjectScope
): Promise<Record<string, unknown>> {
  const [chunkCounts, sourceCounts] = await Promise.all([
    pool.query<{ embedding_status: string; count: number }>(
      `
        SELECT embedding_status, count(*)::int AS count
        FROM rag_chunks
        WHERE project_id = $1
          AND account_scope_id = $2
        GROUP BY embedding_status
      `,
      [scope.projectId, scope.accountScopeId]
    ),
    pool.query<Record<string, unknown>>(
      `
        SELECT
          (SELECT count(*)::int FROM cw_messages WHERE project_id = $1 AND account_scope_id = $2) AS messages_total,
          (SELECT count(*)::int FROM linear_issues_raw WHERE project_id = $1 AND account_scope_id = $2) AS linear_issues_total,
          (SELECT count(*)::int FROM attio_opportunities_raw WHERE project_id = $1 AND account_scope_id = $2) AS opportunities_total
      `,
      [scope.projectId, scope.accountScopeId]
    ),
  ]);

  const embeddingCounts: Record<string, number> = {
    pending: 0,
    processing: 0,
    ready: 0,
    failed: 0,
  };
  for (const row of chunkCounts.rows) {
    embeddingCounts[String(row.embedding_status || "")] = Number(row.count || 0);
  }

  return {
    project_id: scope.projectId,
    account_scope_id: scope.accountScopeId,
    embeddings: embeddingCounts,
    sources: sourceCounts.rows[0] || {
      messages_total: 0,
      linear_issues_total: 0,
      opportunities_total: 0,
    },
  };
}

export async function refreshLightRag(
  pool: Pool,
  scope: ProjectScope,
  logger: LoggerLike = console
): Promise<Record<string, unknown>> {
  const embeddings = await runEmbeddings(pool, scope, logger as Console);
  const status = await getLightRagStatus(pool, scope);
  return {
    embeddings,
    status,
  };
}

export async function queryLightRag(
  pool: Pool,
  scope: ProjectScope,
  options: Record<string, unknown> = {},
  logger: LoggerLike = console
): Promise<Record<string, unknown>> {
  const query = asText(options.query, 4000);
  if (!query) {
    return {
      query: "",
      answer: "",
      chunks: [],
      evidence: [],
      entities: {
        messages: [],
        issues: [],
        opportunities: [],
      },
      stats: {
        chunks: 0,
        messages: 0,
        issues: 0,
        opportunities: 0,
      },
    };
  }

  const topK = toPositiveInt(options.topK, 10, 1, 50);
  const sourceLimit = toPositiveInt(options.sourceLimit, 8, 1, 25);
  const patterns = buildLikePatterns(query);
  const safePatterns = patterns.length ? patterns : [`%${query}%`];

  const sourceFilter = Array.isArray(options.sourceFilter)
    ? new Set(
        options.sourceFilter
          .map((s) => String(s).toLowerCase().trim())
          .filter(Boolean)
      )
    : null;
  const dateFrom = toDateOrNull(options.dateFrom);
  const dateTo = toDateOrNull(options.dateTo);
  const dateToExclusive = dateTo
    ? new Date(dateTo.getTime() + 24 * 60 * 60 * 1000)
    : null;
  const includeMessages = !sourceFilter || sourceFilter.has("messages");
  const includeIssues = !sourceFilter || sourceFilter.has("issues");
  const includeOpportunities =
    !sourceFilter ||
    sourceFilter.has("deals") ||
    sourceFilter.has("opportunities");
  const includeChunks = !sourceFilter || sourceFilter.has("chunks");

  const emptyResult = { rows: [] as SourceRow[] };
  const [chunkSearchRaw, messageRows, issueRows, opportunityRows] =
    await Promise.all([
      includeChunks
        ? searchChunks(pool, scope, query, topK, logger as Console, {
            dateFrom,
            dateTo,
          })
        : { results: [], embedding_model: null, search_config: null },
      includeMessages
        ? pool.query<SourceRow>(
            `
        SELECT
          id,
          message_id::text AS source_ref,
          left(COALESCE(content, ''), 500) AS snippet,
          created_at,
          jsonb_build_object(
            'sender_type', sender_type,
            'conversation_global_id', conversation_global_id,
            'contact_global_id', contact_global_id
          ) AS metadata
        FROM cw_messages
        WHERE project_id = $1
          AND account_scope_id = $2
          AND btrim(COALESCE(content, '')) <> ''
          AND COALESCE(content, '') ILIKE ANY($3::text[])
        AND ($4::timestamptz IS NULL OR created_at >= $4::timestamptz)
          AND ($5::timestamptz IS NULL OR created_at < $5::timestamptz)
        ORDER BY created_at DESC NULLS LAST
        LIMIT $6
      `,
            [
              scope.projectId,
              scope.accountScopeId,
              safePatterns,
              dateFrom,
              dateToExclusive,
              sourceLimit,
            ]
          )
        : emptyResult,
      includeIssues
        ? pool.query<SourceRow>(
            `
        SELECT
          id,
          external_id::text AS source_ref,
          title,
          left(COALESCE(data->>'next_step', ''), 320) AS snippet,
          updated_at,
          jsonb_build_object(
            'state', state,
            'priority', priority,
            'assignee_name', assignee_name,
            'due_date', due_date
          ) AS metadata
        FROM linear_issues_raw
        WHERE project_id = $1
          AND account_scope_id = $2
          AND (
            COALESCE(title, '') ILIKE ANY($3::text[])
            OR COALESCE(data->>'next_step', '') ILIKE ANY($3::text[])
          )
        AND ($4::timestamptz IS NULL OR updated_at >= $4::timestamptz)
          AND ($5::timestamptz IS NULL OR updated_at < $5::timestamptz)
        ORDER BY updated_at DESC NULLS LAST
        LIMIT $6
      `,
            [
              scope.projectId,
              scope.accountScopeId,
              safePatterns,
              dateFrom,
              dateToExclusive,
              sourceLimit,
            ]
          )
        : emptyResult,
      includeOpportunities
        ? pool.query<SourceRow>(
            `
        SELECT
          id,
          external_id::text AS source_ref,
          COALESCE(title, account_external_id, id) AS title,
          left(COALESCE(next_step, ''), 320) AS snippet,
          updated_at,
          jsonb_build_object(
            'stage', stage,
            'amount', amount,
            'probability', probability,
            'expected_close_date', expected_close_date
          ) AS metadata
        FROM attio_opportunities_raw
        WHERE project_id = $1
          AND account_scope_id = $2
          AND (
            COALESCE(title, '') ILIKE ANY($3::text[])
            OR COALESCE(next_step, '') ILIKE ANY($3::text[])
            OR COALESCE(stage, '') ILIKE ANY($3::text[])
          )
        AND ($4::timestamptz IS NULL OR updated_at >= $4::timestamptz)
          AND ($5::timestamptz IS NULL OR updated_at < $5::timestamptz)
        ORDER BY updated_at DESC NULLS LAST
        LIMIT $6
      `,
            [
              scope.projectId,
              scope.accountScopeId,
              safePatterns,
              dateFrom,
              dateToExclusive,
              sourceLimit,
            ]
          )
        : emptyResult,
    ]);

  const chunkSearch = chunkSearchRaw as ChunkSearchResult;
  const messages = messageRows.rows || [];
  const issues = issueRows.rows || [];
  const opportunities = opportunityRows.rows || [];

  const evidence = [
    ...buildEvidenceFromRows(messages, "chatwoot_message"),
    ...buildEvidenceFromRows(issues, "linear_issue"),
    ...buildEvidenceFromRows(opportunities, "attio_opportunity"),
    ...(Array.isArray(chunkSearch.results)
      ? chunkSearch.results.map((row) => ({
          source_type: "rag_chunk",
          source_pk: row.id,
          source_ref: row.message_global_id || row.conversation_global_id || null,
          title: null,
          snippet: row.text || null,
          created_at: row.created_at || null,
          metadata: {
            distance: row.distance,
            chunk_index: row.chunk_index,
          },
        }))
      : []),
  ];

  const stats = {
    chunks: chunkSearch.results?.length || 0,
    messages: messages.length,
    issues: issues.length,
    opportunities: opportunities.length,
  };

  const sourceTypes = new Set(evidence.map((e) => String(e.source_type || "")));
  const qualityScore = computeQualityScore(evidence, stats);
  const answer = lightragAnswer(
    query,
    stats.chunks,
    stats.messages,
    stats.issues,
    stats.opportunities
  );

  const queryRunId = await persistLightRagQueryRun(
    pool,
    scope,
    {
      query,
      topK,
      chunkHits: stats.chunks,
      sourceHits: stats.messages + stats.issues + stats.opportunities,
      evidence,
      answer,
      createdBy: options.createdBy || null,
      qualityScore,
      sourceDiversity: sourceTypes.size,
    },
    logger
  );

  return {
    query,
    topK,
    query_run_id: queryRunId,
    embedding_model: chunkSearch.embedding_model || null,
    search_config: chunkSearch.search_config || null,
    quality_score: qualityScore,
    source_diversity: sourceTypes.size,
    answer,
    chunks: chunkSearch.results || [],
    evidence,
    entities: { messages, issues, opportunities },
    stats,
  };
}

export async function submitLightRagFeedback(
  pool: Pool,
  scope: ProjectScope,
  options: Record<string, unknown> = {}
): Promise<Record<string, unknown> | null> {
  const queryRunId = Number(options.queryRunId);
  if (!Number.isFinite(queryRunId) || queryRunId <= 0) {
    return null;
  }
  const rating = Number(options.rating);
  if (![-1, 0, 1].includes(rating)) {
    return null;
  }
  const comment = asText(options.comment, 2000) || null;
  const createdBy = asText(options.createdBy, 200) || null;

  const { rows } = await pool.query<Record<string, unknown>>(
    `
      INSERT INTO lightrag_feedback(project_id, account_scope_id, query_run_id, rating, comment, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, query_run_id, rating, comment, created_at
    `,
    [scope.projectId, scope.accountScopeId, queryRunId, rating, comment, createdBy]
  );
  return rows[0] || null;
}
