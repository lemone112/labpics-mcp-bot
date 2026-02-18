# Runbooks (эксплуатация, LightRAG-only)

## 1) Быстрый operational checklist

1. `GET /health` и `GET /metrics` отвечают.
2. Есть сессия и выбран активный проект.
3. `GET /jobs/scheduler` показывает рабочие jobs.
4. `GET /connectors/state` не содержит зависших `running`.
5. `GET /lightrag/status` показывает `ready` embeddings > 0 (для search-сценариев).

## 2) LightRAG возвращает пусто

Проверить:

- есть ли source-данные по проекту (`cw_messages`, `linear_issues_raw`, `attio_opportunities_raw`);
- есть ли `rag_chunks` и `embedding_status='ready'`;
- валиден ли `OPENAI_API_KEY`.

Действия:

1. `POST /jobs/chatwoot/sync` (и/или Linear/Attio sync)
2. `POST /jobs/embeddings/run`
3. `POST /lightrag/query`

## 3) Connector sync падает

Проверить:

- `GET /connectors/errors`
- `GET /connectors/state`
- токены `CHATWOOT_*`, `LINEAR_*`, `ATTIO_*`

Действия:

1. Исправить доступ/квоты.
2. `POST /connectors/:name/sync`.
3. `POST /connectors/errors/retry`.

## 4) Падение полноты данных между системами

Симптом: в одной системе сделки есть, в dashboard нет.

Проверить:

- `GET /connectors/reconciliation` (missing/duplicate/completeness).
- в raw-таблицах есть ли записи с нужным `external_id`.
- в CRM mirror корректно заполнены `source_system` и `external_ref`.

Действия:

1. Запустить `POST /connectors/reconciliation/run`.
2. Сделать targeted sync нужного коннектора.
3. Проверить dedupe конфликты (уникальные индексы по `external_ref`).

## 5) Ошибка `kag_disabled` (legacy route)

Это ожидаемо при `LIGHTRAG_ONLY=1`.  
Если ошибка пришла из UI — значит в клиенте остались legacy вызовы `/kag/*` и их нужно удалить.

## 6) Auth/CSRF проблемы

Проверить:

- session cookie существует;
- CSRF cookie соответствует `x-csrf-token`;
- `CORS_ORIGIN` совпадает с доменом UI.

## 7) Что мониторить постоянно

- `connector_errors` (рост, dead-letter).
- лаг по `connector_sync_state`.
- `sync_reconciliation_metrics` (completeness/missing/duplicates).
- долю `rag_chunks` в `failed`/`processing`.
- долю ошибок LightRAG query по `audit_events`.
