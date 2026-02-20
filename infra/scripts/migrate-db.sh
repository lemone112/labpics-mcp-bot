#!/usr/bin/env bash
#
# migrate-db.sh — Export PostgreSQL data from old server, import on new
#
# Run on OLD server to export:
#   bash migrate-db.sh export
#
# Copy the dump to the new server:
#   scp /tmp/labpics-db-export.sql.gz root@152.53.248.134:/tmp/
#
# Run on NEW server to import:
#   bash migrate-db.sh import
#
set -euo pipefail

COMPOSE_PROJECT="${COMPOSE_PROJECT_NAME:-labpics-dev}"
DB_USER="${POSTGRES_USER:-app}"
DB_NAME="${POSTGRES_DB:-labpics}"
DUMP_FILE="/tmp/labpics-db-export.sql.gz"

case "${1:-}" in
  export)
    echo "=== Exporting database from Docker container ==="
    CONTAINER=$(docker compose -p "$COMPOSE_PROJECT" ps -q db 2>/dev/null || docker ps --filter name=db --format '{{.Names}}' | head -1)
    if [ -z "$CONTAINER" ]; then
      echo "ERROR: Cannot find PostgreSQL container. Trying alternative..."
      CONTAINER=$(docker ps --filter ancestor=pgvector/pgvector --format '{{.Names}}' | head -1)
    fi
    if [ -z "$CONTAINER" ]; then
      echo "ERROR: No PostgreSQL container found. List running containers:"
      docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
      exit 1
    fi
    echo "  Container: $CONTAINER"
    echo "  Database: $DB_NAME"
    echo "  User: $DB_USER"
    echo ""
    echo "Running pg_dump..."
    docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" \
      --no-owner --no-privileges --if-exists --clean \
      | gzip > "$DUMP_FILE"
    SIZE=$(du -h "$DUMP_FILE" | cut -f1)
    echo "  -> Export complete: $DUMP_FILE ($SIZE)"
    echo ""
    echo "Now copy to new server:"
    echo "  scp $DUMP_FILE root@152.53.248.134:/tmp/"
    ;;

  import)
    echo "=== Importing database into Docker container ==="
    if [ ! -f "$DUMP_FILE" ]; then
      echo "ERROR: Dump file not found at $DUMP_FILE"
      echo "Copy it from old server first:"
      echo "  scp oldserver:/tmp/labpics-db-export.sql.gz /tmp/"
      exit 1
    fi

    # Ensure DB container is running
    CONTAINER=$(docker compose -p "$COMPOSE_PROJECT" ps -q db 2>/dev/null || docker ps --filter name=db --format '{{.Names}}' | head -1)
    if [ -z "$CONTAINER" ]; then
      echo "ERROR: No PostgreSQL container running."
      echo "Start the stack first: docker compose up -d db"
      exit 1
    fi

    echo "  Container: $CONTAINER"
    echo "  Database: $DB_NAME"
    echo ""

    # Ensure pgvector extension exists
    docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>/dev/null || true
    docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;" 2>/dev/null || true

    echo "Importing data..."
    gunzip -c "$DUMP_FILE" | docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" --single-transaction

    echo "  -> Import complete!"
    echo ""
    echo "Verify:"
    docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "
      SELECT schemaname, COUNT(*) as tables
      FROM pg_tables
      WHERE schemaname = 'public'
      GROUP BY schemaname;
    "
    ;;

  *)
    echo "Usage: $0 {export|import}"
    echo ""
    echo "  export  — Dump database from Docker container to $DUMP_FILE"
    echo "  import  — Restore database from $DUMP_FILE into Docker container"
    exit 1
    ;;
esac
