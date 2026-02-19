# Database Storage Optimization — Technical Research

> Date: 2026-02-19
> Status: Research complete
> Scope: Chat system storage, embeddings, retention, archival architecture

---

## Executive Summary

Анализ 50+ таблиц, 23 миграций. Основные потребители хранилища: vector embeddings
(rag_chunks), chat messages (cw_messages), raw connector payloads (data jsonb).
Прогнозируемая экономия: **60-75% от текущего объёма** за счёт dimension reduction,
retention policies, jsonb stripping и архивации.

---

## 1. Анализ объёма по компонентам

### 1.1 Storage Budget

| Parameter | Value |
|-----------|-------|
| `STORAGE_BUDGET_GB` | 20 GB (env var, monitoring only) |
| `STORAGE_ALERT_THRESHOLD_PCT` | 85% (alert at 17 GB) |
| PostgreSQL container memory | 1 GB (tight for pgvector) |
| PostgreSQL image | `pgvector/pgvector:pg16` |
| Custom postgresql.conf | **Отсутствует** — PG defaults |

### 1.2 Top Storage Consumers (по убыванию)

| # | Компонент | Est. Size per Row | Growth Pattern | Why Heavy |
|---|-----------|------------------|----------------|-----------|
| 1 | **`rag_chunks` embeddings** | ~15-20 KB | Unbounded | vector(1536) + IVFFlat + HNSW dual indexes |
| 2 | **`cw_messages.data` jsonb** | ~0.8-5 KB | Unbounded | Full Chatwoot API payload (content duplicated) |
| 3 | **`source_documents.raw_payload`** | ~0.5-10 KB | Unbounded | Full connector API payload |
| 4 | **Raw connector tables** (`attio_*`, `linear_*`, `cw_*`) | ~0.2-2 KB | Unbounded | `data` jsonb columns |
| 5 | **`connector_events`** (ex `kag_event_log`) | ~0.4-1.5 KB | Append-only | Event log, never pruned |
| 6 | **`audit_events`** | ~0.3-2 KB | Append-only | Audit log, never pruned |
| 7 | **`lightrag_query_runs`** | ~0.5-12 KB | Append-only | Query history + evidence jsonb |
| 8 | **GIN/GiST indexes** | 2-5× data | Proportional | 85+ indexes, jsonb GIN + pg_trgm GIN |

### 1.3 Vector Storage Detail

| Parameter | Current | Notes |
|-----------|---------|-------|
| Embedding model | `text-embedding-3-small` (OpenAI) | Supports dimension reduction |
| Dimensions | **1536** | Hardcoded in DDL `vector(1536)` |
| Bytes per vector | 6,144 (1536 × 4) | Raw float32 |
| Indexes | **IVFFlat** (lists=100) + **HNSW** | Dual indexes = ~2.5-3× overhead |
| **Total per row with indexes** | **~15,000-20,000 bytes** | 6KB vector + ~9-14KB indexes |
| Chunk size | 1000 chars (~1KB text) | `CHUNK_SIZE=1000` |
| **Effective ratio** | Text : Storage = **1 : 15-20** | 1KB text → 15-20KB storage |

### 1.4 Chat Message Storage Detail

| Column | Purpose | Redundancy |
|--------|---------|------------|
| `cw_messages.content` | Extracted message text | Primary |
| `cw_messages.data` | **Full Chatwoot API response** | Contains `content` again + envelope |
| `cw_messages.conversation_id` | FK | — |
| `cw_messages.sender_type/id` | Metadata | — |

**Problem:** `data` jsonb stores the **entire API response** including `content`.
Same pattern in `cw_conversations.data`, `cw_contacts.data`, all `attio_*_raw.data`,
all `linear_*_raw.data`.

---

## 2. Стратегия оптимизации

### 2.1 Retention Policy (Hot / Warm / Cold)

```
┌─────────────────┐
│     HOT (0-90d)  │  PostgreSQL, full data, all indexes, real-time queries
│     Full access  │  All embeddings active, jsonb payloads intact
├─────────────────┤
│   WARM (90d-1y)  │  PostgreSQL, stripped data, reduced indexes
│   Query OK       │  Embeddings retained, jsonb.data stripped to essentials
├─────────────────┤
│   COLD (>1y)     │  Archive to disk, summaries in PostgreSQL
│   Restore req.   │  Embeddings deleted, text summaries kept, raw archived
└─────────────────┘
```

