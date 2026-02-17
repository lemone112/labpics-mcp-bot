# KAG recommendations MVP for PM (project-centric)

Этот документ описывает минимальный рабочий KAG-слой поверх существующего RAG (Postgres + `rag_chunks`) для рекомендаций PM:

- health / risk / value / upsell
- Next Best Actions (NBA) с объяснениями
- evidence-first (без доказательств рекомендация не выдаётся)

---

## 1) План rollout по PR (3–4 PR)

1. **PR#1: data layer**
   - SQL миграция `0008_kag_recommendations_mvp.sql`.
   - Таблицы графа, provenance, signals, scores, recommendations, templates.
2. **PR#2: engine modules**
   - `/server/src/kag/{ingest,graph,signals,scoring,recommendations,templates}`.
   - Детерминированные сигналы/скоринг/правила.
3. **PR#3: runtime integration**
   - `/server/src/services/kag.js`, scheduler job `kag_recommendations_refresh`.
   - Feature flags: `KAG_ENABLED`, `RECOMMENDATIONS_ENABLED`.
4. **PR#4: docs + tests**
   - Этот документ + интеграционные сценарии на фиктивных данных.

---

## 2) Storage choice for MVP

### Выбран вариант **(a) KG в Postgres**

Почему:

1. **Минимальные изменения**: текущие данные (Chatwoot/Linear/Attio + RAG chunks) уже в Postgres.
2. **Быстрый запуск**: без отдельного кластера и DevOps overhead.
3. **Scope guard уже есть** (`project_id`, `account_scope_id`, trigger `enforce_project_scope_match`).
4. **Traceability проще**: прямые FK/ссылки на `rag_chunks`, `cw_messages`, `linear_issues_raw`, `attio_*`.

### OpenSPG (опция на следующий этап)

Рекомендуется для следующего шага (богатые онтологии, reasoning/semantic ops), но не для fastest MVP.

---

## 3) Graph schema (MVP)

### 3.1 Entities (node types)

Все сущности в `kag_nodes` (`node_type`), project-centric.

Общий минимум полей для **каждой** сущности:

- `id` (uuid в таблице)
- `project_id`
- `account_scope_id`
- `status`
- `created_at`, `updated_at`
- `numeric_fields` (jsonb: суммы, проценты, вероятность, длительность и т.д.)

Entity list:

1. `Project`
2. `Client`
3. `Person`
4. `Stage`
5. `Deliverable`
6. `Conversation`
7. `Message`
8. `Task`
9. `Blocker`
10. `Deal`
11. `FinanceEntry`
12. `Agreement`
13. `Decision`
14. `Risk`
15. `Offer`

### 3.2 Relations (edge types, project-centric)

Таблица `kag_edges`.

Ключевые связи:

- Project → Client / Stage / Deliverable / Task / Blocker / Deal / FinanceEntry / Agreement / Decision / Risk / Offer / Conversation
- Conversation → Message
- Message → Person (author)
- Task → Blocker
- Deliverable → Task
- Deal → Client
- Agreement → Deal
- Decision → Stage
- Risk → Deliverable
- Offer → Client

### 3.3 Events

Таблица `kag_events`.

MVP event types:

- `message_sent`
- `decision_made`
- `agreement_created`
- `approval_approved`
- `stage_started`
- `stage_completed`
- `task_created`
- `task_blocked`
- `blocker_resolved`
- `deal_updated`
- `finance_entry_created`
- `risk_detected`
- `scope_change_requested`
- `need_detected`
- `offer_created`

---

## 4) Mutual indexing (traceability)

Требование: каждый node/edge/event должен ссылаться на первоисточник и RAG chunks.

Реализация:

1. На каждом graph-объекте:
   - `source_refs` (jsonb): `message_id` / `linear_issue_id` / `attio_record_id` / `doc_url`
   - `rag_chunk_refs` (jsonb)
2. Отдельный обратный индекс:
   - `kag_provenance_refs` (`object_kind`, `object_id`, `source_kind`, source ids, `rag_chunk_id`)

Это позволяет:

- идти **от рекомендации к источнику**
- идти **от источника к связанным graph/signal/score/recommendation объектам**

---

## 5) Signals layer (10 сигналов, инкрементально)

Сигналы считаются в `/server/src/kag/signals/index.js`:

