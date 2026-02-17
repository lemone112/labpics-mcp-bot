# Обзор продукта Labpics Dashboard

Labpics Dashboard — это операционная платформа для PM/Owner, которая объединяет:

1. **коммуникации** (Chatwoot),
2. **delivery-сигналы** (Linear),
3. **коммерческие данные** (Attio/CRM),
4. **RAG + KAG интеллект** (поиск, сигналы, прогнозы, рекомендации).

Ключевая цель: дать PM не просто «ответ», а **объяснимое действие** с ссылками на факты.

---

## 1) Для кого продукт

- PM студии, ведущий несколько проектов;
- Head of Delivery / Operations;
- Owner/Founder, которому нужен portfolio-level обзор рисков и ценности.

---

## 2) Базовая ценность (user outcome)

Ожидаемый быстрый цикл:

**Войти -> выбрать проект/портфель -> увидеть состояние и риски -> получить next-best-action -> выполнить действие с доказательствами.**

Что это даёт бизнесу:

- раннее обнаружение рисков по срокам/финансам/клиенту,
- прозрачная трассировка «почему система это рекомендует»,
- снижение ручного time-to-context через единый control tower.

---

## 3) Продуктовые контуры

## 3.1 Data ingestion

- Коннекторы Chatwoot / Linear / Attio работают инкрементально.
- Есть retry/backoff + dead-letter (`connector_errors`) без падения всего пайплайна.
- Для каждой синхронизации пишется процессный и доменный лог в `kag_event_log`.

Назначение: надёжно и дёшево поддерживать актуальные данные без full-resync.

## 3.2 RAG контур

- `rag_chunks` + embeddings (pgvector),
- проектно-ограниченный semantic search (`/search`),
- выдача с evidence-ссылками.

Назначение: быстро восстановить контекст из сообщений и документов.

## 3.3 KAG контур v1/v2

- KAG v1: graph/signals/scores/recommendations.
- KAG v2: event log -> snapshots -> similarity -> forecasting -> recommendations lifecycle.
- Жёсткое evidence gating: без доказательств нет primary-публикации.

Назначение: принимать операционные решения на основе детерминированной логики и проверяемых источников.

## 3.4 Control Tower и CRM surfaces

- Portfolio cockpit с dual-sidebar и 6 разделами (`dashboard/messages/agreements/risks/finance/offers`),
- CRM, Offers, Digests, Analytics, Jobs, Search.

Назначение: единый рабочий интерфейс для ежедневного управления проектами и выручкой.

---

## 4) Ключевые пользовательские сценарии

1. **Delivery risk**: рост блокеров + просрочка этапа -> риск в дашборде -> рекомендация по эскалации.
2. **Client silence**: пауза клиента в переписке -> client risk forecast 7/14/30 -> follow-up action.
3. **Scope creep**: повторные вне-scope запросы -> CR recommendation с шаблоном.
4. **Finance pressure**: burn rate > план -> finance recommendation с пересчётом маржи.
5. **Upsell signal**: выявленная потребность из коммуникаций -> upsell recommendation + коммерческий шаблон.

---

## 5) Продуктовые гарантии качества

- strict scope (`project_id`, `account_scope_id`) на API и БД;
- идемпотентные фоны/ретраи;
- детерминированный decision engine (LLM не принимает бизнес-решение);
- explainability через `evidence_refs` и source trace;
- операционная наблюдаемость через `kag_event_log`, `worker_runs`, `job_runs`.

---

## 6) Что НЕ является целью продукта

- полностью автономный autopilot без подтверждений человека;
- непрозрачные («black-box») рекомендации без источников;
- cross-project доступ без scope-контроля;
- дорогие LLM-вычисления там, где можно использовать deterministic rules.

---

## 7) Связанные документы

- Архитектура: [`docs/architecture.md`](../architecture.md)
- Модель данных: [`docs/data-model.md`](../data-model.md)
- Frontend и дизайн: [`docs/frontend-design.md`](../frontend-design.md)
- KAG forecasting/recommendations: [`docs/kag_forecasting_recommendations.md`](../kag_forecasting_recommendations.md)
- Roadmap: [`docs/mvp-vs-roadmap.md`](../mvp-vs-roadmap.md)