| Tier | Data | Embeddings | jsonb `data` | Indexes | Access |
|------|------|-----------|--------------|---------|--------|
| **Hot** (0-90d) | Full | Full (vector 1536 or reduced) | Full API payload | All | Real-time |
| **Warm** (90-365d) | Full text | Keep (optionally reduced dim) | Stripped to essentials | Primary only | Query OK, slower |
| **Cold** (>365d) | Summaries only | **Deleted** | **Deleted** | Minimal | Restore from archive |

### 2.2 Embedding Dimension Reduction

OpenAI `text-embedding-3-small` supports the `dimensions` parameter natively.

| Dimensions | Bytes/vector | Index overhead | Total/row | Quality (MTEB) | Savings vs 1536 |
|-----------|-------------|----------------|-----------|----------------|-----------------|
| 1536 (current) | 6,144 | ~9-14 KB | ~15-20 KB | 100% baseline | — |
| 768 | 3,072 | ~4.5-7 KB | ~7.5-10 KB | ~98% | **50%** |
| 512 | 2,048 | ~3-4.7 KB | ~5-7 KB | ~96% | **65%** |
| 256 | 1,024 | ~1.5-2.3 KB | ~2.5-3.3 KB | ~92% | **83%** |

**Рекомендация:** Снизить до **512 dimensions**.

- Quality loss: ~4% на MTEB benchmark — незаметно для RAG queries
- Storage savings: 65% от vector storage
- Requires: ALTER TABLE + re-embed all chunks + update EMBEDDING_DIM env

### 2.3 Удаление дублирующего IVFFlat индекса

Current: **IVFFlat + HNSW** на `rag_chunks.embedding`.
HNSW строго лучше IVFFlat по recall и latency.

```sql
DROP INDEX IF EXISTS rag_chunks_embedding_ivfflat_idx;
```

**Savings:** ~50-80% of IVFFlat index size (roughly equal to base vector data size).

### 2.4 JSONB Data Stripping

| Table | Strip What | Keep What | Savings per Row |
|-------|-----------|-----------|-----------------|
| `cw_messages.data` | Full API payload | Only non-duplicated fields (attachments, metadata) | ~40-60% |
| `cw_conversations.data` | Full API payload | Status, tags, assignee changes | ~50-70% |
| `cw_contacts.data` | Full API payload | Only fields not in dedicated columns | ~40-60% |
| `source_documents.raw_payload` | Full connector response | Hash for dedup check only | ~70-90% |
| `attio_*_raw.data` | Full API payload | Only fields not in dedicated columns | ~40-60% |
| `linear_*_raw.data` | Full API payload | Only fields not in dedicated columns | ~40-60% |

**Strategy:** For warm data (>90d), run batch job:
```sql
UPDATE cw_messages SET data = jsonb_strip_nulls(data - 'content' - 'html_content' - 'body')
WHERE created_at < now() - interval '90 days';
```

### 2.5 Float16 / Quantization

PostgreSQL pgvector supports `halfvec` type (float16, 2 bytes per dimension):

| Type | Bytes/dim | 512-dim vector | 1536-dim vector |
|------|-----------|---------------|-----------------|
| float32 (current) | 4 | 2,048 | 6,144 |
| **halfvec (float16)** | 2 | 1,024 | 3,072 |
| scalar quantization | 1 | 512 | 1,536 |
| binary quantization | 1/8 | 64 | 192 |

**С dimension reduction 512 + halfvec:** 512 × 2 = **1,024 bytes** per vector.
vs current 1536 × 4 = 6,144 bytes. **Savings: 83%.**

**Caveat:** halfvec requires pgvector >= 0.7.0. Binary quantization loses too much
quality for RAG. Scalar quantization is not yet supported in pgvector.

### 2.6 Noise Data Removal

| Data | Rule | Action |
|------|------|--------|
| `rag_chunks` WHERE status = 'failed' | Failed embeddings | DELETE (re-embed if needed) |
| `rag_chunks` WHERE char_length(text) < `MIN_EMBED_CHARS` (30) | Too short for semantic search | DELETE embedding, keep text |
| `connector_errors` WHERE status = 'dead_letter' AND age > 30d | Dead-letter errors | DELETE |
| `idempotency_keys` WHERE expires_at < now() | Expired keys | DELETE (function exists, not scheduled) |
| `source_documents` WHERE is_deleted = true | Soft-deleted docs | Hard DELETE after 30d |
| `lightrag_query_runs` age > 90d | Old query history | DELETE |
| `job_runs`, `worker_runs` age > 90d | Old execution logs | DELETE |
| `sync_reconciliation_metrics` age > 90d | Old sync metrics | DELETE |

