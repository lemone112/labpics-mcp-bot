# Интеграции — полная спецификация (v2.0, 2026-02-17)

> Документ описывает все внешние интеграции: протоколы, API-контракты, маппинг полей,
> синхронизацию, обработку ошибок и environment variables. Является частью базиса продукта.

---

## 1) Обзор интеграций

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        ВНЕШНИЕ ИСТОЧНИКИ (Inbound)                      │
├────────────────┬────────────────────┬────────────────────────────────────┤
│ Chatwoot       │ Linear             │ Attio                             │
│ REST API       │ GraphQL API        │ REST API v2                       │
│ Сообщения      │ Задачи             │ CRM                              │
│ Контакты       │ Статусы            │ Компании, сделки                  │
│ Инбоксы        │ Циклы              │ Контакты, активности              │
└──────┬─────────┴──────┬─────────────┴──────┬─────────────────────────────┘
       │                │                    │
       ▼                ▼                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                fetchWithRetry → normalize → upsert → watermark          │
│                           CONNECTOR LAYER                                │
└──────────────────────────────────────────────────────────────────────────┘
       │                │                    │
       ▼                ▼                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        ИСХОДЯЩИЕ (Outbound)                              │
├────────────────┬────────────────────┬────────────────────────────────────┤
│ Loops          │ Outbox             │ Composio / MCP                    │
│ Email sync     │ email/chatwoot/tg  │ AI tool invocation                │
│ REST API v1    │ policy + audit     │ Коннектор (HTTP/MCP)              │
└────────────────┴────────────────────┴────────────────────────────────────┘
```

### Connector modes

Каждый коннектор поддерживает два режима работы:

| Режим | Описание | Env |
|-------|----------|-----|
| `http` | Прямые HTTP/GraphQL вызовы к внешнему API | `CONNECTOR_MODE=http` (default) |
| `mcp` | Вызов через Composio MCP bridge | `CONNECTOR_MODE=mcp` |

Режим задаётся глобально (`CONNECTOR_MODE`) или per-connector (`CONNECTOR_CHATWOOT_MODE`).

---

## 2) Общий HTTP-клиент — fetchWithRetry

**Файл:** `apps/api/src/infra/http.ts`

```
fetchWithRetry(url, {
  retries: 2,          // Макс. повторов после первого запроса
  timeoutMs: 15_000,   // Таймаут на каждый запрос (AbortController)
  backoffMs: 500,      // Базовый backoff (экспоненциальный: 500 × attempt)
  logger,              // Pino/console
  ...fetchOptions      // Любые опции native fetch
})
```

### Стратегия retry

| HTTP Status | Retry? | Описание |
|-------------|--------|----------|
| 408 | Yes | Request Timeout |
| 425 | Yes | Too Early |
| 429 | Yes | Rate Limited |
| 5xx | Yes | Server Error |
| 4xx (другие) | No | Клиентская ошибка |
| Network error | Yes | Сеть/DNS |

### Backoff

- **Формула:** `sleep(backoffMs × (attempt + 1))`
- **Пример:** 500ms → 1000ms → 1500ms (при 3 попытках)
- **Таймаут:** Каждый запрос ограничен через `AbortController` (не глобальный timeout)

---

## 3) Sync State Machine — управление состоянием

### 3.1 Connector Sync State

**Файл:** `apps/api/src/domains/connectors/connector-state.js`
**Таблица:** `connector_sync_state`

```
┌──────────┐     success    ┌──────┐
│  idle    ├───────────────►│  ok  │
│ (новый)  │                └──┬───┘
└────┬─────┘                   │
     │ run                     │ next sync
     ▼                         ▼
┌──────────┐     success    ┌──────────┐
│ running  ├───────────────►│    ok    │
│          │                └──────────┘
└────┬─────┘
     │ error
     ▼
