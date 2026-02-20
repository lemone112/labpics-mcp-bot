#!/usr/bin/env bash
# Create GitHub Issues + Milestones for Iter 61–63 (critique findings)
# Run locally where `gh` is authenticated: bash scripts/create-critique-issues.sh
set -euo pipefail

REPO="lemone112/labpics-dashboard"

echo "=== Creating Milestones ==="

M61=$(gh api "repos/$REPO/milestones" -X POST \
  -f title="Iter 61 — Security Hardening" \
  -f description="Phase 0 (Critical Fixes). Source: Security agent critique (2026-02-20). CSRF bypass, webhook auth, rate limiting, Swagger exposure." \
  -f state="open" --jq '.number')
echo "✓ Milestone $M61: Iter 61 — Security Hardening"

M62=$(gh api "repos/$REPO/milestones" -X POST \
  -f title="Iter 62 — Business Logic Accuracy" \
  -f description="Phase 0 (Critical Fixes). Source: Business agent critique (2026-02-20). Russian signals, real metrics, response time computation. Impact: dashboard shows fabricated data without these fixes." \
  -f state="open" --jq '.number')
echo "✓ Milestone $M62: Iter 62 — Business Logic Accuracy"

M63=$(gh api "repos/$REPO/milestones" -X POST \
  -f title="Iter 63 — DB & Vector Optimization" \
  -f description="Phase 0 (Critical Fixes). Source: DB/RAG agent critique (2026-02-20). Vector search sequential scan, infinite retry loops, missing indexes." \
  -f state="open" --jq '.number')
echo "✓ Milestone $M63: Iter 63 — DB & Vector Optimization"

echo ""
echo "=== Creating Iter 61 Issues (Security Hardening) ==="

gh api "repos/$REPO/issues" -X POST \
  -f title="61.1 Fix logout CSRF bypass: require CSRF for POST /auth/logout" \
  -F milestone="$M61" \
  -f body="$(cat <<'EOF'
## Problem
All `/auth/` paths are marked `isPublic` in `server/src/index.js:679`, which skips CSRF validation. `POST /auth/logout` is a mutation endpoint that should require CSRF protection.

## Location
- `server/src/index.js:679` — isPublic path check
- `server/src/routes/auth.js:114` — logout handler

## Fix
Only mark login/signup as public; require CSRF token for logout and any future `/auth/` mutations.

## Priority
P0 — Security

## Source
Security agent critique (2026-02-20), Finding #4
EOF
)" --jq '"✓ Issue #" + (.number|tostring) + ": " + .title'

gh api "repos/$REPO/issues" -X POST \
  -f title="61.2 Enforce TG webhook secret: reject when env var unset + startup check" \
  -F milestone="$M61" \
  -f body="$(cat <<'EOF'
## Problem
`if (webhookSecret)` in `telegram-bot/src/index.ts:33` skips validation when env var is unset. `TELEGRAM_WEBHOOK_SECRET` is optional in `telegram-bot/src/types.ts:12`. Anyone with the webhook URL can send arbitrary commands when secret is not configured.

## Location
- `telegram-bot/src/index.ts:33` — conditional validation
- `telegram-bot/src/types.ts:12` — optional type

## Fix
1. Make `TELEGRAM_WEBHOOK_SECRET` required in types
2. Add startup check that rejects launch without the secret
3. Always validate incoming webhook requests against the secret

## Priority
P0 — Security (CRITICAL finding)

## Source
Security agent critique (2026-02-20), Finding #5
EOF
)" --jq '"✓ Issue #" + (.number|tostring) + ": " + .title'

gh api "repos/$REPO/issues" -X POST \
  -f title="61.3 Fix CSRF cookie httpOnly → false (enable double-submit pattern)" \
  -F milestone="$M61" \
  -f body="$(cat <<'EOF'
## Problem
CSRF cookie is set with `httpOnly: true` in `server/src/index.js:507-513`. This prevents JavaScript from reading the cookie to include the token in request headers, defeating the double-submit cookie pattern.

## Location
- `server/src/index.js:507-513` — cookie options

## Fix
Set `httpOnly: false` for the CSRF cookie so client-side JavaScript can read the token and include it in the `X-CSRF-Token` header.

## Priority
P0 — Security

## Source
Security agent critique (2026-02-20), HIGH finding
EOF
)" --jq '"✓ Issue #" + (.number|tostring) + ": " + .title'

