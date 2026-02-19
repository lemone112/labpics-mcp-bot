# Бэклог (Product Backlog)

> Обновлено: 2026-02-19
> Roadmap: [`docs/mvp-vs-roadmap.md`](./mvp-vs-roadmap.md)
> Iteration plan (Wave 2): [`docs/iteration-plan-wave2.md`](./iteration-plan-wave2.md)
> **Source of truth:** [GitHub Issues & Milestones](https://github.com/lemone112/labpics-dashboard/milestones)

---

## Active Iterations (Wave 2)

### Iter 11 — HKUDS LightRAG Migration + MCP | CRITICAL

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

### Iter 13 — Frontend Resilience & Auth | HIGH

> Задачи: [GitHub Milestone](https://github.com/lemone112/labpics-dashboard/milestone/2) (#56–#66, #114, #116)

### Iter 14 — Design System & Accessibility | MEDIUM

> Задачи: [GitHub Milestone](https://github.com/lemone112/labpics-dashboard/milestone/3) (#67–#76, #103–#108, #115)

### Iter 15 — TypeScript, CI/CD & Infrastructure | MEDIUM

> Задачи: [GitHub Milestone](https://github.com/lemone112/labpics-dashboard/milestone/4) (#77–#90)

### Iter 16 — QA & Release Readiness | HIGH

> Задачи: [GitHub Milestone](https://github.com/lemone112/labpics-dashboard/milestone/5) (#91–#102, #117–#119)

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
| 10 | KAG Cleanup + DB Hygiene | 9/9 | ✅ Done |
| 12 | Backend Security & Reliability | 10/10 | ✅ Done |
| **Итого** | | **77/79** | |