┌──────────┐
│ failed   │──► retry_count++
└──────────┘
```

**Поля состояния:**
- `connector` — имя коннектора (chatwoot, linear, attio)
- `mode` — http / mcp
- `status` — ok / running / failed
- `cursor_ts`, `cursor_id` — последний обработанный объект
- `page_cursor` — курсор пагинации (для продолжения)
- `retry_count` — количество неудачных попыток подряд
- `last_success_at`, `last_attempt_at` — timestamps
- `meta` — jsonb с результатами последнего sync

### 3.2 Connector Errors (DLQ)

**Таблица:** `connector_errors`

| Поле | Описание |
|------|----------|
| `connector` | chatwoot / linear / attio |
| `mode` | http / mcp |
| `operation` | sync / webhook / etc |
| `error_kind` | Классификация ошибки |
| `error_message` | Полный текст (до 4000 символов) |
| `attempt` | Текущий номер попытки |
| `next_retry_at` | Следующая попытка |
| `status` | pending → retrying → resolved / dead_letter |
| `dedupe_key` | SHA1 дедупликации |
| `payload_json` | Контекст для retry |

**Backoff для DLQ:**
- **Формула:** `baseSeconds × 2^(attempt-1)`, cap = 6 часов
- **Base:** `CONNECTOR_RETRY_BASE_SECONDS` (default 30)
- **Max attempts:** `CONNECTOR_MAX_RETRIES` (default 5)
- После исчерпания попыток → `dead_letter`

### 3.3 Watermarks

**Таблица:** `sync_watermarks`

Каждый коннектор хранит своё место синхронизации:
- `source` — формат `{connector}:{workspace_id}` (напр. `chatwoot:12345`)
- `cursor_ts` — timestamp последнего обработанного объекта
- `cursor_id` — ID последнего обработанного объекта
- `meta` — результаты последнего sync (counters, storage usage, etc.)

---

## 4) Chatwoot — коммуникации

**Файл:** `apps/api/src/domains/connectors/chatwoot.js`
**Протокол:** REST API
**Auth:** Header `api_access_token: {token}`

### 4.1 API Endpoints

| Endpoint | Метод | Описание | Таймаут |
|----------|-------|----------|---------|
| `/api/v1/accounts/{id}/conversations` | GET | Список бесед | 20s |
| `/api/v1/accounts/{id}/conversations/{id}/messages` | GET | Сообщения беседы | 20s |
| `/api/v1/accounts/{id}/inboxes` | GET | Список инбоксов | 20s |

### 4.2 Sync Flow

```
1. Resolve account_id → project_sources binding
2. Load watermark (cursor_ts + cursor_id)
3. List inboxes → upsert cw_inboxes_raw
4. List conversations (sorted by last_activity_at DESC)
   ├── Per conversation:
   │   ├── Extract contact → contactsById map
   │   ├── Upsert cw_conversations
   │   ├── List messages (max CHATWOOT_MESSAGES_LIMIT)
   │   │   ├── Skip messages before watermark
   │   │   ├── Extract message contacts → contactsById
   │   │   ├── Build chunk rows (for RAG)
   │   │   ├── Extract attachments
   │   │   └── Track newest timestamp
   │   ├── Batch upsert cw_messages (jsonb_to_recordset)
   │   ├── Batch upsert cw_attachments_raw
   │   └── Insert RAG chunk rows
5. Batch upsert all contacts (batches of 200)
6. Check storage usage vs budget
7. Update watermark
```

### 4.3 Пагинация бесед

- Per page: `CHATWOOT_CONVERSATIONS_PER_PAGE` (default 25, max 100)
- Max pages: `CHATWOOT_PAGES_LIMIT` (default 20, max 200)
- Max conversations: `CHATWOOT_CONVERSATIONS_LIMIT` (default 60, max 1000)
- Sorting: `sort_by=last_activity_at&order_by=desc`
- Deduplicate by conversation ID (Set)
- Останавливается если: пустая страница, все дубликаты, < perPage на странице

### 4.4 Incremental Sync (Watermark)

- `cursor_ts` — timestamp последнего обработанного сообщения
- `cursor_id` — global ID последнего сообщения
- Lookback: `CHATWOOT_LOOKBACK_DAYS` (default 7)
- Сообщения со временем `< cursor_ts` пропускаются
- Если `createdAt == cursor_ts`, дополнительная проверка по numeric message ID

### 4.5 Маппинг данных

#### Conversations → cw_conversations
| Chatwoot | PostgreSQL | Формат |
|----------|-----------|--------|
| `id` | `conversation_id` | bigint |
| — | `id` (PK) | `cw:{projectId}:{accountId}:{conversationId}` |
| `meta.sender` / `contact` | `contact_global_id` | FK → cw_contacts |
| `inbox_id` | `inbox_id` | bigint |
| `status` | `status` | text (до 100 символов) |
| `assignee_id` | `assignee_id` | bigint |
| `last_activity_at` | `updated_at` | timestamptz |
| (полный объект) | `data` | jsonb |

#### Messages → cw_messages
| Chatwoot | PostgreSQL | Формат |
|----------|-----------|--------|
| `id` | `message_id` | bigint |
| — | `id` (PK) | `cwmsg:{projectId}:{accountId}:{messageId}` |
| `conversation_id` | `conversation_global_id` | FK → cw_conversations |
| `sender` | `contact_global_id` | FK → cw_contacts (если Contact) |
| `sender_type` | `sender_type` | text |
| `sender_id` | `sender_id` | bigint |
| `private` | `private` | boolean |
| `message_type` | `message_type` | text |
| `content` | `content` | text |
| `created_at` | `created_at` | timestamptz |
| (полный объект) | `data` | jsonb |

#### Contacts → cw_contacts
| Chatwoot | PostgreSQL | Формат |
|----------|-----------|--------|
| `id` | `contact_id` | bigint |
| — | `id` (PK) | `cwc:{projectId}:{accountId}:{contactId}` |
| `name` | `name` | text (до 500) |
| `email` | `email` | text (до 500) |
| `phone_number` | `phone_number` | text (до 100) |
| `identifier` | `identifier` | text (до 500) |
| `custom_attributes` | `custom_attributes` | jsonb |

#### Attachments → cw_attachments_raw
| Chatwoot | PostgreSQL | Формат |
|----------|-----------|--------|
| `id` / index | `id` (PK) | `cwa:{projectId}:{accountId}:{attachmentId}` |
| `file_type` | `content_type` | text (до 120) |
| `file_size` | `file_size` | bigint |
| `data_url` | `file_url` | text (до 2000) |
| `thumb_url` | `thumb_url` | text (до 2000) |

#### Inboxes → cw_inboxes_raw
| Chatwoot | PostgreSQL | Формат |
|----------|-----------|--------|
| `id` | `inbox_id` | bigint |
| — | `id` (PK) | `cwinbox:{projectId}:{accountId}:{inboxId}` |
| `name` | `name` | text (до 300) |
| `channel_type` | `channel_type` | text (до 100) |

### 4.6 RAG Chunking

Каждое не-private сообщение разбивается на чанки для RAG:

- **Chunk size:** `CHUNK_SIZE` (default 1000, min 200, max 4000 символов)
- **Min chars:** `MIN_EMBED_CHARS` (default 30)
- **Hash:** SHA256 от текста чанка (дедупликация)
- **Token estimate:** `ceil(text.length / 4)`
- **Model:** `EMBEDDING_MODEL` (default `text-embedding-3-small`)
- **Conflict:** `ON CONFLICT (message_global_id, chunk_index) DO NOTHING`
- **Re-embed:** Если `text_hash` изменился, сбрасывает `embedding_status` → `pending`

### 4.7 Storage Monitoring

После sync проверяется использование диска:
- `STORAGE_BUDGET_GB` (default 20)
- `STORAGE_ALERT_THRESHOLD_PCT` (default 85%)
- При превышении → `logger.warn`

### 4.8 Environment Variables

| Variable | Default | Описание |
|----------|---------|----------|
| `CHATWOOT_BASE_URL` | (required) | Base URL Chatwoot instance |
| `CHATWOOT_API_TOKEN` | (required) | API access token |
| `CHATWOOT_ACCOUNT_ID` | (bootstrap) | Account ID для sync |
| `CHATWOOT_CONVERSATIONS_LIMIT` | 60 | Макс. бесед за sync |
| `CHATWOOT_MESSAGES_LIMIT` | 300 | Макс. сообщений на беседу |
| `CHATWOOT_LOOKBACK_DAYS` | 7 | Дней назад при первом sync |
| `CHATWOOT_CONVERSATIONS_PER_PAGE` | 25 | Записей на страницу |
| `CHATWOOT_PAGES_LIMIT` | 20 | Макс. страниц пагинации |
| `CHUNK_SIZE` | 1000 | Размер чанка (символы) |
| `MIN_EMBED_CHARS` | 30 | Минимум символов для эмбеддинга |
| `EMBEDDING_MODEL` | text-embedding-3-small | Модель эмбеддингов |
| `STORAGE_BUDGET_GB` | 20 | Бюджет хранилища |
| `STORAGE_ALERT_THRESHOLD_PCT` | 85 | Порог предупреждения (%) |

### 4.9 Upsert Strategy

Все upsert-ы используют паттерн **jsonb_to_recordset batch + conditional update**:

```sql
INSERT INTO table(...)
SELECT x.* FROM jsonb_to_recordset($1::jsonb) AS x(...)
ON CONFLICT (id)
DO UPDATE SET ...
WHERE old.data IS DISTINCT FROM EXCLUDED.data
   OR old.updated_at IS DISTINCT FROM EXCLUDED.updated_at
   OR ...
