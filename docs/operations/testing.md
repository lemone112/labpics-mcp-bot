# Тестирование

## 1) Обзор

Продукт использует три уровня тестирования:

| Уровень | Фреймворк | Расположение | Что покрывает |
|---------|-----------|-------------|---------------|
| **Unit tests** | `node:test` (Node.js built-in) | `apps/api/test/*.unit.test.js` | Чистые функции, бизнес-логика, утилиты |
| **Integration tests** | `node:test` | `apps/api/test/*.integration.test.js` | End-to-end pipelines (signals → scores → recommendations) |
| **E2E tests** | Playwright | `apps/web/e2e-integration/*.spec.js` | UI сценарии, routing, project scope |

## 2) Запуск

### Backend unit + integration tests

```bash
cd apps/api
npm test
```

Все файлы `test/**/*.test.js` подхватываются Node.js test runner.

### Frontend lint + design audit

```bash
cd apps/web
npm run lint           # design audit + consistency checks
npm run build          # Next.js production build
```

### E2E tests (Playwright)

```bash
cd apps/web
npm run test:e2e                # С мокированным API
npm run test:e2e:integration    # С полным стеком (Docker Compose)
```

## 3) Что покрыто тестами

### Backend — unit tests

| Модуль | Файл теста | Что проверяется |
|--------|-----------|-----------------|
| `infra/chunking.js` | `chunking.unit.test.js` | chunkText, shortSnippet, toIsoTime, toPositiveInt |
| `infra/utils.js` | `utils.unit.test.js` | toPositiveInt, clamp, clampInt, toNumber, round, toDate, toIso, addDaysIso, asText, toBoolean, requiredEnv |
| `infra/db.js` | `db.unit.test.js` | vectorLiteral, withTransaction (с mock pool) |
| `infra/http.js` | `http.unit.test.js` | fetchWithRetry: retry logic, backoff, timeout, status codes |
| `infra/api-contract.js` | `platform.unit.test.js` | ApiError, fail, toApiError, sendOk, sendError, parseLimit |
| `infra/scope.js` | `platform.unit.test.js` | getRequestScope, requireProjectScope |
| `infra/redis.js` | `redis-client.unit.test.js` | createRedisClient graceful null |
| `infra/redis-pubsub.js` | `redis-pubsub.unit.test.js` | Pub/Sub no-op при отсутствии Redis |
| `infra/sse-broadcaster.js` | `sse-broadcaster.unit.test.js` | addClient, broadcast, broadcastAll, cleanup |
| `connectors/index.js` | `connectors.unit.test.js` | createConnector, HTTP/MCP mode, validation |
| `domains/rag/lightrag.js` | `lightrag.unit.test.js` | tokenizeQuery, buildLikePatterns, buildEvidenceFromRows, lightragAnswer |
| `domains/core/reconciliation.js` | `reconciliation.unit.test.js` | percentOf, averagePercent, clampPercent, finalizeMetric, buildPortfolioMetric |
| `domains/connectors/connector-state.js` | `connector-state.unit.test.js` | nextBackoffSeconds, dedupeKeyForError |
| `domains/core/portfolio.js` | `portfolio.unit.test.js` | computeClientValueScore, toDiscountLimit, uniqueProjectIds, normalizeMessageAttachments |
| `domains/core/jobs.js` | `jobs.unit.test.js` | Storage budget calculation logic |
| `domains/core/scheduler.js` | `scheduler.cascade.unit.test.js` | CASCADE_CHAINS topology, circular reference detection |
| Extended schemas | `extended-schemas.unit.test.js` | Validation schemas for signals, NBA, identity, recommendations, connectors, outbound, loops, upsell, continuity |
| Zod schemas | `schemas.unit.test.js` | Schema definitions and parseBody |
| Security hardening | `security-hardening.unit.test.js` | Auth, CSRF, rate limiting |

### Frontend — E2E

| Сценарий | Файл теста | Что проверяется |
|----------|-----------|-----------------|
| Project scope | `project-scope-regression.spec.js` | Desktop/mobile project selection, scope routing |
| Control Tower design system | `design-system-control-tower.spec.js` | Hero panel, primary CTA, trust bar, empty wizard per section |

## 4) Подход к тестированию

### Принципы

1. **Pure function first**: максимальное покрытие чистых функций без DB/IO зависимостей
2. **Mock injection**: зависимости передаются как параметры (не глобальные моки)
3. **Builder pattern**: test helpers (`event()`, `evidence()`) для консистентных fixtures
4. **No new dependencies**: используем только `node:test` + `node:assert/strict`
5. **Deterministic**: фиксированные timestamps, seed-значения

### Паттерны моков

```js
// Mock pool для DB-зависимых тестов
const mockPool = { query: async () => ({ rows: [] }) };

// Mock logger
const mockLogger = { info: () => {}, warn: () => {}, error: () => {} };

// Mock Reply для SSE тестов
const mockReply = { raw: { write: () => {}, on: () => {} } };
```

### Что НЕ тестируется unit-тестами

- Реальные SQL-запросы (требуют integration test с PostgreSQL)
- Реальные HTTP-вызовы к внешним API (Chatwoot, Linear, Attio, OpenAI)
- Redis Pub/Sub с реальным Redis-сервером
- Next.js серверный рендеринг

## 5) CI/CD интеграция

GitHub Actions workflow `ci-quality.yml` запускает:

1. `cd apps/api && npm test` — backend tests
2. `cd apps/web && npm run lint` — frontend lint
3. `cd apps/web && npm run build` — production build

## 6) Добавление новых тестов

1. Создай файл `apps/api/test/<module>.<type>.test.js` (type: `unit` или `integration`)
2. Используй `import { describe, it } from 'node:test'` и `import assert from 'node:assert/strict'`
3. Для test data используй helpers из `apps/api/test/helpers.js`
4. Запусти `cd apps/api && npm test` для проверки

## 7) Связанные документы

- Backend services: [`docs/architecture/backend-services.md`](../architecture/backend-services.md)
- API: [`docs/architecture/api.md`](../architecture/api.md)
- CI/CD: `.github/workflows/ci-quality.yml`