gh api "repos/$REPO/issues" -X POST \
  -f title="61.4 Gate Swagger UI behind NODE_ENV !== production" \
  -F milestone="$M61" \
  -f body="$(cat <<'EOF'
## Problem
Swagger UI is registered at `server/src/index.js:395-397` and is accessible unauthenticated in production (path is in `isPublic` list at line 679). This exposes full API schema to anyone.

## Location
- `server/src/index.js:395-397` — Swagger registration
- `server/src/index.js:679` — isPublic paths

## Fix
Only register Swagger plugin when `NODE_ENV !== 'production'`, or require authentication to access it.

## Priority
P0 — Security

## Source
Security agent critique (2026-02-20), HIGH finding
EOF
)" --jq '"✓ Issue #" + (.number|tostring) + ": " + .title'

gh api "repos/$REPO/issues" -X POST \
  -f title="61.5 Use crypto.timingSafeEqual for TG webhook secret comparison" \
  -F milestone="$M61" \
  -f body="$(cat <<'EOF'
## Problem
Telegram webhook secret comparison uses `!==` operator in `telegram-bot/src/index.ts:35`, which is vulnerable to timing attacks.

## Location
- `telegram-bot/src/index.ts:35`

## Fix
Use `crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected))` for constant-time comparison.

## Priority
P1 — Security

## Source
Security agent critique (2026-02-20), HIGH finding
EOF
)" --jq '"✓ Issue #" + (.number|tostring) + ": " + .title'

gh api "repos/$REPO/issues" -X POST \
  -f title="61.6 Sanitize x-request-id header (format, length, charset)" \
  -F milestone="$M61" \
  -f body="$(cat <<'EOF'
## Problem
Client-provided `x-request-id` header is passed directly to logs at `server/src/index.js:356` without sanitization. Malicious values could enable log injection attacks.

## Location
- `server/src/index.js:356`

## Fix
Validate format (UUID/alphanumeric), enforce max length (64 chars), strip control characters.

## Priority
P1 — Security

## Source
Security agent critique (2026-02-20), HIGH finding
EOF
)" --jq '"✓ Issue #" + (.number|tostring) + ": " + .title'

gh api "repos/$REPO/issues" -X POST \
  -f title="61.7 Add rate limiting to /auth/me, /auth/signup/* endpoints" \
  -F milestone="$M61" \
  -f body="$(cat <<'EOF'
## Problem
Rate limiting is only applied to `/auth/login`. Other auth endpoints (`/auth/me`, `/auth/signup/*`) exit the middleware before rate limiting at `server/src/index.js:689`.

## Location
- `server/src/index.js:689` — early exit before rate limiter

## Fix
Apply rate limiting to all auth endpoints, not just login. Consider separate limits for signup (stricter) vs /auth/me (moderate).

## Priority
P1 — Security

## Source
Security agent critique (2026-02-20), HIGH finding
EOF
)" --jq '"✓ Issue #" + (.number|tostring) + ": " + .title'

gh api "repos/$REPO/issues" -X POST \
  -f title="61.8 Authenticate /metrics endpoint (or gate behind isProd)" \
  -F milestone="$M61" \
  -f body="$(cat <<'EOF'
## Problem
`/metrics` endpoint at `server/src/index.js:679,755` is unauthenticated and exposes pool sizes, heap usage, route timings, and other internal data.

## Location
- `server/src/index.js:679` — isPublic paths
- `server/src/index.js:755` — metrics handler

## Fix
Either require authentication for /metrics, or only expose it when `NODE_ENV !== 'production'`, or move it to a separate internal port.

## Priority
P1 — Security

## Source
Security agent critique (2026-02-20), HIGH finding
EOF
)" --jq '"✓ Issue #" + (.number|tostring) + ": " + .title'

echo ""
echo "=== Creating Iter 62 Issues (Business Logic Accuracy) ==="

gh api "repos/$REPO/issues" -X POST \
  -f title="62.1 Add Russian keyword patterns to signal detection" \
  -F milestone="$M62" \
  -f body="$(cat <<'EOF'
## Problem
Signal detection regex in `server/src/services/signals.js:28-72` only matches English keywords (e.g., "urgent", "delay", "budget"). All client communications are in Russian (confirmed by templates). This means signal extraction produces near-zero results, making health scores, NBA, and daily digests empty/meaningless.

## Location
- `server/src/services/signals.js:28-72` — keyword patterns

## Fix
Add Russian keyword patterns alongside English ones. E.g.:
- "срочно", "задержка", "бюджет", "дедлайн", "проблема", "недоволен"
- Risk signals: "отмена", "расторжение", "конкурент", "перенос"
- Positive signals: "спасибо", "отлично", "доволен", "рекомендую"

