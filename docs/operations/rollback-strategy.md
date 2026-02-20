# Rollback Strategy

## Docker Compose (текущий deployment)

### Быстрый откат на предыдущую версию

```bash
# 1. Остановить текущий стек
docker compose down

# 2. Вернуться на предыдущий коммит
git log --oneline -5           # найти нужный SHA
git checkout <commit-sha>

# 3. Пересобрать и запустить
docker compose up -d --build --wait
```

### Откат конкретного сервиса

```bash
# Пересобрать и перезапустить только server
docker compose up -d --build --no-deps server

# Только web
docker compose up -d --build --no-deps web
```

## База данных

### Перед deploy: бэкап

```bash
# pg_dump через Docker
docker compose exec db pg_dump -U app labpics > backup_$(date +%Y%m%d_%H%M%S).sql

# Или через volume mount
docker compose exec db pg_dump -U app -Fc labpics > /backups/labpics_$(date +%Y%m%d).dump
```

### Откат миграции

Миграции в `apps/api/db/migrations/` идемпотентны (CREATE IF NOT EXISTS, ALTER IF NOT EXISTS).
Для отката деструктивных миграций:

1. Создать reverse-миграцию в `apps/api/db/migrations/` с следующим порядковым номером
2. Применить: `docker compose exec server npm run migrate -w apps/api`

### Важно

- **Никогда** не удалять колонки/таблицы в той же миграции, что и deploy
- Сначала deploy нового кода, затем (через 1+ итерацию) чистка unused колонок
- `pg_dump` перед каждым deploy с деструктивными миграциями

## Redis

Redis используется как кеш + pub/sub. Потеря данных Redis не критична — при рестарте кеш прогреется автоматически.

```bash
# Перезапустить Redis
docker compose restart redis
```

## Мониторинг после rollback

```bash
# Проверить health
curl -sf http://localhost:8080/health

# Проверить метрики
curl -sf http://localhost:8080/v1/metrics

# Логи
docker compose logs --tail 50 server
docker compose logs --tail 50 web
```