---

## 3. Регламент обращения со старыми данными

### 3.1 Пошаговые правила

| Возраст данных | Действие | Таблицы | Периодичность |
|---------------|----------|---------|---------------|
| **0-90 дней** | Без изменений (Hot tier) | Все | — |
| **90 дней** | Strip jsonb `data` payloads | `cw_messages`, `cw_conversations`, `source_documents`, `*_raw` | Ежемесячно |
| **90 дней** | Delete noise data | Failed chunks, dead-letter errors, expired keys | Ежемесячно |
| **180 дней** | Archive `connector_events`, `audit_events` to disk | Event logs | Ежемесячно |
| **180 дней** | Aggregate messages to thread-level summaries | `cw_messages` → `thread_summaries` | Ежемесячно |
| **365 дней** | Delete embeddings, archive raw text | `rag_chunks` | Ежемесячно |
| **365 дней** | Archive raw connector data to disk | `attio_*_raw`, `linear_*_raw`, `cw_*` | Ежемесячно |
| **365 дней** | Delete `lightrag_query_runs` | Query history | Ежемесячно |

### 3.2 Что архивируется

| Данные | Формат архива | Что остаётся в PostgreSQL |
|--------|--------------|--------------------------|
| `cw_messages` raw text + data | JSONL.gz | `content` (text only), thread_summary |
| `rag_chunks` text + embedding | Parquet (text) + numpy (vectors) | Thread-level summary |
| `connector_events` | JSONL.gz | Monthly aggregates (counts by event_type) |
| `audit_events` | JSONL.gz | Monthly aggregates (counts by action) |
| `*_raw` connector data | JSONL.gz | Extracted fields in dedicated columns |

### 3.3 Что удаляется полностью (без архивации)

| Данные | Условие | Причина |
|--------|---------|---------|
| `rag_chunks` WHERE status = 'failed' | Immediately | Бесполезны, можно re-embed |
| `idempotency_keys` expired | Daily | TTL mechanism |
| `connector_errors` dead_letter > 30d | Monthly | Отладочные данные |
| `lightrag_feedback` > 1y | Monthly | Low value |
| `source_documents.raw_payload` > 6m | Monthly | After stripping, only hash remains |

### 3.4 Что сохраняется в сжатом/агрегированном виде

| Исходные данные | Агрегат | Детализация |
|----------------|---------|-------------|
| `cw_messages` (per conversation) | Thread summary (LLM-generated) | Key points, sentiment, action items |
| `connector_events` (daily) | Monthly event counts by type | `{message_sent: 450, issue_created: 89, ...}` |
| `analytics_*_snapshots` | Kept as-is (already aggregated) | Weekly granularity |
| `health_scores` | Monthly averages | Per-client monthly composite |

---

## 4. Архитектура архивации

### 4.1 Процесс