## Impact
Highest business impact per engineering effort — unlocks signals, health scores, NBA, digests.

## Priority
P0 — Business (CRITICAL finding)

## Source
Business agent critique (2026-02-20), Finding #11
EOF
)" --jq '"✓ Issue #" + (.number|tostring) + ": " + .title'

gh api "repos/$REPO/issues" -X POST \
  -f title="62.2 Add Russian keyword patterns to upsell radar" \
  -F milestone="$M62" \
  -f body="$(cat <<'EOF'
## Problem
Upsell detection in `server/src/services/upsell.js:16` uses English-only keywords. Russian-speaking clients' upsell signals are missed entirely.

## Location
- `server/src/services/upsell.js:16` — keyword patterns

## Fix
Add Russian upsell keywords: "расширение", "дополнительно", "новый проект", "увеличить", "масштабировать", "продолжить сотрудничество".

## Priority
P0 — Business

## Source
Business agent critique (2026-02-20), Finding #11
EOF
)" --jq '"✓ Issue #" + (.number|tostring) + ": " + .title'

gh api "repos/$REPO/issues" -X POST \
  -f title="62.3 Compute actual avg_response_minutes (pair messages)" \
  -F milestone="$M62" \
  -f body="$(cat <<'EOF'
## Problem
`avg_response_minutes` field exists in analytics snapshots but is hardcoded to 0 in `server/src/services/intelligence.js:89`. The computation to pair incoming/outgoing messages and calculate response times is missing.

## Location
- `server/src/services/intelligence.js:89` — hardcoded 0

## Fix
Query message pairs (client message → team response) from event log, compute time difference, aggregate as average per project/client.

## Priority
P0 — Business

## Source
Business agent critique (2026-02-20), HIGH finding
EOF
)" --jq '"✓ Issue #" + (.number|tostring) + ": " + .title'

gh api "repos/$REPO/issues" -X POST \
  -f title="62.4 Feed outbound_messages count into analytics snapshots" \
  -F milestone="$M62" \
  -f body="$(cat <<'EOF'
## Problem
`outbound_messages` field is hardcoded to 0 in `server/src/services/intelligence.js:89`. Outbox data exists but is not fed into analytics snapshots.

## Location
- `server/src/services/intelligence.js:89` — hardcoded 0

## Fix
Count outbound messages from the outbox table per project/client and include in snapshot computation.

## Priority
P0 — Business

## Source
Business agent critique (2026-02-20), HIGH finding
EOF
)" --jq '"✓ Issue #" + (.number|tostring) + ": " + .title'

gh api "repos/$REPO/issues" -X POST \
  -f title="62.5 Add client communication gap detection (N days silence)" \
  -F milestone="$M62" \
  -f body="$(cat <<'EOF'
## Problem
There is no detection for communication gaps — when a client has not received any messages for N days. This is the strongest churn signal for a service business but is completely missing from the system.

## Location
- No existing query for `last_message_at < now() - interval`

## Fix
1. Add a query to identify clients with no communication in the last N days (configurable threshold)
2. Generate a "communication_gap" signal with severity based on gap length
3. Include in health score computation and NBA recommendations

## Priority
P0 — Business (not in any existing iteration)

## Source
Business agent critique (2026-02-20), Business-Critical Gap #1
EOF
)" --jq '"✓ Issue #" + (.number|tostring) + ": " + .title'

gh api "repos/$REPO/issues" -X POST \
  -f title="62.6 Separate failedJobPressure from client health score" \
  -F milestone="$M62" \
  -f body="$(cat <<'EOF'
## Problem
`failedJobPressure` (a technical/infrastructure metric) is mixed into the client health score formula at `server/src/services/intelligence.js:276`. A failing scheduler job can incorrectly lower a client's business health score.

## Location
- `server/src/services/intelligence.js:276`

## Fix
Remove `failedJobPressure` from client health score. Move it to a separate system health/operational score.

## Priority
P1 — Business

## Source
Business agent critique (2026-02-20), HIGH finding
EOF
)" --jq '"✓ Issue #" + (.number|tostring) + ": " + .title'

gh api "repos/$REPO/issues" -X POST \
  -f title="62.7 Calibrate upsell thresholds for \$5-20K deal range" \
  -F milestone="$M62" \
  -f body="$(cat <<'EOF'
