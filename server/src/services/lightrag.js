import { runEmbeddings, searchChunks } from "./embeddings.js";

function toPositiveInt(value, fallback, min = 1, max = 200) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function asText(value, max = 4000) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.slice(0, max);
}

function tokenizeQuery(query) {
  const source = asText(query, 4000).toLowerCase();
  if (!source) return [];
  const tokens = source
    .split(/[^a-zA-Zа-яА-Я0-9_]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3);
  const deduped = [];
  const seen = new Set();
  for (const token of tokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    deduped.push(token);
    if (deduped.length >= 6) break;
  }
  return deduped;
}

function buildLikePatterns(query) {
  const tokens = tokenizeQuery(query);
  if (!tokens.length) {
    const fallback = asText(query, 300);
    return fallback ? [`%${fallback}%`] : [];
  }
  return tokens.map((token) => `%${token}%`);
}

function lightragAnswer(query, chunkCount, messageCount, issueCount, opportunityCount) {
  const parts = [];
  parts.push(`Запрос: "${asText(query, 500)}".`);
  parts.push(`Найдено chunk-фрагментов: ${chunkCount}.`);
  parts.push(`Совпадений в сообщениях: ${messageCount}.`);
  parts.push(`Совпадений в задачах Linear: ${issueCount}.`);
  parts.push(`Совпадений в сделках/офферах: ${opportunityCount}.`);
  return parts.join(" ");
}

function buildEvidenceFromRows(rows, sourceType) {
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

async function persistLightRagQueryRun(pool, scope, payload = {}, logger = console) {
  try {
    await pool.query(
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
          created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
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
      ]
    );
  } catch (error) {
    logger.warn({ err: String(error?.message || error || "persist_lightrag_query_failed") }, "unable to persist lightrag query run");
  }
}

export async function getLightRagStatus(pool, scope) {
  const [chunkCounts, sourceCounts] = await Promise.all([
    pool.query(
      `
        SELECT embedding_status, count(*)::int AS count
        FROM rag_chunks
        WHERE project_id = $1
          AND account_scope_id = $2
        GROUP BY embedding_status
      `,
      [scope.projectId, scope.accountScopeId]
    ),
    pool.query(
      `
        SELECT
          (SELECT count(*)::int FROM cw_messages WHERE project_id = $1 AND account_scope_id = $2) AS messages_total,
          (SELECT count(*)::int FROM linear_issues_raw WHERE project_id = $1 AND account_scope_id = $2) AS linear_issues_total,
          (SELECT count(*)::int FROM attio_opportunities_raw WHERE project_id = $1 AND account_scope_id = $2) AS opportunities_total
      `,
      [scope.projectId, scope.accountScopeId]
    ),
  ]);

  const embeddingCounts = { pending: 0, processing: 0, ready: 0, failed: 0 };
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

export async function refreshLightRag(pool, scope, logger = console) {
  const embeddings = await runEmbeddings(pool, scope, logger);
  const status = await getLightRagStatus(pool, scope);
  return {
    embeddings,
    status,
  };
}

export async function queryLightRag(pool, scope, options = {}, logger = console) {
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

  const [chunkSearch, messageRows, issueRows, opportunityRows] = await Promise.all([
    searchChunks(pool, scope, query, topK, logger),
    pool.query(
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
        ORDER BY created_at DESC NULLS LAST
        LIMIT $4
      `,
      [scope.projectId, scope.accountScopeId, safePatterns, sourceLimit]
    ),
    pool.query(
      `
        SELECT
          id,
          external_id::text AS source_ref,
          title,
          left(COALESCE(next_step, ''), 320) AS snippet,
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
            OR COALESCE(next_step, '') ILIKE ANY($3::text[])
          )
        ORDER BY updated_at DESC NULLS LAST
        LIMIT $4
      `,
      [scope.projectId, scope.accountScopeId, safePatterns, sourceLimit]
    ),
    pool.query(
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
        ORDER BY updated_at DESC NULLS LAST
        LIMIT $4
      `,
      [scope.projectId, scope.accountScopeId, safePatterns, sourceLimit]
    ),
  ]);

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

  const response = {
    query,
    topK,
    answer: lightragAnswer(
      query,
      chunkSearch.results?.length || 0,
      messages.length,
      issues.length,
      opportunities.length
    ),
    chunks: chunkSearch.results || [],
    evidence,
    entities: {
      messages,
      issues,
      opportunities,
    },
    stats: {
      chunks: chunkSearch.results?.length || 0,
      messages: messages.length,
      issues: issues.length,
      opportunities: opportunities.length,
    },
  };

  await persistLightRagQueryRun(
    pool,
    scope,
    {
      query,
      topK,
      chunkHits: response.stats.chunks,
      sourceHits: response.stats.messages + response.stats.issues + response.stats.opportunities,
      evidence: response.evidence,
      answer: response.answer,
      createdBy: options.createdBy || null,
    },
    logger
  );

  return response;
}