```
┌─────────────────────────────────────────────────────────────┐
│                  Monthly Archive Job                         │
│                  (scheduled_jobs, 1st of month)              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. IDENTIFY rows matching retention rules                   │
│  2. EXPORT to temp files (JSONL for text, Parquet for tabular)│
│  3. COMPRESS (gzip for JSONL, zstd for Parquet)              │
│  4. CHECKSUM (SHA-256 per file)                              │
│  5. WRITE manifest.json (files, checksums, row counts, date) │
│  6. MOVE to archive storage (local volume)                   │
│  7. VERIFY archive (re-read + checksum compare)              │
│  8. DELETE archived rows from PostgreSQL                     │
│  9. VACUUM tables (reclaim space)                            │
│ 10. LOG results to audit_events                              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Storage Layout

```
/archives/
├── 2026/
│   ├── 01/
│   │   ├── manifest.json           # {files, checksums, row_counts, archived_at}
│   │   ├── cw_messages.jsonl.gz    # Messages archived this month
│   │   ├── rag_chunks_text.jsonl.gz # Chunk text (without embeddings)
│   │   ├── rag_chunks_vectors.npy.gz # Vectors for potential re-import
│   │   ├── connector_events.jsonl.gz
│   │   ├── audit_events.jsonl.gz
│   │   └── raw_data/
│   │       ├── attio_accounts.jsonl.gz
│   │       ├── linear_issues.jsonl.gz
│   │       └── cw_conversations.jsonl.gz
│   └── 02/
│       └── ...
```

### 4.3 Форматы хранения

| Данные | Формат | Почему |
|--------|--------|--------|
| Text/messages/events | **JSONL + gzip** | Human-readable, streamable, good compression (~10:1) |
| Tabular analytics | **Parquet + zstd** | Columnar, excellent compression (~20:1), queryable by DuckDB |
| Vector embeddings | **NumPy .npy + gzip** | Standard ML format, compact, easy re-import |
| Manifest | **JSON** | Metadata: checksums, row counts, archive date |

### 4.4 Checksums & Integrity

```json
// manifest.json
{
  "version": 1,
  "archived_at": "2026-02-01T00:00:00Z",
  "period": { "from": "2025-02-01", "to": "2025-02-28" },
  "project_id": "uuid",
  "files": [
    {
      "name": "cw_messages.jsonl.gz",
      "checksum_sha256": "abc123...",
      "rows": 12450,
      "original_size_bytes": 48293847,
      "compressed_size_bytes": 4829384
    }
  ],
  "db_state": {
    "deleted_rows": { "cw_messages": 12450, "rag_chunks": 3200 },
    "freed_bytes_estimate": 524288000
  }
}
```

### 4.5 Rehydration (восстановление данных)

```
node scripts/archive-rehydrate.js --month 2025-02 --table cw_messages