```

Ключевые свойства:
- **Batch:** Все сообщения/контакты вставляются одним запросом
- **Idempotent:** Повторный sync не создаёт дублей
- **Efficient:** `IS DISTINCT FROM` пропускает неизменённые записи
- **Scoped:** Все записи привязаны к `project_id` + `account_scope_id`

---

## 5) Linear — управление задачами

**Файл:** `apps/api/src/domains/connectors/linear.js`
**Протокол:** GraphQL API
**Auth:** Header `authorization: {token}`

### 5.1 GraphQL Queries

#### Metadata Query (projects, states, cycles)
```graphql
query PullLinear($limit: Int!) {
  projects(first: $limit) {
    nodes { id, name, state, updatedAt, lead { name } }
  }
  workflowStates(first: $limit) {
    nodes { id, name, type, position, updatedAt, team { id } }
  }
  cycles(first: $limit) {
    nodes { id, number, startsAt, endsAt, completedAt, progress, updatedAt, team { id } }
  }
}
```

#### Issues Query (paginated)
```graphql
query PullLinearIssues($limit: Int!, $after: String) {
  issues(first: $limit, orderBy: updatedAt, after: $after) {
    nodes {
      id, title, priority, dueDate, updatedAt, completedAt
      project { id }
      state { id, name, type }
      cycle { id, number }
      labels(first: 10) { nodes { id, name } }
      blockedByIssues(first: 10) { nodes { id } }
      assignee { name }
    }
    pageInfo { hasNextPage, endCursor }
  }
}
```

### 5.2 Sync Flow

```
1. Resolve workspace_id → project_sources binding
2. Load watermark
3. Choose mode: API or Mock
4. Single metadata query → projects + states + cycles
5. Paginated issues query (cursor-based):
   ├── Max pages: LINEAR_SYNC_MAX_PAGES (default 100)
   ├── Deduplicate by issue ID (Set)
   └── Stop on: !hasNextPage || !endCursor