## Problem
Upsell thresholds in `server/src/services/upsell.js:37-58` are set at $50K, which is far above the typical $5-20K deal range for this design studio. No clients will ever trigger upsell signals.

## Location
- `server/src/services/upsell.js:37-58` — threshold constants

## Fix
Calibrate thresholds to match actual deal sizes: $5K, $10K, $20K tiers instead of $50K.

## Priority
P1 — Business

## Source
Business agent critique (2026-02-20), HIGH finding
EOF
)" --jq '"✓ Issue #" + (.number|tostring) + ": " + .title'

gh api "repos/$REPO/issues" -X POST \
  -f title="62.8 Add project lifecycle phase field (kickoff → completed)" \
  -F milestone="$M62" \
  -f body="$(cat <<'EOF'
## Problem
Projects have no lifecycle phase concept. Without phases (kickoff/active/review/handoff/warranty/completed), the system cannot detect upsell windows (e.g., near completion) or generate phase-appropriate recommendations.

## Location
- No phase field in project schema

## Fix
1. Add `phase` enum to projects table: kickoff, active, review, handoff, warranty, completed
2. Add migration for the new column
3. Expose in API and frontend project settings
4. Use phase in signal detection and NBA generation

## Priority
P1 — Business (not in any existing iteration)

## Source
Business agent critique (2026-02-20), Business-Critical Gap #2
EOF
)" --jq '"✓ Issue #" + (.number|tostring) + ": " + .title'

echo ""
echo "=== Creating Iter 63 Issues (DB & Vector Optimization) ==="

gh api "repos/$REPO/issues" -X POST \
  -f title="63.1 Fix vector search operator: <-> → <=> (cosine distance)" \
  -F milestone="$M63" \
  -f body="$(cat <<'EOF'
## Problem
`searchChunks` in `server/src/services/embeddings.js:248,254` uses `<->` (L2/Euclidean distance) but ALL vector indexes are built with `vector_cosine_ops`. pgvector will NOT use the index when the operator doesn't match → full sequential scan on every query.

## Location
- `server/src/services/embeddings.js:248` — `<->` operator
- `server/src/services/embeddings.js:254` — `<->` operator
- Indexes: migration `0002:14` (ivfflat), `0003:77` (hnsw), `0021:133` (hnsw) — all `vector_cosine_ops`

## Fix
Change `<->` to `<=>` (cosine distance operator). One-line change, massive performance impact.

## Verification
Run `EXPLAIN ANALYZE` before and after to confirm index usage.

## Priority
P0 — Performance (CRITICAL finding)

## Source
DB/RAG agent critique (2026-02-20), Finding #1
EOF
)" --jq '"✓ Issue #" + (.number|tostring) + ": " + .title'

gh api "repos/$REPO/issues" -X POST \
  -f title="63.2 Fix token budget truncation: add budget_exhausted flag" \
  -F milestone="$M63" \
  -f body="$(cat <<'EOF'
## Problem
When token budget is exceeded in `server/src/services/openai.js:79-82`, fewer embeddings are returned than inputs. Missing embeddings are counted as "failed" but `markClaimedAsPending` in `embeddings.js:171-188` decrements attempts, so they never reach max-attempts cap. Chunks cycle indefinitely in an infinite retry loop.

## Location
- `server/src/services/openai.js:79-82` — token budget truncation
- `server/src/services/embeddings.js:171-188` — markClaimedAsPending

## Fix
1. Return explicit `budget_exhausted` flag from the embedding call
2. Don't decrement attempts for budget-truncated chunks
3. Re-queue them for next batch without penalizing

## Priority
P0 — Data integrity (CRITICAL finding)

## Source
DB/RAG agent critique (2026-02-20), Finding #6
EOF
)" --jq '"✓ Issue #" + (.number|tostring) + ": " + .title'

gh api "repos/$REPO/issues" -X POST \
  -f title="63.3 Add expression indexes for COALESCE(updated_at, created_at)" \
  -F milestone="$M63" \
  -f body="$(cat <<'EOF'
## Problem
4 event-candidate queries in `server/src/services/event-log.js` use `COALESCE(updated_at, created_at)` for ordering/filtering. This expression prevents PostgreSQL from using existing indexes on `updated_at` or `created_at` individually.

## Location
- `server/src/services/event-log.js` — multiple queries with COALESCE

## Fix
Create expression indexes: `CREATE INDEX idx_<table>_coalesce_ts ON <table> (COALESCE(updated_at, created_at))` for the affected tables.

## Priority
P0 — Performance