Process:
1. Read manifest.json from archive
2. Verify checksums
3. Decompress JSONL
4. COPY INTO temp table
5. Merge into main table (upsert by PK)
6. Re-generate embeddings if needed (rag_chunks)
7. Log rehydration event
```

**SLA восстановления:**
- Text data (messages, events): < 10 минут per month of data
- Embeddings: 1-4 часа per month (re-embedding via OpenAI API, rate limited)
- Full month archive: < 4 часа including embedding regeneration

---

## 5. Оценка экономии

### 5.1 Модель роста (baseline без оптимизации)

Предположения: 50 клиентов, 500 messages/day, 200 tasks/week, 1000 chunks/week.

| Таблица | Rows/month | Size/row | Monthly Growth |
|---------|-----------|----------|----------------|
| `rag_chunks` | ~4,000 | ~17 KB | ~68 MB |
| `cw_messages` | ~15,000 | ~3 KB | ~45 MB |
| `connector_events` | ~30,000 | ~1 KB | ~30 MB |
| `source_documents` | ~2,000 | ~5 KB | ~10 MB |
| Raw connector tables | ~10,000 | ~1.5 KB | ~15 MB |
| Other (analytics, audit) | ~5,000 | ~1 KB | ~5 MB |
| **Total monthly growth** | | | **~173 MB** |
| **Annual growth** | | | **~2.1 GB** |

### 5.2 Прогноз "до / после" (через 2 года)

| Компонент | Без оптимизации (2y) | С оптимизацией (2y) | Savings |
|-----------|---------------------|--------------------|---------|
| `rag_chunks` vectors | 1,632 MB | 272 MB* | **83%** |
| `rag_chunks` text | 96 MB | 48 MB** | 50% |
| `cw_messages` | 1,080 MB | 270 MB*** | 75% |
| `connector_events` | 720 MB | 120 MB**** | 83% |
| `source_documents` | 240 MB | 60 MB | 75% |
| Raw connector tables | 360 MB | 90 MB | 75% |
| Indexes overhead | ~1,200 MB | ~300 MB | 75% |
| Other tables | 240 MB | 200 MB | 17% |
| **Total** | **~5.6 GB** | **~1.4 GB** | **75%** |

```
* dim 1536→512 (65%) + halfvec (50%) + drop IVFFlat + cold tier delete
** cold tier: summaries only, raw archived
*** 90d jsonb strip + 365d archive
**** 180d archive + monthly aggregates
```

### 5.3 Breakdown по стратегиям

| Стратегия | Estimated Savings | Effort | Risk |
|-----------|------------------|--------|------|
| Dim reduction 1536→512 | **~1.0 GB** (2y) | M (3-5d, re-embed all) | Low (4% quality loss) |
| Drop IVFFlat index | **~0.3 GB** (2y) | S (1 command) | None (HNSW is better) |
| halfvec (float16) | **~0.5 GB** (2y) | M (migration + re-embed) | Low (negligible quality loss) |
| jsonb stripping >90d | **~0.8 GB** (2y) | M (batch job) | Medium (data loss if not archived) |
| Archive events >180d | **~0.6 GB** (2y) | M (archive pipeline) | Low (restoreable) |
| Archive messages >365d | **~0.5 GB** (2y) | M (archive pipeline) | Medium (RAG quality for old data) |
| Delete cold embeddings | **~0.4 GB** (2y) | S (scheduler job) | Medium (search over old data lost) |
| Noise data cleanup | **~0.1 GB** (2y) | S (scheduler job) | None |

### 5.4 Ожидаемая экономия

| Timeframe | Without Optimization | With Optimization | Savings |
|-----------|---------------------|-------------------|---------|
| 6 months | ~1.0 GB | ~0.5 GB | 50% |
| 1 year | ~2.1 GB | ~0.7 GB | 67% |
| **2 years** | **~5.6 GB** | **~1.4 GB** | **75%** |
| 5 years | ~14 GB | ~3.5 GB | 75% |

**При бюджете 20 GB:** без оптимизации хватит на ~6 лет. С оптимизацией — на ~28 лет.

---

## 6. Риски

| Риск | Severity | Mitigation |
|------|----------|-----------|
| Потеря поиска по старым данным | HIGH | Thread summaries сохраняют ключевые insights. Rehydration < 4h. |
| Деградация RAG quality | MEDIUM | Summaries как fallback для cold data. Dim reduction: test quality before deploy. |
| Archive corruption | LOW | SHA-256 checksums + manifest validation + dual-write period. |
| Re-embedding cost (OpenAI) | MEDIUM | ~$0.02 per 1M tokens. 100K chunks × 1K chars = ~$2. One-time cost. |
| Halfvec compatibility | LOW | Requires pgvector >= 0.7.0. Current image: pgvector/pgvector:pg16 (check version). |
| Migration downtime | LOW | All operations are online (ALTER TABLE, CREATE INDEX CONCURRENTLY). |

---

## 7. Дополнительные идеи оптимизации

### 7.1 Частичное удаление embeddings

Не все chunks одинаково полезны:
- Chunks из системных сообщений ("Welcome to conversation") — remove embedding
- Chunks с < 50 chars — remove embedding (too short for semantic value)
- Chunks с low retrieval frequency (never matched in queries) — remove after 1y

```sql
-- Example: remove embeddings for very short chunks
UPDATE rag_chunks SET embedding = NULL, status = 'text_only'
WHERE char_length(text) < 50 AND embedding IS NOT NULL;
```

### 7.2 Cold Vector Storage

Для warm tier: move vectors to separate table with cheaper storage strategy.

```sql
CREATE TABLE rag_chunks_cold (
  chunk_id uuid PRIMARY KEY REFERENCES rag_chunks(id),
  embedding halfvec(512),  -- reduced + float16
  archived_at timestamptz DEFAULT now()
);
-- No HNSW index on cold storage (only brute-force search when needed)
```

### 7.3 Index Compression

PostgreSQL supports TOAST compression (pglz, lz4) for large values.
For jsonb columns, enabling LZ4 compression can reduce storage ~30-50%:

```sql
ALTER TABLE cw_messages ALTER COLUMN data SET COMPRESSION lz4;
-- Requires PG 14+ (we have PG 16)
```

### 7.4 Partitioning by project_id

For multi-tenant isolation and per-project cleanup:

```sql
CREATE TABLE cw_messages_partitioned (
  LIKE cw_messages INCLUDING ALL
) PARTITION BY LIST (project_id);

-- Per-project partitions allow targeted VACUUM and DROP PARTITION for cleanup
```

**Caveat:** Only useful with 10+ projects and significant data per project.
At current scale (1-3 projects), overhead outweighs benefit.

### 7.5 Time-based Partitioning (more practical)

```sql
CREATE TABLE connector_events_partitioned (
  LIKE connector_events INCLUDING ALL
) PARTITION BY RANGE (created_at);