6. Normalize all entities
7. Upsert в 4 таблицы
8. Compute cursor (newest updated_at across all entities)
9. Update watermark
```

### 5.3 Пагинация

- **Type:** Cursor-based (Relay-style `pageInfo.endCursor`)
- **Page size:** `LINEAR_SYNC_LIMIT` (default 200, max 1000)
- **Max pages:** `LINEAR_SYNC_MAX_PAGES` (default 100)
- **Ordering:** `orderBy: updatedAt`

### 5.4 Mock Mode

Когда `LINEAR_MOCK_MODE=true` или отсутствует `LINEAR_API_TOKEN`:
- Генерирует mock-данные на основе существующих `cw_conversations`
- 6 проектов, 4 состояния, 1 цикл, 18 задач
- Полезно для dev-окружения без реального Linear workspace

### 5.5 Маппинг данных

#### Projects → linear_projects_raw
| Linear | PostgreSQL | Формат |
|--------|-----------|--------|
| `id` | `external_id` | text |
| — | `id` (PK) | `linproj:{workspaceId}:{externalId}` |
| `name` | `name` | text (до 300) |
| `state` | `state` | text (до 80) |
| `lead.name` | `lead_name` | text (до 200) |

#### Issues → linear_issues_raw
| Linear | PostgreSQL | Формат |
|--------|-----------|--------|
| `id` | `external_id` | text |
| — | `id` (PK) | `linissue:{workspaceId}:{externalId}` |
| `project.id` | `linear_project_external_id` | text |
| `title` | `title` | text (до 500) |
| `state.name` | `state` | text (до 100) |
| `state.id` | `state_external_id` | text |
| `state.type` | `state_type` | text (started/completed/etc.) |
| `cycle.id` | `cycle_external_id` | text |
| `cycle.number` | `cycle_name` | "Cycle N" |
| `labels.nodes[].name` | `labels` | text[] |
| `blockedByIssues.nodes` | `blocked` / `blocked_by_count` | bool / int |
| `priority` | `priority` | int |
| `assignee.name` | `assignee_name` | text (до 200) |
| `dueDate` | `due_date` | date |
| `completedAt` | `completed_at` | timestamptz |

#### Workflow States → linear_states_raw
| Linear | PostgreSQL |
|--------|-----------|
| `id` → `linstate:{wid}:{id}` | `id` (PK) |
| `name` | `name` |
| `type` | `type` (unstarted/started/completed/cancelled) |
| `position` | `position` |
| `team.id` | `team_external_id` |

#### Cycles → linear_cycles_raw
| Linear | PostgreSQL |
|--------|-----------|
| `id` → `lincycle:{wid}:{id}` | `id` (PK) |
| `number` | `number` |
| `startsAt` / `endsAt` | `starts_at` / `ends_at` |
| `completedAt` | `completed_at` |
| `progress` | `progress` (numeric) |

### 5.6 Environment Variables

| Variable | Default | Описание |
|----------|---------|----------|
| `LINEAR_BASE_URL` | `https://api.linear.app/graphql` | GraphQL endpoint |
| `LINEAR_API_TOKEN` | (required unless mock) | API key |
| `LINEAR_WORKSPACE_ID` | auto-{projectId} | Workspace ID |
| `LINEAR_MOCK_MODE` | false | Генерировать mock-данные |
| `LINEAR_SYNC_LIMIT` | 200 | Записей на страницу |
| `LINEAR_SYNC_MAX_PAGES` | 100 | Макс. страниц для issues |

---

## 6) Attio — CRM

**Файл:** `apps/api/src/domains/connectors/attio.js`
**Протокол:** REST API v2
**Auth:** Header `authorization: Bearer {token}`

### 6.1 API Endpoints

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/v2/objects/companies/records` | GET | Компании (accounts) |
| `/v2/objects/deals/records` | GET | Сделки (opportunities) |
| `/v2/objects/people/records` | GET | Контакты (people) |
| `/v2/activities` | GET | Активности |

### 6.2 Sync Flow

```
1. Resolve workspace_id → project_sources binding
2. Load watermark
3. Choose mode: API or Mock
4. Parallel fetch: companies + deals (Promise.all)
5. Sequential (soft-fail): people, activities
6. Normalize all entities
7. Upsert в 4 raw таблицы:
   ├── attio_accounts_raw
   ├── attio_opportunities_raw
   ├── attio_people_raw
   └── attio_activities_raw
8. Mirror → CRM tables (3-step):
   ├── Step 1: Update crm_accounts by external_ref
   ├── Step 2: Attach crm_accounts by name (fuzzy match)
   ├── Step 3: Insert new crm_accounts
   └── Step 4: Upsert crm_opportunities (JOIN by account external_ref)
