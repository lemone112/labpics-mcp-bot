# Статус продукта и roadmap

Документ фиксирует, что уже реализовано в продукте, и что идёт следующими фазами.

---

## 1) Текущий статус (что уже есть)

## 1.1 Платформа и безопасность

- авторизация и session-контур;
- strict scope по `project_id`/`account_scope_id`;
- CSRF/request-id, audit/evidence базовый контур;
- scheduler/worker для фоновых автоматизаций.

## 1.2 Интеграции и ingestion

- инкрементальные sync для Chatwoot/Linear/Attio;
- расширенные raw-таблицы (messages, inboxes, attachments, states/cycles, people/activities);
- `connector_sync_state` + `connector_errors` (retry/backoff/DLQ);
- process/domain logging в `kag_event_log`.

## 1.3 RAG + KAG intelligence

- RAG поиск по `rag_chunks` + embeddings;
- KAG v1 (signals/scores/recommendations);
- KAG v2 (snapshots/outcomes/similarity/forecasting/recommendations lifecycle);
- evidence gating для snapshots/forecasts/recommendations;
- feature flags для безопасного rollout.

## 1.4 Frontend и дизайн

- Next.js App Router + dual-sidebar shell;
- control tower на 6 секций;
- дизайн-система на shadcn/ui + Radix + Tailwind tokens;
- motion-слой на anime.js с tokenized durations/easing;
- страницы Jobs/Search/Signals/CRM/Offers/Digests/Analytics.

---

## 2) Near-term roadmap (следующие 2-3 итерации)

## Фаза R1 — Product hardening и наблюдаемость

Цель: довести reliability до production-grade стабильности.

Задачи:

1. SLA-метрики по connector lag/retry/dead-letter.
2. Расширение runbooks + алерты на рост `process_failed`.
3. UI-виджет состояния пайплайна (sync/snapshot/forecast/recommendations).
4. Контроль доли `publishable=false` и автоматический quality-report.

Критерий готовности:

- сбои интеграций локализуются без каскадных падений;
- доступна прозрачная health-картина по всем проектам.

## Фаза R2 — Productization KAG v2 в UI

Цель: сделать прогнозы и рекомендации рабочим ежедневным инструментом PM.

Задачи:

1. Полноценные экраны forecast/recommendations v2 (статусы, feedback, owner role, due-date).
2. Similar cases UX: top-3 похожих кейса + outcomes + эффективные интервенции.
3. Единый экран evidence trace (message/issue/deal/chunk linkage).
4. Сравнение рекомендаций в all-projects режиме по общей шкале приоритета.

Критерий готовности:

- PM может пройти полный цикл: сигнал -> прогноз -> рекомендация -> статус/feedback -> результат.

## Фаза R3 — Frontend UX и дизайн-операции

Цель: снизить когнитивную нагрузку и ускорить выполнение действий.

Задачи:

1. Формализовать UI state patterns (loading/empty/error) для всех critical pages.
2. Добавить visual regression baseline для ключевых экранов control tower.
3. Завершить унификацию русскоязычных текстов интерфейса.
4. Углубить accessibility (focus states, keyboard flows, contrast audits).

Критерий готовности:

- интерфейс стабилен визуально, предсказуем и доступен в основных сценариях.

---

## 3) Mid-term roadmap (4-6+ итераций)

## Фаза R4 — Decision quality и policy layer

Задачи:

1. Калибровка весов forecast-модели по фактическим outcomes.
2. Policy-конфигурация рекомендаций (по сегментам клиентов/типам проектов).
3. Explainability карточки с ranking drivers и confidence breakdown.

## Фаза R5 — Коммерческий и outbound контур

Задачи:

1. Замкнутый цикл offers -> outbound -> feedback -> conversion.
2. Интеграция delivery feedback из внешних систем обратно в KAG.
3. Нормализация discount/upsell policy как управляемой конфигурации.

## Фаза R6 — Enterprise-ready масштабирование

Задачи:

1. Расширенные роли/доступы (RBAC) без компромисса по scope.
2. Расширенные требования комплаенса и retention.
3. Performance optimization для больших account scope (много проектов/событий).

---

## 4) Что считаем “не входит в roadmap ближайших фаз”

- Полный autonomous агент без human confirmation.
- Непрозрачные рекомендации без evidence и explainability.
- Дорогие LLM-first вычисления там, где deterministic rules дают достаточное качество.

---

## 5) Связанные документы

- Product overview: [`docs/product/overview.md`](./product/overview.md)
- Frontend/design: [`docs/frontend-design.md`](./frontend-design.md)
- Архитектура: [`docs/architecture.md`](./architecture.md)
- Data model: [`docs/data-model.md`](./data-model.md)
