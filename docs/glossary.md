# Glossary (LightRAG)

## Scope и безопасность

**Project (`project_id`)** — базовая единица изоляции данных.  
**Account scope (`account_scope_id`)** — портфельная граница для группы проектов.  
**Active project** — выбранный проект в session context.  
**CSRF token** — обязательный токен для mutating API-запросов.  
**request_id** — идентификатор трассировки запроса.

## Интеграции и ingest

**Connector** — адаптер к внешней системе (Chatwoot/Linear/Attio).  
**Incremental sync** — загрузка только изменившихся данных.  
**connector_sync_state** — текущее состояние синка и курсоры.  
**connector_errors** — retry/DLQ очередь ошибок.  
**Backoff** — рост интервала между ретраями.  
**Idempotent upsert** — повторяемая запись без дубликатов.

## LightRAG

**LightRAG** — единый retrieval-контур продукта (без активного KAG-контура).  
**rag_chunks** — текстовые фрагменты с embeddings.  
**Embedding status** — `pending|processing|ready|failed`.  
**Evidence** — факт из source-данных, который объясняет ответ.  
**lightrag_query_runs** — журнал LightRAG запросов (query/hits/evidence/answer).

## Reliability и observability

**sync_reconciliation_metrics** — метрики полноты и дублей между источниками.  
**scheduled_jobs / worker_runs** — план и фактическое выполнение фоновых задач.  
**audit_events** — журнал критичных действий и изменений.

## Frontend / Design

**Control Tower** — основной workspace с 6 бизнес-секциями.  
**Page shell** — каркас: nav rail + project sidebar + контент.  
**shadcn/ui tokens** — единые визуальные токены и компоненты.  
**anime.js motion** — системные анимации с поддержкой reduced motion.

## Legacy термины

**KAG** — legacy-контур в кодовой базе; в `LIGHTRAG_ONLY=1` не используется в активном продукте.  
**/kag/* routes** — возвращают `410 kag_disabled` в целевом режиме.
