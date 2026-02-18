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

## Следующая итерация (план)

1. Материализованные представления для тяжёлых dashboard-агрегатов.
2. Quality score для LightRAG-ответов (precision/coverage proxy).
3. Алертинг по `sync_reconciliation_metrics` в CI/ops.
4. Единый diff-репорт по изменению полноты данных между sync-циклами.
