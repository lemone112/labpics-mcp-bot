#!/usr/bin/env bash
# Backup verification script for labpics-dashboard
# Restores the latest backup to a temporary database and runs validation queries.
#
# Usage: ./scripts/verify-backup.sh
# Env vars:
#   POSTGRES_USER   (default: app)
#   DB_HOST         (default: db)
#   BACKUP_DIR      (default: /backups)
set -euo pipefail

POSTGRES_USER="${POSTGRES_USER:-app}"
DB_HOST="${DB_HOST:-db}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
VERIFY_DB="labpics_verify_$(date +%s)"

log() { echo "{\"type\":\"$1\",\"msg\":\"$2\",\"at\":\"$(date -Iseconds)\"}"; }

# Find latest backup
LATEST=$(find "$BACKUP_DIR" -name "labpics_*.sql.gz" -type f 2>/dev/null | sort -r | head -1)
if [ -z "$LATEST" ]; then
  log "verify_error" "No backup files found in $BACKUP_DIR"
  exit 1
fi

log "verify_start" "Verifying backup: $LATEST"

# Create temporary database
createdb -h "$DB_HOST" -U "$POSTGRES_USER" "$VERIFY_DB" 2>/dev/null || {
  log "verify_error" "Failed to create temporary database $VERIFY_DB"
  exit 1
}

cleanup() {
  dropdb -h "$DB_HOST" -U "$POSTGRES_USER" --if-exists "$VERIFY_DB" 2>/dev/null || true
}
trap cleanup EXIT

# Restore backup
gunzip -c "$LATEST" | psql -h "$DB_HOST" -U "$POSTGRES_USER" -d "$VERIFY_DB" -q 2>/dev/null

# Validation queries
ERRORS=0
check_table() {
  local table="$1"
  local count
  count=$(psql -h "$DB_HOST" -U "$POSTGRES_USER" -d "$VERIFY_DB" -tAc "SELECT count(*) FROM $table" 2>/dev/null || echo "-1")
  if [ "$count" = "-1" ]; then
    log "verify_fail" "Table $table: not found or query failed"
    ERRORS=$((ERRORS + 1))
  else
    log "verify_ok" "Table $table: $count rows"
  fi
}

check_table "projects"
check_table "sessions"
check_table "account_scopes"
check_table "cw_messages"
check_table "linear_issues_raw"
check_table "attio_opportunities_raw"
check_table "audit_events"
check_table "connector_sync_state"

# Check extensions
EXT_COUNT=$(psql -h "$DB_HOST" -U "$POSTGRES_USER" -d "$VERIFY_DB" -tAc \
  "SELECT count(*) FROM pg_extension WHERE extname IN ('vector', 'pg_trgm')" 2>/dev/null || echo "0")
log "verify_extensions" "Found $EXT_COUNT expected extensions (vector, pg_trgm)"

if [ "$ERRORS" -gt 0 ]; then
  log "verify_result" "FAIL: $ERRORS validation errors"
  exit 1
fi

FILE_SIZE=$(stat -c%s "$LATEST" 2>/dev/null || stat -f%z "$LATEST" 2>/dev/null || echo "0")
log "verify_result" "OK: backup verified ($FILE_SIZE bytes)"