9. Coverage metrics (gaps detection)
10. Update watermark
```

### 6.3 Пагинация

- **Type:** Cursor-based
- **Cursor extraction:** Пробует множество путей в ответе:
  ```
  pagination.next_cursor / pagination.next / meta.next_cursor / meta.next /
  next_cursor / next / cursor.next
  ```
- **Max pages:** `ATTIO_SYNC_MAX_PAGES` (default 50, max 500)
- **Deduplicate:** По record ID (Set)
- **Stops:** Нет `nextCursor`, пустая страница, или дублирующийся cursor

### 6.4 Field Extraction (unwrapStructuredValue)

Attio хранит значения в сложных вложенных структурах. Функция `unwrapStructuredValue` рекурсивно извлекает значения:

**Priority keys (в порядке приоритета):**
```
value, title, name, text, display_value, displayValue, domain, email,
amount, currency_value, currencyValue, number, date, id, record_id,
external_id, target_record_id
```

**Стратегия:**
1. String/number/boolean → возврат напрямую
2. Array → первый непустой элемент
3. Object → проверить priority keys, затем рекурсия по всем значениям
4. Глубина рекурсии ограничена: max depth = 5

### 6.5 Маппинг данных

#### Companies → attio_accounts_raw
| Attio | PostgreSQL | Extraction |
|-------|-----------|------------|
| `id` | `external_id` | `record.id` |
| — | `id` (PK) | `attioacct:{wid}:{externalId}` |
| values.name | `name` | `pickRecordField(values, ["name", "company_name", "legal_name"])` |
| values.domain | `domain` | `pickRecordField(values, ["domain", "domains", "website"])` |
| values.annual_revenue | `annual_revenue` | `toAmount()` — парсит строки и числа |
| values.stage | `stage` | `pickRecordField(values, ["stage", "account_stage"])` |

#### Opportunities → attio_opportunities_raw
| Attio | PostgreSQL | Extraction |
|-------|-----------|------------|
| `id` | `external_id` | `record.id` |
| — | `id` (PK) | `attiodeal:{wid}:{externalId}` |
| values.account_id | `account_external_id` | `extractRelationExternalId()` |
| values.name | `title` | `pickRecordField(values, ["name", "title", "deal_name"])` |
| values.stage | `stage` | default "discovery" |
| values.amount | `amount` | `toAmount()` |
| values.probability | `probability` | 0-1, auto-scale if 1-100 |
| values.expected_close_date | `expected_close_date` | date |

#### People → attio_people_raw
| Attio | PostgreSQL | Extraction |
|-------|-----------|------------|
| `id` | `external_id` | `record.id` |
| — | `id` (PK) | `attioperson:{wid}:{externalId}` |
| values.company_id | `account_external_id` | `extractRelationExternalId()` |
| values.name | `full_name` | до 300 символов |
| values.email | `email` | до 320 символов |
| values.role | `role` | до 200 символов |

#### Activities → attio_activities_raw
| Attio | PostgreSQL | Extraction |
|-------|-----------|------------|
| `id` | `external_id` | `record.id` |
| — | `id` (PK) | `attioact:{wid}:{externalId}` |
| values.record_id | `record_external_id` | Привязка к deal/company |
| values.type | `activity_type` | note / invoice_sent / etc. |
| values.note | `note` | до 4000 символов |
| values.actor_name | `actor_name` | до 250 символов |
| values.occurred_at | `occurred_at` | timestamptz |

### 6.6 CRM Mirror (attio_*_raw → crm_*)

Данные зеркалируются из raw-таблиц в нормализованные CRM-таблицы:

**Accounts mapping (3-step merge):**
1. **By external_ref:** `crm_accounts.external_ref = attio_accounts_raw.external_id`
2. **By name (fuzzy):** `lower(crm_accounts.name) = lower(attio.name)` где `external_ref IS NULL`
3. **Insert new:** Если нет совпадений ни по ref, ни по имени

**Stage normalization:**
| Attio Stage | CRM Stage |
|-------------|-----------|
| active, customer, won, closed-won | `active` |
| inactive, churned, lost, closed-lost | `inactive` |
| (все остальные) | `prospect` |

**Opportunities mapping:**
- JOIN `crm_accounts` по `external_ref = account_external_id`
- Opportunities без привязанного account → пропускаются (регистрируется gap)

**Stage normalization для opportunities:**
| Attio Stage | CRM Stage |
|-------------|-----------|
| won, closed-won | `won` |
| lost, closed-lost | `lost` |
| proposal, proposal_sent | `proposal` |
| negotiation | `negotiation` |
| qualified | `qualified` |
| (все остальные) | `discovery` |

### 6.7 Coverage Metrics

После mirror вычисляются метрики покрытия:
- `total_attio_accounts` vs `mirrored_accounts`
- `total_attio_opportunities` vs `mirrored_opportunities`
- `opportunities_without_account_ref` — сделки без привязки к компании
- `opportunities_unmapped_to_crm_account` — привязка есть, но account не найден в CRM

Если gaps > 0, коннектор выдаёт warning в process log.

### 6.8 Mock Mode

При `ATTIO_MOCK_MODE=true` или отсутствии `ATTIO_API_TOKEN`:
- Генерирует mock-данные на основе `cw_contacts`
- До 40 компаний, 20 сделок, 12 контактов, 10 активностей

### 6.9 Environment Variables

| Variable | Default | Описание |
|----------|---------|----------|
| `ATTIO_BASE_URL` | `https://api.attio.com` | Base URL |
| `ATTIO_API_TOKEN` | (required unless mock) | Bearer token |
| `ATTIO_WORKSPACE_ID` | auto-{projectId} | Workspace ID |
| `ATTIO_MOCK_MODE` | false | Генерировать mock-данные |
| `ATTIO_SYNC_LIMIT` | 200 | Записей на страницу |
| `ATTIO_SYNC_MAX_PAGES` | 50 | Макс. страниц |

---

## 7) OpenAI — Embeddings

**Файл:** `apps/api/src/domains/rag/openai.js` (клиент), `apps/api/src/domains/rag/embeddings.js` (pipeline)
**Протокол:** REST API
**Auth:** Header `authorization: Bearer {api_key}`

### 7.1 API

```
POST https://api.openai.com/v1/embeddings
Content-Type: application/json
Authorization: Bearer {OPENAI_API_KEY}

{
  "model": "text-embedding-3-small",
  "input": ["text1", "text2", ...]
}
```

### 7.2 Embedding Pipeline