## Source
DB/RAG agent critique (2026-02-20), HIGH finding
EOF
)" --jq '"✓ Issue #" + (.number|tostring) + ": " + .title'

gh api "repos/$REPO/issues" -X POST \
  -f title="63.4 Wrap connector-sync success path in withTransaction" \
  -F milestone="$M63" \
  -f body="$(cat <<'EOF'
## Problem
The connector-sync success path in `server/src/services/connector-sync.js:74-170` performs multiple database writes without a transaction. If the process crashes mid-way, data is left in a partially-written state.

## Location
- `server/src/services/connector-sync.js:74-170`
- `server/src/services/db.js:20` — `withTransaction` exists but is not used here

## Fix
Wrap the success path (status update + data upserts) in `withTransaction` from `db.js`.

## Priority
P1 — Data integrity

## Source
DB/RAG agent critique (2026-02-20), HIGH finding
EOF
)" --jq '"✓ Issue #" + (.number|tostring) + ": " + .title'

gh api "repos/$REPO/issues" -X POST \
  -f title="63.5 Rename stale kag_event_log indexes → connector_events" \
  -F milestone="$M63" \
  -f body="$(cat <<'EOF'
## Problem
After the kag→connector rename, migration `0022:15-16` only renamed 2 of 5 indexes. 3 indexes still have the old `kag_*` naming convention.

## Location
- `server/supabase/migrations/0022:15-16`

## Fix
Create a new migration to rename the remaining 3 indexes from `kag_event_log_*` to `connector_events_*`.

## Priority
P1 — Code hygiene

## Source
DB/RAG agent critique (2026-02-20), HIGH finding
EOF
)" --jq '"✓ Issue #" + (.number|tostring) + ": " + .title'

gh api "repos/$REPO/issues" -X POST \
  -f title="63.6 Drop redundant IVFFlat index (HNSW is preferred)" \
  -F milestone="$M63" \
  -f body="$(cat <<'EOF'
## Problem
Migration `0002:13-15` creates an IVFFlat index, but later migrations (`0003`, `0021`) create HNSW indexes on the same column. HNSW is the preferred index type. The IVFFlat index is unused and slows down INSERT operations.

## Location
- `server/supabase/migrations/0002:13-15` — IVFFlat index

## Fix
Create a migration to drop the redundant IVFFlat index. Verify no queries depend on it first.

## Priority
P1 — Performance

## Source
DB/RAG agent critique (2026-02-20), MEDIUM finding
EOF
)" --jq '"✓ Issue #" + (.number|tostring) + ": " + .title'

gh api "repos/$REPO/issues" -X POST \
  -f title="63.7 Add pool saturation warning (queue length monitoring)" \
  -F milestone="$M63" \
  -f body="$(cat <<'EOF'
## Problem
Connection pool is configured with `max: 25` in `server/src/services/db.js:8` but there is no monitoring or warning when the pool approaches saturation. Under load, queries silently queue and timeout.

## Location
- `server/src/services/db.js:8` — pool config

## Fix
1. Add pool event listeners for `waiting` and `error`
2. Log warning when waiting queue exceeds threshold (e.g., 5 pending)
3. Expose pool stats in /metrics endpoint (totalCount, idleCount, waitingCount)

## Priority
P2 — Observability

## Source
DB/RAG agent critique (2026-02-20), MEDIUM finding
EOF
)" --jq '"✓ Issue #" + (.number|tostring) + ": " + .title'

gh api "repos/$REPO/issues" -X POST \
  -f title="63.8 Move dimension validation before API calls (save tokens)" \
  -F milestone="$M63" \
  -f body="$(cat <<'EOF'
## Problem
Embedding dimension validation in `server/src/services/openai.js:96-99` runs AFTER all API calls complete. If dimensions are wrong, all spent tokens are wasted.

## Location
- `server/src/services/openai.js:96-99` — validation after API calls

## Fix
Move dimension validation to BEFORE the API call. Check expected dimensions against model configuration at the start of the function.

## Priority
P2 — Cost optimization

## Source
DB/RAG agent critique (2026-02-20), MEDIUM finding
EOF
)" --jq '"✓ Issue #" + (.number|tostring) + ": " + .title'

echo ""
echo "=== Done ==="
echo "Created 3 milestones (Iter 61, 62, 63) and 24 issues."
echo ""
echo "Milestone numbers: Iter 61=$M61, Iter 62=$M62, Iter 63=$M63"
echo ""
echo "Next step: update docs/iteration-plan-wave3.md with issue numbers."
