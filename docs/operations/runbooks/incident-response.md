# Incident Response Runbook

> Last updated: 2026-02-18

## Quick Reference

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Liveness check (no auth) |
| `GET /metrics` | Prometheus metrics (no auth) |
| `GET /v1/connectors/sync-state` | Connector sync status |
| `GET /v1/audit/events` | Audit trail |

---

## 1. High Error Rate (>5%)

**Alert:** `HighErrorRate` / `High5xxRate`

**Diagnosis:**
```bash
# Check metrics for status breakdown
curl -s http://server:8080/metrics | grep app_response_status_total

# Check recent server logs
docker compose logs server --tail 200 --since 5m

# Check DB pool — if waiting > 0, pool may be exhausted
curl -s http://server:8080/metrics | grep app_db_pool
```

**Resolution:**
- If `app_db_pool_waiting > 0`: Long-running queries are holding connections
  - Check active queries: `SELECT pid, now() - pg_stat_activity.query_start AS duration, query FROM pg_stat_activity WHERE state != 'idle' ORDER BY duration DESC LIMIT 10;`
  - Kill long queries if needed: `SELECT pg_cancel_backend(<pid>);`
  - Increase pool: `PG_POOL_MAX=35` (default 25)
- If 5xx from specific routes: check server logs for stack traces
- If Redis errors: check Redis connectivity (`docker compose exec redis redis-cli PING`)

---

## 2. Circuit Breaker Open

**Alert:** `CircuitBreakerOpen`

**Diagnosis:**
```bash
# Check which external host is failing
curl -s http://server:8080/metrics | grep app_circuit_breaker

# Check connector sync state
curl -s -H "Cookie: sid=<session>" http://server:8080/v1/connectors/sync-state
```

**Resolution:**
- Circuit breaker auto-recovers after 30s probe (half-open state)
- If persistent: external API is down — check status pages:
  - Chatwoot: check your instance status
  - Linear: https://status.linear.app
  - Attio: https://status.attio.com
- Manual retry: `POST /v1/connectors/:name/sync`
- If breaker keeps tripping: increase failure threshold or reset timeout via env vars

---

## 3. DB Pool Exhaustion

**Alert:** `DbPoolExhausted` / `DbPoolHighUsage`

**Diagnosis:**
```bash
# Current pool state
curl -s http://server:8080/metrics | grep app_db_pool

# Active queries in PostgreSQL
docker compose exec db psql -U app -d labpics -c "
SELECT pid, state, now() - query_start AS duration, left(query, 80)
FROM pg_stat_activity
WHERE datname = 'labpics' AND state != 'idle'
ORDER BY duration DESC;"
```

**Resolution:**
1. Kill idle-in-transaction connections: `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle in transaction' AND now() - state_change > interval '5 minutes';`
2. Increase pool size: set `PG_POOL_MAX=35` and restart server
3. Check if materialized view refresh is blocking: `SELECT * FROM pg_stat_activity WHERE query LIKE '%REFRESH%';`
4. Long-term: check slow query log, add missing indexes

---

## 4. Cache Disabled / Low Hit Rate

**Alert:** `CacheDisabled` / `CacheHitRateLow`

**Diagnosis:**
```bash
# Cache status
curl -s http://server:8080/metrics | grep app_cache

# Redis connectivity
docker compose exec redis redis-cli PING
docker compose exec redis redis-cli INFO memory | grep used_memory_human
docker compose exec redis redis-cli DBSIZE
```

**Resolution:**
- If cache disabled (Redis down):
  - Check Redis container: `docker compose ps redis`
  - Check Redis logs: `docker compose logs redis --tail 50`
  - Restart: `docker compose restart redis`
  - Server auto-reconnects — no restart needed
- If low hit rate:
  - Normal after restart (cold cache)
  - Check invalidation rate: high `app_cache_invalidations_total` rate means frequent syncs are clearing cache
  - Consider increasing TTL for stable datasets

---

## 5. Connector Sync Lag

**Diagnosis:**
```bash
# Check sync state for all connectors
docker compose exec db psql -U app -d labpics -c "
SELECT connector, status, last_success_at,
  extract(epoch FROM now() - last_success_at)::int AS lag_seconds,
  retry_count, last_error
FROM connector_sync_state
ORDER BY connector;"
```

**Resolution:**
- If `status = 'failed'`: check `last_error` for root cause
- If `retry_count > 0`: connector is auto-retrying
- Manual sync: `POST /v1/connectors/:name/sync`
- Full re-sync: `POST /v1/connectors/sync` (runs all three)
- Check dead letter queue: `GET /v1/connectors/errors`
- If lag > 1 hour: check scheduler is running (`docker compose logs worker --tail 100`)

---

## 6. High Memory Usage

**Alert:** `HighMemoryUsage`

**Diagnosis:**
```bash
# Process memory
curl -s http://server:8080/metrics | grep app_process

# Container memory
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}"
```

**Resolution:**
- Server limit is 512MB. If RSS > 450MB:
  - Check for memory leaks: is heap growing linearly?
  - Restart server: `docker compose restart server`
  - Check Redis cache size: `docker compose exec redis redis-cli INFO memory`
- Worker limit is 512MB:
  - Large sync batches can spike memory
  - Check worker logs for OOM warnings

---

## 7. Server Restart / Crash Loop

**Diagnosis:**
```bash
# Check container status
docker compose ps

# Check exit code
docker compose ps -a | grep server

# Recent logs before crash
docker compose logs server --tail 200
```

**Resolution:**
- If OOM kill: increase memory limit in docker-compose.yml
- If crash on startup: check migration errors (`docker compose logs server | grep -i error | head 20`)
- If dependency not ready: check `depends_on` health checks
- Restart cleanly: `docker compose up -d server`

---

## 8. Backup Failure

**Diagnosis:**
```bash
# Check latest backup
ls -la /backups/labpics_*.sql.gz | tail -5

# Verify backup integrity
./scripts/verify-backup.sh
```

**Resolution:**
- If no recent backup: run manually `./scripts/backup.sh`
- If backup is empty/corrupt: check disk space, DB connectivity
- If verify fails: check specific table errors in output
- Schedule backups via cron: `0 3 * * * /app/scripts/backup.sh >> /var/log/backup.log 2>&1`