```
1. Recover stale "processing" chunks (> EMBED_STALE_RECOVERY_MINUTES)
2. Claim pending chunks (SELECT FOR UPDATE SKIP LOCKED)
   └── Status: pending → processing
3. Sanitize inputs (whitespace normalize, truncate 8000 chars)
4. Split into batches (OPENAI_EMBED_MAX_INPUTS per request)
5. Per batch: call OpenAI API
6. Validate: embedding.length === EMBEDDING_DIM
7. Mark ready rows (embedding → vector, status → ready)
8. Mark failed rows (status → failed)
9. On total failure: revert all to pending
```

### 7.3 Vector Search (searchChunks)

```sql
BEGIN;
  SET LOCAL ivfflat.probes = {SEARCH_IVFFLAT_PROBES};
  SET LOCAL hnsw.ef_search = {SEARCH_HNSW_EF_SEARCH};

  SELECT id, text, (embedding <-> $1::vector) AS distance
  FROM rag_chunks
  WHERE embedding_status = 'ready'
    AND project_id = $2
  ORDER BY embedding <-> $1::vector
  LIMIT $3;
COMMIT;
```

### 7.4 Chunk Status Machine

```
   ┌─────────┐       claim        ┌────────────┐
   │ pending  ├──────────────────►│ processing  │
   └────┬─────┘                   └──────┬──────┘
        │                                │
   recover stale                    ┌────┴────┐
   (> 30 min)                       │         │
        │                      success    fail
        └────────────────┐         │         │
                         │    ┌────▼──┐  ┌───▼────┐
                         │    │ ready │  │ failed │
                         │    └───────┘  └────────┘
                         │                    │
                         └────────────────────┘
                              on text change:
                              reset → pending
```

### 7.5 Environment Variables

| Variable | Default | Описание |
|----------|---------|----------|
| `OPENAI_API_KEY` | (required) | API ключ OpenAI |
| `EMBEDDING_MODEL` | text-embedding-3-small | Модель |
| `EMBEDDING_DIM` | 1536 | Ожидаемая размерность вектора |
| `OPENAI_EMBED_MAX_INPUTS` | 100 | Макс. текстов на запрос |
| `OPENAI_TIMEOUT_MS` | 20000 | Таймаут API-запроса |
| `EMBED_BATCH_SIZE` | 100 | Макс. чанков за один run |
| `EMBED_STALE_RECOVERY_MINUTES` | 30 | Recovery для зависших чанков |
| `SEARCH_IVFFLAT_PROBES` | 10 | IVFFlat probes для поиска |
| `SEARCH_HNSW_EF_SEARCH` | 40 | HNSW ef_search для поиска |

---

## 8) Loops — Email Marketing

**Файл:** `apps/api/src/domains/outbound/loops.js`
**Протокол:** REST API v1
**Auth:** Header `authorization: Bearer {api_key}`
**Base URL:** `https://app.loops.so/api/v1`

### 8.1 API Endpoints

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/contacts/create` | POST | Создать контакт |
| `/contacts/update` | POST | Обновить контакт |

### 8.2 Sync Flow

```
1. Check LOOPS_SECRET_KEY (if missing → return disabled)
2. Resolve project IDs for account scope
3. Query cw_contacts с email → group by email
4. Per contact: upsert → Loops
   ├── Try create first
   ├── If duplicate → update
   └── On error → add to errors list (max 20)
5. Audit event per project
```

### 8.3 Contact Payload

```json
{
  "email": "user@example.com",
  "firstName": "Contact Name",
  "source": "labpics-dashboard",
  "projectIds": ["uuid1", "uuid2"],
  "projectNames": ["Project A", "Project B"]
}
```

### 8.4 Environment Variables

| Variable | Default | Описание |
|----------|---------|----------|
| `LOOPS_SECRET_KEY` | (optional) | API ключ Loops |
| `LOOPS_API_BASE_URL` | `https://app.loops.so/api/v1` | Base URL |

---

## 9) Outbox — исходящие сообщения

**Файл:** `apps/api/src/domains/outbound/outbox.js`
**Каналы:** `email`, `chatwoot`, `telegram`

### 9.1 Lifecycle

```
┌───────┐     approve     ┌──────────┐     send      ┌──────┐
│ draft ├────────────────►│ approved ├──────────────►│ sent │
└───┬───┘                 └─────┬────┘               └──────┘
    │                           │
    │                      ┌────▼────┐
    │                      │ failed  │──► retry (backoff)
    │                      └────┬────┘
    │                           │ max retries
    │                      ┌────▼────────────┐
    │                      │ blocked_opt_out  │
    │                      │ cancelled        │
    │                      └─────────────────┘
```

### 9.2 Policy Enforcement

Перед отправкой проверяется `contact_channel_policies`:

1. **Opt-out:** Если `opted_out = true` → `blocked_opt_out`
2. **Stop-on-reply:** Если `stop_on_reply` и `last_inbound_at > approved_at` → `cancelled`
3. **Frequency cap:** Если `sent_in_window >= frequency_cap` → `failed` (retry через 1 час)
4. **Window reset:** Если окно истекло, сбрасывается `sent_in_window = 1`

### 9.3 Retry Strategy

- **Max retries:** задаётся per-message (default 5, max 20)
- **Backoff:** `retry_count × 2 минуты`
- **Processing:** `processDueOutbounds` — забирает approved/failed с `next_attempt_at <= now()`

### 9.4 Deduplication

- `idempotency_key` — уникальный per project (ON CONFLICT → update payload)
- `dedupe_key` — SHA256 от `{projectId, channel, recipientRef, payload}`

### 9.5 Audit Trail

