#!/usr/bin/env bash
# PostgreSQL backup script for labpics-dashboard
# Usage: ./scripts/backup.sh
# Env vars:
#   POSTGRES_USER   (default: app)
#   POSTGRES_DB     (default: labpics)
#   DB_HOST         (default: db)
#   BACKUP_DIR      (default: /backups)
#   RETENTION_DAYS  (default: 7)
set -euo pipefail

POSTGRES_USER="${POSTGRES_USER:-app}"
POSTGRES_DB="${POSTGRES_DB:-labpics}"
DB_HOST="${DB_HOST:-db}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${POSTGRES_DB}_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "{\"type\":\"backup_start\",\"db\":\"$POSTGRES_DB\",\"file\":\"$BACKUP_FILE\",\"at\":\"$(date -Iseconds)\"}"

pg_dump -h "$DB_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl | gzip > "$BACKUP_FILE"

FILE_SIZE=$(stat -c%s "$BACKUP_FILE" 2>/dev/null || stat -f%z "$BACKUP_FILE" 2>/dev/null || echo "0")
echo "{\"type\":\"backup_complete\",\"file\":\"$BACKUP_FILE\",\"size_bytes\":$FILE_SIZE,\"at\":\"$(date -Iseconds)\"}"

# Cleanup old backups
DELETED=0
if [ "$RETENTION_DAYS" -gt 0 ]; then
  while IFS= read -r old_file; do
    rm -f "$old_file"
    DELETED=$((DELETED + 1))
  done < <(find "$BACKUP_DIR" -name "${POSTGRES_DB}_*.sql.gz" -mtime "+$RETENTION_DAYS" -type f 2>/dev/null)
fi

echo "{\"type\":\"backup_cleanup\",\"deleted\":$DELETED,\"retention_days\":$RETENTION_DAYS,\"at\":\"$(date -Iseconds)\"}"
