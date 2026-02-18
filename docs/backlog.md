# Бэклог (Product Backlog)

> Обновлено: 2026-02-18
> Roadmap: [`docs/mvp-vs-roadmap.md`](./mvp-vs-roadmap.md)
> Iteration log: [`docs/iteration-log.md`](./iteration-log.md)

---

## Active Iterations (Wave 2)

### Iter 10 — KAG Legacy Cleanup | CRITICAL

| # | Задача | Статус |
|---|--------|--------|
| 10.1 | Удалить dead KAG modules (`kag.js`, `kag/` directory — 6 files, ~2,602 LOC) | ⬜ |
| 10.2 | Rename `kag_event_log` → `connector_events` (migration 0021 + update SQL in event-log.js, snapshots.js, similarity.js, forecasting.js) | ⬜ |
| 10.3 | Удалить `/kag/*` API routes из index.js (~118 LOC + `isKagRoute()` + LIGHTRAG_ONLY gate) | ⬜ |
| 10.4 | Очистить scheduler от KAG jobs (kag_recommendations_refresh, dependency chain) | ⬜ |
| 10.5 | DROP неиспользуемые KAG DB таблицы (kag_nodes, kag_edges, kag_events, kag_provenance_refs, kag_signal_state, kag_recommendations) | ⬜ |
| 10.6 | Удалить KAG test files, убрать "KAG" из активных доков | ⬜ |

**Блокеры:** нет. Можно начинать сразу.
**Зависимости:** Iter 11 зависит от Iter 10 (clean codebase перед миграцией).

---

### Iter 11 — HKUDS LightRAG Migration + MCP | HIGH

> Миграция с custom hybrid RAG на [HKUDS LightRAG](https://github.com/HKUDS/LightRAG) из форка [`lemone112/lightrag`](https://github.com/lemone112/lightrag).

| # | Задача | Статус |
|---|--------|--------|
| 11.1 | Deploy LightRAG Server (Python) в docker-compose. Настроить OPENAI_API_KEY, PostgreSQL connection, health check | ⬜ |
| 11.2 | PostgreSQL storage backend: PGKVStorage + PGVectorStorage + PGGraphStorage. Shared DB, namespace isolation | ⬜ |
| 11.3 | Data ingestion pipeline: connector-sync.js → LightRAG `/documents` API. Batch ingestion messages/issues/deals | ⬜ |
| 11.4 | Proxy endpoints: `/lightrag/query` → LightRAG `/query`, `/lightrag/status` → `/health`. Удалить custom RAG код | ⬜ |
| 11.5 | MCP Server: [daniel-lightrag-mcp](https://github.com/desimpkins/daniel-lightrag-mcp) (22 tools) в docker-compose для Telegram бота | ⬜ |
| 11.6 | Service account auth: API key (header `X-API-Key`), env `SERVICE_API_KEYS`, scope per key | ⬜ |
| 11.7 | Integration tests: proxy endpoints, data ingestion, health check, auth | ⬜ |

**Блокеры:** Iter 10 (KAG cleanup).
**Зависимости:** Репозиторий `lemone112/lightrag` (форк HKUDS LightRAG).

---

### Iter 12 — Frontend Resilience | MEDIUM

| # | Задача | Статус |
|---|--------|--------|
| 12.1 | Error boundaries: React Error Boundary wrapping dashboard sections, fallback UI с retry | ⬜ |
| 12.2 | API retry: exponential backoff на 5xx (max 3 attempts, 1s/2s/4s). Не retry на 4xx | ⬜ |
| 12.3 | SSE auto-reconnect: exponential reconnect (1s/2s/4s/8s, max 30s), visual indicator | ⬜ |
| 12.4 | Loading states: skeleton loaders для всех dashboard sections, consistent pattern | ⬜ |
| 12.5 | Offline detection: navigator.onLine + fetch probe, banner при offline | ⬜ |

**Блокеры:** нет.

---

### Iter 13 — CI/CD Hardening | MEDIUM

| # | Задача | Статус |
|---|--------|--------|
| 13.1 | .dockerignore для server и web (exclude node_modules, test, docs, .git) | ⬜ |
| 13.2 | npm audit в CI (`npm audit --omit=dev`, fail on critical/high) | ⬜ |
| 13.3 | Pre-deploy backup (run backup.sh before deployment, verify) | ⬜ |
| 13.4 | Rollback strategy: Docker tag pinning, quick rollback script, health check after deploy | ⬜ |

**Блокеры:** нет.

---

## Deferred (Later)

### TypeScript Migration Phase 1 | LOW

| # | Задача | Статус |
|---|--------|--------|
| L.1 | `tsconfig.json` с `checkJs: true, allowJs: true, strict: false` для server и web | ⬜ |
| L.2 | Type definitions для core modules: scope, session, api-contract, database rows (`.d.ts`) | ⬜ |
| L.3 | Convention: все новые файлы пишутся на TypeScript | ⬜ |

---

## Known Issues (Open)

| # | Проблема | Файл | Критичность | Решение |
|---|----------|------|-------------|---------|
| B-1 | `hydrateSessionScope()` может вызваться дважды (onRequest + preValidation) | `index.js:506,527` | MEDIUM | Добавить guard flag `request.scopeHydrated` |
| B-2 | 80+ env vars дублируются между server и worker в docker-compose | `docker-compose.yml` | LOW | Вынести в `.env` файл или `env_file` директиву |
| B-3 | `computeClientValueScore()` в JS вместо SQL | `portfolio.js` | LOW | Перенести в matview или SQL function |
| B-4 | `use-project-portfolio.js`: 335 строк, 21 values в context | `web/hooks/` | LOW | Оценено — разделение неоправданно. Оставить as-is |
| B-5 | Vector index tuning (IVFFlat probes / HNSW ef_search) только через env vars | `embeddings.js` | LOW | Будет решено при миграции на HKUDS LightRAG (Iter 11) |
| B-6 | Нет pre-built Grafana dashboards | `docker-compose.monitoring.yml` | LOW | Datasources provisioned, dashboards вручную |
| B-7 | Custom RAG quality score — proxy metric без ground truth | `lightrag.js` | LOW | Будет заменён quality metrics из HKUDS LightRAG (Iter 11) |

---

## Completed Iterations Summary

| Iter | Название | Задач | Статус |
|------|----------|-------|--------|
| 0 | Security Hardening | 7/7 | ✅ Done |
| 1 | Redis Caching Layer | 8/8 | ✅ Done |
| 2 | Backend Reliability | 5/6 | ✅ Done |
| 3 | Frontend Performance | 5/6 | ✅ Done |
| 4 | Database Optimization | 6/6 | ✅ Done |
| 5 | Observability & Ops | 6/6 | ✅ Done |
| 6 | Data Quality & UX | 5/5 | ✅ Done |
| 7 | Input Validation | 4/4 | ✅ Done |
| 8 | Security Hardening II | 7/7 | ✅ Done |
| 9 | Extended Input Validation | 5/5 | ✅ Done |
| **Итого** | | **58/60** | |