Каждое действие с outbound записывается в `audit_events`:
- `outbound.draft`, `outbound.approve`, `outbound.send`
- `outbound.opt_out`, `outbound.opt_out_block`

---

## 10) Composio / MCP — AI Tool Bridge

**Файл:** `apps/api/src/connectors/index.ts`

### 10.1 Архитектура

```
┌──────────────────────┐
│  connector-sync.js   │
│  createConnector()   │
├──────────┬───────────┤
│ HTTP mode│ MCP mode  │
│ httpRunner│ mcpRunner │
└────┬─────┴─────┬─────┘
     │           │
     ▼           ▼
  Direct     Composio
  API call   MCP bridge
```

### 10.2 createConnector API

```javascript
createConnector({
  name: "chatwoot",       // Имя коннектора
  mode: "http",           // "http" | "mcp"
  httpRunner: async () => runChatwootSync(pool, scope, logger),
  mcpRunner: createComposioMcpRunner({
    connector: "chatwoot",
    invoke: process.env.COMPOSIO_MCP_INVOKER ? runMcpConnector : null,
  }),
})
```

### 10.3 MCP Contract

```javascript
// invoke({ connector, operation: "sync", context })
// Returns: sync result matching HTTP runner format
```

### 10.4 Current Status

- MCP режим подготовлен архитектурно, но функционально отключен
- `runMcpConnector` → throws `${connector}_mcp_not_configured`
- Активируется через `COMPOSIO_MCP_INVOKER` env var

### 10.5 Environment Variables

| Variable | Default | Описание |
|----------|---------|----------|
| `CONNECTOR_MODE` | http | Глобальный режим (http/mcp) |
| `CONNECTOR_CHATWOOT_MODE` | — | Per-connector override |
| `CONNECTOR_LINEAR_MODE` | — | Per-connector override |
| `CONNECTOR_ATTIO_MODE` | — | Per-connector override |
| `COMPOSIO_MCP_INVOKER` | — | Включает MCP bridge |

---

## 11) Recommendation Actions — автоматизация

**Файл:** `apps/api/src/domains/identity/recommendation-actions.js`

### 11.1 Action Types

| Action | Описание | Результат |
|--------|----------|-----------|
| `create_or_update_task` | Создать задачу в Linear (local) | Запись в `linear_issues_raw` |
| `send_message` | Отправить сообщение через Outbox | draft → approve → send |
| `set_reminder` | Создать напоминание | Запись в `scheduled_jobs` |

### 11.2 Action Lifecycle

```
upsert ActionRun (dedupe)
     │
     ▼ (если не succeeded)
  set running
     │
     ├── create_or_update_task → linear_issues_raw upsert
     │
     ├── send_message → resolveRecipient → outbox pipeline
     │   └── evidence_refs → find contact → draft → approve → send
     │
     └── set_reminder → scheduled_jobs upsert
     │
     ▼
  succeeded / failed (with retry backoff)
```

### 11.3 Recipient Resolution (send_message)

1. Explicit `recipient_ref` из `action_payload`
2. `evidence_refs` → ищет `contact_global_id` по `cw_messages`
3. Fallback → самый свежий `cw_contacts` для проекта

### 11.4 Correlation & Deduplication

- `dedupe_key` — SHA1 от `{recommendationId}:{actionType}:{payload}`
- `correlation_id` — `rec.{recId}.{actionType}.{dedupePrefix}`
- ON CONFLICT (project_id, dedupe_key) → idempotent
- Succeeded actions → не перезапускаются

### 11.5 Retry

- Max retries: per-action (default 3, max 10)
- Backoff: `2^min(7, attempts)` минут, cap 120 минут
- Failed + exhausted → финальное состояние

---

## 12) Connector Orchestration

**Файл:** `apps/api/src/domains/connectors/connector-sync.js`

### 12.1 Полный цикл sync

```
runAllConnectorsSync()
  │
  ├─► startProcessRun("connectors_sync_cycle")
  │
  ├─► For each [chatwoot, linear, attio]:
  │     │
  │     ├── getConnectorSyncState()
  │     ├── markConnectorSyncRunning()
  │     ├── startProcessRun("sync_{connector}")
  │     │
  │     ├── createConnector() → connectorRunner.pull()
  │     │   ├── HTTP: runChatwootSync / runLinearSync / runAttioSync
  │     │   └── MCP: composioMcpRunner (if configured)
  │     │
  │     ├── syncConnectorEventLog()
  │     ├── markConnectorSyncSuccess()
  │     ├── resolveConnectorErrors()
  │     └── finishProcessRun()
  │
  ├─► runSyncReconciliation()
  │   ├── Chatwoot metrics (contacts, conversations, messages)
  │   ├── Linear metrics (issues, states)
  │   ├── Attio metrics (accounts, opportunities)
  │   └── CRM coverage metrics
  │
  ├─► Check completeness vs CONNECTOR_RECONCILIATION_MIN_COMPLETENESS_PCT (95%)
  │
  └─► finishProcessRun("connectors_sync_cycle")
```

### 12.2 Error Recovery

```
retryConnectorErrors()
  │
  ├── listDueConnectorErrors(limit=20)
  │   └── WHERE status IN ('pending','retrying') AND next_retry_at <= now()
  │
  └── For each error:
      ├── runConnectorSync(connector)
      │   ├── Success → resolveConnectorErrorById()
      │   └── Failure → registerConnectorError() (attempt++)
      │
      └── If attempt >= CONNECTOR_MAX_RETRIES → dead_letter
```

