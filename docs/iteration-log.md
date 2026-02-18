# Iteration log

## Iteration: LightRAG migration (закрыта)

### Что изменено

1. Введён режим `LIGHTRAG_ONLY=1` как дефолт.
2. Добавлены API:
   - `POST /lightrag/query`
   - `POST /lightrag/refresh`
   - `GET /lightrag/status`
3. `/search` переведён на LightRAG alias-модель.
4. В scheduler legacy jobs, связанные с `/kag/*`, переводятся в `paused` в LightRAG-only режиме.
5. Dashboard/UI очищены от зависимостей на `/kag/*` и опираются на LightRAG.
6. Добавлена таблица `lightrag_query_runs` для observability запросов.

### Самокритика

- В репозитории остаются legacy-артефакты, что увеличивает стоимость поддержки.
- Часть исторических таблиц теперь не используется в активном пользовательском контуре.
- Нужно усилить e2e-кейсы именно для LightRAG релиз-критериев.

---

## Iteration: Deep Product Analysis (закрыта — 2026-02-18)

### Что изменено

1. 3-цикловый deep analysis всей структуры продукта (structure → hotpaths → self-criticism).
2. Идентифицированы 6 ключевых зон с оценкой зрелости: Platform (80%), Connectors (85%), Intelligence (65%), Dashboard (50%), Frontend (70%), Infrastructure (40%).
3. Обнаружено 15 критических/high bottlenecks:
   - 18-20 SQL-запросов на `/portfolio/overview` без кеширования
   - Session UPDATE на каждый HTTP-запрос
   - ILIKE fullscan без pg_trgm index
   - 11 LATERAL subqueries в portfolio dashboard
   - Plaintext credentials, нет API rate limiting
   - Root user в Docker, открытые DB/Redis порты
4. Проведён количественный анализ Redis-кеширования: экономия 70-95% DB queries, p95 latency снижение в 100x.
5. Составлен 7-итерационный production-ready план (43 задачи с acceptance criteria).

### Самокритика

- Redis cache — однозначно оправдан (4-5MB памяти, ~100 строк кода, 10x improvement).
- Materialized views и Redis кеш решают разные проблемы (cold vs warm path) — нужны оба.
- Frontend optimizations не заменяют backend caching: при 800ms API response useMemo не спасёт.
- Security (Iter 0) должен быть merged first — gate для production.
- Порядок итераций верифицирован: зависимости корректны, параллелизм максимизирован.

### Артефакты

- [`docs/product-structure-analysis.md`](./product-structure-analysis.md) — полный анализ
- [`docs/mvp-vs-roadmap.md`](./mvp-vs-roadmap.md) — обновлённый roadmap с 7 итерациями

---

## Следующие итерации (план)

> Полный план с acceptance criteria: [`docs/mvp-vs-roadmap.md`](./mvp-vs-roadmap.md)

### Iter 0 — Security Hardening (GATE)
1. Убрать default credentials из docker-compose
2. Bcrypt hashing для паролей
3. Non-root Docker user
4. Закрыть DB/Redis порты
5. API rate limiting
6. Resource limits
7. Container healthchecks

### Iter 1 — Redis Caching Layer
1. Создать `lib/cache.js` с graceful degradation
2. Третье Redis-соединение для cache
3. Session cache (TTL 60s, batch last_seen_at)
4. Portfolio overview cache (TTL 90s)
5. LightRAG query cache (TTL 300s)
6. Control Tower cache (TTL 120s)
7. Event-driven invalidation через job_completed
8. Cache metrics в /metrics

### Iter 2 — Backend Reliability
1. Circuit breaker для внешних API
2. Graceful shutdown (SIGTERM handler)
3. Structured JSON logging (pino)
4. Input validation schemas (zod)
5. PostgreSQL backup strategy
6. Completeness alerting

### Iter 3 — Frontend Performance
1. useMemo для 11 chart transforms
2. React.memo для chart card components
3. Ticker interval 1s → 5s
4. Disable polling при активном SSE
5. Code splitting (next/dynamic)
6. Refactor use-project-portfolio.js → 3 хука

### Iter 4 — Database Optimization
1. Strategic indexes (6+ таблиц)
2. pg_trgm для ILIKE search
3. Materialized view для portfolio
4. Оптимизация LATERAL → batch queries
5. Cleanup orphaned tables
6. Partitioning audit_events

### Iter 5 — Observability & Ops
1. Extended Prometheus metrics
2. Alert rules
3. Backup verification
4. Log aggregation
5. Runbook updates
6. CI smoke tests

### Iter 6 — Data Quality & LightRAG UX
1. Quality score proxy
2. Feedback endpoint
3. Evidence source filters
4. Auto-dedup preview
5. Completeness diff report