-- Monthly partitions: DROP old partitions instead of DELETE (instant)
CREATE TABLE connector_events_2026_01
  PARTITION OF connector_events_partitioned
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
```

**Advantage:** `DROP PARTITION` is instant vs `DELETE + VACUUM` which can be slow.
Best for: `connector_events`, `audit_events`, `cw_messages`, `rag_chunks`.

### 7.6 Automatic Quota Management

```javascript
// Scheduler job: storage_quota_check (daily)
async function checkStorageQuota(pool) {
  const { rows } = await pool.query(`
    SELECT pg_database_size(current_database()) as db_size
  `);
  const sizeGB = rows[0].db_size / (1024 ** 3);
  const budgetGB = parseInt(process.env.STORAGE_BUDGET_GB || '20');
  const threshold = parseFloat(process.env.STORAGE_ALERT_THRESHOLD_PCT || '85') / 100;

  if (sizeGB > budgetGB * threshold) {
    // Trigger aggressive cleanup
    await runRetentionPolicy(pool, { aggressive: true });
    // Alert via notification system
    await sendAlert('storage_quota_warning', { sizeGB, budgetGB });
  }
}
```

### 7.7 Thread-Level Aggregation for Chat

Instead of keeping all individual messages, aggregate conversations:

```sql
CREATE TABLE conversation_summaries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id),
  conversation_id text NOT NULL,
  summary     text NOT NULL,       -- LLM-generated summary
  key_points  jsonb,               -- Extracted action items, decisions
  sentiment   text,                -- overall, positive, negative, neutral
  message_count int,
  first_message_at timestamptz,
  last_message_at  timestamptz,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(project_id, conversation_id)
);
```

**Process:** Monthly, for conversations with last_message > 180d:
1. Generate LLM summary of all messages in conversation
2. Extract key points, decisions, action items
3. Store summary in `conversation_summaries`
4. Archive raw messages to disk
5. Delete raw messages from PostgreSQL

---

## 8. Сравнительная таблица "до / после"

| Параметр | До | После | Изменение |
|----------|-----|-------|-----------|
| **Embedding dimensions** | 1536 | 512 | -67% |
| **Vector bytes/row** | 6,144 | 1,024 (halfvec) | -83% |
| **Vector indexes** | IVFFlat + HNSW | HNSW only | -40% index size |
| **Total storage/chunk** | ~17 KB | ~3.5 KB | -80% |
| **cw_messages warm** | Full jsonb | Stripped jsonb | -50% |
| **cw_messages cold** | Full in DB | Archived to disk | -100% DB, archived |
| **Event logs >6m** | Full in DB | Archived + aggregates | -83% |
| **DB size (2 years)** | ~5.6 GB | ~1.4 GB | **-75%** |
| **DB size (5 years)** | ~14 GB | ~3.5 GB | **-75%** |
| **Retention enforcement** | Manual/none | Automated monthly | Proactive |
| **RAG search scope** | All-time | Hot + warm (summary fallback) | Minimal quality impact |
| **Recovery time** | N/A | < 4 hours for any month | Acceptable |
| **PG container memory** | 1 GB (defaults) | 2 GB (tuned) | Better query perf |

---

## 9. Рекомендуемый план внедрения

| Phase | Action | Effort | Savings |
|-------|--------|--------|---------|
| **1. Quick wins** | Drop IVFFlat, schedule cleanExpiredKeys, delete noise data | S (1d) | ~5% |
| **2. LZ4 compression** | ALTER jsonb columns SET COMPRESSION lz4 | S (0.5d) | ~10% |
| **3. Dim reduction** | Change to 512 dims, re-embed all chunks, ALTER TABLE | M (3-5d) | ~30% |
| **4. jsonb stripping** | Batch job for warm data (>90d) | M (2-3d) | ~15% |
| **5. Retention jobs** | Scheduler jobs for all append-only tables | M (2-3d) | ~10% |
| **6. Archive pipeline** | Monthly export + manifest + verification | L (5-8d) | ~5% |
| **7. Thread summaries** | LLM summarization for old conversations | M (3-5d) | ~5% |
| **8. halfvec migration** | Float16 vectors (if pgvector >= 0.7.0) | M (2-3d) | Additional ~15% |
| **Total** | | **~20-30 days** | **~75%** |