### 12.3 Environment Variables

| Variable | Default | Описание |
|----------|---------|----------|
| `CONNECTOR_MAX_RETRIES` | 5 | Макс. попыток DLQ |
| `CONNECTOR_RETRY_BASE_SECONDS` | 30 | Базовый backoff |
| `CONNECTOR_RECONCILIATION_MIN_COMPLETENESS_PCT` | 95 | Порог completeness |

---

## 13) Reconciliation — сверка данных

**Файл:** `apps/api/src/domains/connectors/reconciliation.js`

### Что проверяется

| Коннектор | Метрики |
|-----------|---------|
| Chatwoot | contacts_total, conversations_total, messages_total, messages_without_contact, duplicate_contacts_by_email |
| Linear | issues_total, issues_without_state, states_total |
| Attio | accounts_total, opportunities_total, opportunities_without_account, people_total |
| CRM | accounts_mirrored, opportunities_mirrored, coverage gaps |

**Completeness:** Среднее по всем метрикам: `(ok / total) × 100`

---

## 14) Полный реестр Environment Variables

### Обязательные (без них sync не работает)

| Variable | Используется в |
|----------|---------------|
| `CHATWOOT_BASE_URL` | chatwoot.js |
| `CHATWOOT_API_TOKEN` | chatwoot.js |
| `OPENAI_API_KEY` | openai.js |

### Обязательные (если не mock)

| Variable | Используется в |
|----------|---------------|
| `LINEAR_API_TOKEN` | linear.js |
| `ATTIO_API_TOKEN` | attio.js |

### Опциональные

| Variable | Default | Компонент |
|----------|---------|-----------|
| `CHATWOOT_ACCOUNT_ID` | (bootstrap) | chatwoot.js |
| `CHATWOOT_CONVERSATIONS_LIMIT` | 60 | chatwoot.js |
| `CHATWOOT_MESSAGES_LIMIT` | 300 | chatwoot.js |
| `CHATWOOT_LOOKBACK_DAYS` | 7 | chatwoot.js |
| `CHATWOOT_CONVERSATIONS_PER_PAGE` | 25 | chatwoot.js |
| `CHATWOOT_PAGES_LIMIT` | 20 | chatwoot.js |
| `LINEAR_BASE_URL` | api.linear.app/graphql | linear.js |
| `LINEAR_WORKSPACE_ID` | auto-{projectId} | linear.js |
| `LINEAR_MOCK_MODE` | false | linear.js |
| `LINEAR_SYNC_LIMIT` | 200 | linear.js |
| `LINEAR_SYNC_MAX_PAGES` | 100 | linear.js |
| `ATTIO_BASE_URL` | api.attio.com | attio.js |
| `ATTIO_WORKSPACE_ID` | auto-{projectId} | attio.js |
| `ATTIO_MOCK_MODE` | false | attio.js |
| `ATTIO_SYNC_LIMIT` | 200 | attio.js |
| `ATTIO_SYNC_MAX_PAGES` | 50 | attio.js |
| `EMBEDDING_MODEL` | text-embedding-3-small | openai.js |
| `EMBEDDING_DIM` | 1536 | openai.js |
| `OPENAI_EMBED_MAX_INPUTS` | 100 | openai.js |
| `OPENAI_TIMEOUT_MS` | 20000 | openai.js |
| `EMBED_BATCH_SIZE` | 100 | embeddings.js |
| `EMBED_STALE_RECOVERY_MINUTES` | 30 | embeddings.js |
| `SEARCH_IVFFLAT_PROBES` | 10 | embeddings.js |
| `SEARCH_HNSW_EF_SEARCH` | 40 | embeddings.js |
| `CHUNK_SIZE` | 1000 | chatwoot.js |
| `MIN_EMBED_CHARS` | 30 | chatwoot.js |
| `STORAGE_BUDGET_GB` | 20 | chatwoot.js |
| `STORAGE_ALERT_THRESHOLD_PCT` | 85 | chatwoot.js |
| `LOOPS_SECRET_KEY` | — | loops.js |
| `LOOPS_API_BASE_URL` | app.loops.so/api/v1 | loops.js |
| `CONNECTOR_MODE` | http | connector-sync.js |
| `CONNECTOR_CHATWOOT_MODE` | — | connector-sync.js |
| `CONNECTOR_LINEAR_MODE` | — | connector-sync.js |
| `CONNECTOR_ATTIO_MODE` | — | connector-sync.js |
| `CONNECTOR_MAX_RETRIES` | 5 | connector-state.js |
| `CONNECTOR_RETRY_BASE_SECONDS` | 30 | connector-state.js |
| `CONNECTOR_RECONCILIATION_MIN_COMPLETENESS_PCT` | 95 | connector-sync.js |
| `COMPOSIO_MCP_INVOKER` | — | connector-sync.js |
| `PG_POOL_MAX` | 25 | db.js |
| `PG_STATEMENT_TIMEOUT_MS` | 30000 | db.js |
| `PG_APP_NAME` | labpics-dashboard | db.js |

---

## 15) Смежные документы

- **Архитектура:** [`docs/architecture.md`](./architecture.md)
- **Модель данных:** [`docs/data-model.md`](./data-model.md)
- **Backend Services:** [`docs/backend-services.md`](./backend-services.md)
- **Pipelines:** [`docs/pipelines.md`](./pipelines.md)
