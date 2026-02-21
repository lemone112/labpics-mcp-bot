# Playbook: переход `owner_username` -> `owner_user_id`

## Цель

Перевести CRM-владельцев на ссылочную модель (`owner_user_id -> app_users.id`) без разрыва API-контракта на переходном этапе.

## Область изменений

- Миграция: `apps/api/db/migrations/0038_owner_user_fk_migration.sql`
- Таблицы:
  - `crm_accounts`
  - `crm_opportunities`
  - `owner_backfill_errors` (новая)
- Функции/триггеры:
  - `run_owner_backfill()`
  - `sync_owner_reference_fields()`
  - `log_unresolved_owner_reference()`

## Предварительные проверки

```sql
-- Объём legacy-данных
SELECT count(*) AS total_accounts_with_owner
FROM crm_accounts
WHERE owner_username IS NOT NULL AND btrim(owner_username) <> '';

SELECT count(*) AS total_opportunities_with_owner
FROM crm_opportunities
WHERE owner_username IS NOT NULL AND btrim(owner_username) <> '';
```

## Шаги rollout

1. Применить миграции.
2. Проверить, что initial backfill выполнился:

```sql
SELECT run_owner_backfill();
```

3. Проверить покрытие backfill:

```sql
WITH s AS (
  SELECT
    count(*) FILTER (WHERE owner_username IS NOT NULL AND btrim(owner_username) <> '') AS total_legacy,
    count(*) FILTER (WHERE owner_user_id IS NOT NULL) AS resolved_fk
  FROM crm_accounts
)
SELECT
  total_legacy,
  resolved_fk,
  CASE
    WHEN total_legacy = 0 THEN 100
    ELSE round((resolved_fk::numeric / total_legacy::numeric) * 100, 2)
  END AS resolved_pct
FROM s;
```

Повторить ту же проверку для `crm_opportunities`.

4. Проверить unresolved-остаток:

```sql
SELECT entity_type, reason, count(*)::int AS cnt
FROM owner_backfill_errors
GROUP BY entity_type, reason
ORDER BY entity_type, reason;
```

## SLO перехода

- Целевое покрытие backfill: **>= 99%**.
- Остаток должен быть прозрачен через `owner_backfill_errors`.

## Совместимость API

- Write-path принимает и `owner_user_id`, и legacy `owner_username`.
- Read-path возвращает `owner_username` (через `COALESCE(app_users.username, legacy owner_username)`), плюс `owner_user_id`.

## Rollback

Немедленный rollback кода:

```bash
git checkout <stable-commit-before-owner-migration>
docker compose up -d --build --no-deps server
```

DB rollback (без дропа данных):

1. Отключить новые write-path требования в приложении (возврат к legacy коду).
2. Оставить `owner_user_id` и `owner_backfill_errors` как неиспользуемые поля/таблицы.
3. При необходимости временно отключить sync/log triggers:

```sql
ALTER TABLE crm_accounts DISABLE TRIGGER crm_accounts_owner_sync_guard;
ALTER TABLE crm_accounts DISABLE TRIGGER crm_accounts_owner_log_guard;
ALTER TABLE crm_opportunities DISABLE TRIGGER crm_opportunities_owner_sync_guard;
ALTER TABLE crm_opportunities DISABLE TRIGGER crm_opportunities_owner_log_guard;
```

Важно: деструктивное удаление колонок и таблиц выполнять только отдельной отложенной миграцией после стабилизации.