1. `WaitingOnClientDays`
2. `ResponseTimeAvg`
3. `BlockersAge`
4. `StageOverdue`
5. `AgreementOverdueCount`
6. `SentimentTrend`
7. `ScopeCreepRate`
8. `BudgetBurnRate`
9. `MarginRisk`
10. `ActivityDrop`

### Инкрементальное обновление

Состояние хранится в `kag_signal_state`:

- `last_event_id`
- `state_payload` (агрегаты, очереди, rolling windows)

Пайплайн:

1. Забираем `kag_events` с `id > last_event_id`
2. Применяем только новые события (event-driven update)
3. Обновляем `kag_signal_state`
4. Апсертим `kag_signals` + пишем `kag_signal_history`

---

## 6) Scoring (детерминированный MVP)

Считается в `/server/src/kag/scoring/index.js` (без LLM):

1. `ProjectHealthScore` (0..100)
2. `RiskScore` (0..100)
3. `ClientValueScore` (0..100)
4. `UpsellLikelihoodScore` (0..100)

### Формулы (MVP, rule-based)

- `ProjectHealthScore = 100 - weighted_risk_pressure`
- `RiskScore = weighted(risk_components)`
- `ClientValueScore = weighted(revenue, margin, engagement, sentiment, stability)`
- `UpsellLikelihoodScore = weighted(client_value, need_signal, commercial_stability)`

Где `risk_components` берутся из 10 сигналов через deterministic normalization.

### Пороги (MVP)

- Health: warning `<70`, critical `<50`
- Risk: warning `>60`, critical `>75`
- Client Value: medium `>60`, high `>75`
- Upsell: medium `>55`, high `>70`

---

## 7) Recommendation engine (5 категорий)

Реализовано в `/server/src/kag/recommendations/index.js`.

Категории:

1. `waiting_on_client` (follow-up)
2. `scope_creep_change_request` (CR)
3. `delivery_risk` (rescope/escalate)
4. `finance_risk` (margin/burn review)
5. `upsell_opportunity` (offer)

Для каждой рекомендации:

- `priority` (1..5)
- `rationale`
- `evidence_refs` (обязательно)
- `suggested_template_key`
- `suggested_template`

**Жёсткое правило:** если evidence пустой — рекомендация отбрасывается.

---

## 8) LLM usage boundaries

LLM используется **только** для:

1. извлечения структурированных сущностей из сообщений (`Agreement`, `Decision`, `Risk`) — ingest module;
2. генерации/вариации шаблонов коммуникации — templates module.

LLM **не** используется для:

- вычисления сигналов;
- скоринга;
- принятия rule-based решения о рекомендации.

---

## 9) Incremental migration strategy

KAG идёт параллельно существующему RAG:

- RAG pipeline не меняется
- текущие API не ломаются
- добавлены отдельные KAG-роуты:
  - `POST /kag/refresh`
  - `GET /kag/signals`
  - `GET /kag/scores`
  - `GET /kag/recommendations`

Feature flags:

- `KAG_ENABLED` — включает KAG-пайплайн
- `RECOMMENDATIONS_ENABLED` — включает генерацию NBA

При выключенных флагах сервис возвращает `skipped` и не влияет на текущие контуры.

---

## 10) Обязательные сценарии (MVP examples)

1. **Клиент молчит 4 дня, этап на аппруве**
   - сигналы: `waiting_on_client_days`, `stage_overdue/approval_pending`
   - рекомендация: `waiting_on_client`, priority 5, follow-up template

2. **2 запроса вне scope за неделю**
   - сигнал: `scope_creep_rate`
   - рекомендация: `scope_creep_change_request`, CR template

3. **Blockers в Linear >3 и старше 5 дней**
   - сигналы: `blockers_age`, `stage_overdue` (опционально)
   - рекомендация: `delivery_risk` (перепланировать/эскалировать)

4. **Burn rate > план на 20%**
   - сигнал: `budget_burn_rate > 1.2`
   - рекомендация: `finance_risk` (пересчитать маржу, sync с клиентом)

5. **Есть сигнал потребности из переписки**
   - event: `need_detected`
   - score: `upsell_likelihood` высокий
   - рекомендация: `upsell_opportunity` + оффер-template

---

## 11) Tables added in MVP

- `kag_nodes`
- `kag_edges`
- `kag_events`
- `kag_provenance_refs`
- `kag_signal_state`
- `kag_signals`
- `kag_signal_history`
- `kag_scores`
- `kag_score_history`
- `kag_recommendations`
- `kag_templates`

Все таблицы под `project_id/account_scope_id` и защищены scope-guard trigger.
