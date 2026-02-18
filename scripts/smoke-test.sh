#!/usr/bin/env bash
# Smoke test for labpics-dashboard
# Validates critical API endpoints are responding correctly.
#
# Usage: ./scripts/smoke-test.sh [base_url]
# Example: ./scripts/smoke-test.sh http://localhost:8080
set -euo pipefail

BASE_URL="${1:-http://localhost:8080}"
PASSED=0
FAILED=0

check() {
  local name="$1"
  local url="$2"
  local expected_status="${3:-200}"
  local check_body="${4:-}"

  local http_code
  local body
  body=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null) || body="000"
  http_code="$body"

  # If we need body content, re-fetch
  if [ -n "$check_body" ]; then
    body=$(curl -s --max-time 10 "$url" 2>/dev/null) || body=""
  fi

  if [ "$http_code" = "$expected_status" ]; then
    if [ -n "$check_body" ] && ! echo "$body" | grep -q "$check_body"; then
      echo "FAIL  $name  status=$http_code  missing: $check_body"
      FAILED=$((FAILED + 1))
      return
    fi
    echo "OK    $name  status=$http_code"
    PASSED=$((PASSED + 1))
  else
    echo "FAIL  $name  expected=$expected_status  got=$http_code"
    FAILED=$((FAILED + 1))
  fi
}

echo "=== Smoke Test: $BASE_URL ==="
echo ""

# Health endpoint
check "GET /health" "$BASE_URL/health" 200

# Metrics endpoint — should return Prometheus format with key metrics
check "GET /metrics (format)" "$BASE_URL/metrics" 200 "app_requests_total"
check "GET /metrics (pool)" "$BASE_URL/metrics" 200 "app_db_pool_total"
check "GET /metrics (cache)" "$BASE_URL/metrics" 200 "app_cache_enabled"
check "GET /metrics (process)" "$BASE_URL/metrics" 200 "app_process_uptime_seconds"

# Auth — unauthenticated should return 401
check "GET /projects (auth)" "$BASE_URL/projects" 401

# V1 prefix should work
check "GET /v1/health" "$BASE_URL/v1/health" 200

# Rate limiting headers
check "GET /v1/metrics" "$BASE_URL/v1/metrics" 200

echo ""
echo "=== Results: $PASSED passed, $FAILED failed ==="

if [ "$FAILED" -gt 0 ]; then
  exit 1
fi
