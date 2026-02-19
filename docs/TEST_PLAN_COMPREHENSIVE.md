# Комплексный план тестирования

**Дата:** 2026-02-19
**Цель:** Полное покрытие edge-cases перед началом кодинга. Этот документ — living contract: каждый новый модуль должен добавлять тесты в соответствующую секцию.

---

## 1. SERVER UNIT TESTS — непокрытые сервисы

### 1.1 `services/attio.js` — Attio CRM sync
```
Тесты:
- normalizeCompany(): empty record, missing fields, nested Attio values
- normalizeOpportunity(): null amount, probability > 100, missing title
- normalizePerson(): null email, duplicate external_id
- normalizeActivity(): missing occurred_at, unknown type
- unwrapStructuredValue(): depth > 5 (recursion guard), cyclic reference
- extractRelationExternalId(): nested arrays, null chain
- pickRecordField(): missing keys, all null values
- parseProbability(): 0, 1, 50, 101, -5, NaN, null, "string"
- loadMockSnapshot(): empty cw_contacts, large dataset
- loadAttioSnapshot(): API mode pagination, cursor loops, empty pages
- upsertCompanies(): 0 rows, 1000 rows batch, conflict resolution
- mirrorToCrmTables(): no matching crm_accounts, name collision
- computeCursor(): empty array, all null updated_at
- boolFromEnv(): "0", "1", "true", "false", "yes", "no", "", null, undefined
Edge-cases:
- Attio API returns 500 → fetchWithRetry retries → circuit breaker
- Attio API returns invalid JSON
- Empty workspace_id
- Opportunity with account_external_id that doesn't match any company
```

### 1.2 `services/linear.js` — Linear sync
```
Тесты:
- normalizeLinearIssue(): missing labels, empty blocked list, null state
- normalizeLinearProject(): null lead, empty name
- normalizeLinearState(): missing type, invalid position
- normalizeLinearCycle(): null dates, progress=NaN
- linearGraphQL(): errors array in response, non-200 status, invalid JSON
- loadLinearApiSnapshot(): pagination (hasNextPage loop), dedup by issue ID
- loadLinearMockSnapshot(): empty cw_conversations
- upsertIssues(): batch size, conflict with changed data vs unchanged
Edge-cases:
- GraphQL returns partial data (projects OK, issues error)
- 0 issues in workspace
- Issue with cycle_external_id pointing to non-existent cycle
- Linear API rate limit (429)
```

### 1.3 `services/chatwoot.js` — Chatwoot sync
```
Тесты:
- Conversation pagination: empty page, last page, max pages
- Message processing: empty content, null sender, HTML content
- Contact extraction: duplicate contacts, missing email
- Chunking: text < MIN_EMBED_CHARS → skip, text > CHUNK_SIZE → split
- rag_chunks creation: proper chunk_index, conversation_global_id
- Storage budget: under budget, at threshold, over budget
Edge-cases:
- Chatwoot API timeout on page 3 of 20
- Message with only whitespace
- Conversation with 0 messages
- Contact with name=null and email=null
- CHATWOOT_LOOKBACK_DAYS=0
- Unicode/emoji content in messages
```

### 1.4 `services/signals.js` — Signals & NBA
```
Тесты:
- extractSignalsAndNba(): empty data → 0 signals, rich data → proper extraction
- listSignals(): pagination, filtering by status
- listNba(): priority ordering
- updateSignalStatus(): valid transitions, invalid transition
- updateNbaStatus(): valid transitions, invalid transition
- getTopNba(): empty → returns empty, multiple → returns top N
Edge-cases:
- Signal extraction with no messages, no issues, no opportunities
- NBA generation when health score is null
- Concurrent status updates (race condition)
```

### 1.5 `services/intelligence.js` — Analytics & Digests
```
Тесты:
- getControlTower(): all data present, partial data, empty project
- getAnalyticsOverview(): empty project → zeros, rich data → aggregates
- refreshAnalytics(): triggers materialized view refresh
- refreshRiskAndHealth(): health score calculation
- getRiskOverview(): no risks → empty, multiple risks → sorted by severity
- generateDailyDigest(): empty day, day with events
- generateWeeklyDigest(): empty week, cross-week boundary
- getDigests(): pagination, filtering by type
Edge-cases:
- Analytics with 0 accounts → division by zero guard
- Health score with missing factors → default values
- Digest generation when scheduler runs twice (idempotency)
```

### 1.6 `services/identity-graph.js` — Identity linking
```
Тесты:
- listIdentityLinks(): empty, with links
- listIdentitySuggestions(): empty, duplicates
- previewIdentitySuggestions(): score thresholds
- applyIdentitySuggestions(): valid merge, conflicting merge
Edge-cases:
- Same contact in Chatwoot and Attio → merge
- Contact with identical name but different email
- Apply suggestion twice (idempotency)
```

### 1.7 `services/upsell.js` — Upsell radar
```
Тесты:
- listUpsellRadar(): empty, filtered by status
- refreshUpsellRadar(): triggers recalculation
- updateUpsellStatus(): valid transitions
Edge-cases:
- Upsell for account with 0 revenue → handle gracefully
- Concurrent refresh and status update
```

### 1.8 `services/continuity.js` — Continuity actions
```
Тесты:
- listContinuityActions(): empty, with actions
- buildContinuityPreview(): preview without side effects
- applyContinuityActions(): applies to Linear, handles errors
Edge-cases:
- Apply when Linear is in mock mode
- Apply when Linear API is down
```

### 1.9 `services/outbox.js` — Outbound messaging
```
Тесты:
- createOutboundDraft(): valid, missing required fields
- listOutbound(): pagination, status filter
- approveOutbound(): valid, already approved, expired
- processDueOutbounds(): 0 due, multiple due, partial failure
- sendOutbound(): success, failure, retry logic
- setOptOut(): new opt-out, duplicate
Edge-cases:
- Rate limiting: frequency_window_hours=0, frequency_cap=0
- Outbound to opted-out contact
- Concurrent approve + process
```

### 1.10 `services/loops.js` — Loops contact sync
```
Тесты:
- syncLoopsContacts(): empty contacts, large batch, deduplication
Edge-cases:
- Loops API failure mid-sync
- Contact with invalid email format
```

### 1.11 `services/audit.js` — Audit trail
```
Тесты:
- writeAuditEvent(): valid event, missing fields
- listAuditEvents(): pagination, filtering
- normalizeEvidenceRefs(): empty, malformed refs
Edge-cases:
- Very large payload (>10KB)
- Concurrent writes
```

---

## 2. INTEGRATION TESTS (require DB)

### 2.1 LightRAG end-to-end
```
1. Insert test messages into cw_messages
2. Run chunking → verify rag_chunks created
3. Mock OpenAI embeddings → verify vectors stored
4. queryLightRag("test query") → verify:
   - chunks returned (vector search)
   - messages returned (ILIKE)
   - evidence merged correctly
   - quality_score > 0
   - lightrag_query_runs row created
5. submitLightRagFeedback() → verify feedback row
6. Edge: query with no matches → empty results, quality_score=0
7. Edge: query with only chunks, no messages → partial evidence
8. Edge: all chunks in 'failed' status → no vector results
```

### 2.2 Connector sync chain
```
1. runAllConnectorsSync() in mock mode:
   - Verify attio_accounts_raw populated
   - Verify crm_accounts mirrored
   - Verify attio_opportunities_raw populated
   - Verify crm_opportunities created (JOIN with crm_accounts)
   - Verify linear_issues_raw populated
   - Verify cw_messages populated (mock)
   - Verify sync_watermarks updated
   - Verify mv_portfolio_dashboard refreshed
2. Run again → verify idempotent (rowCount=0 for unchanged data)
3. Modify mock data → verify delta sync
4. Simulate connector failure → verify error in connector_errors
5. retryConnectorErrors() → verify retry and resolution
```

### 2.3 Scheduler cascade
```
1. Create scheduled_jobs: sync, signals, health, analytics
2. Complete sync job → verify signals + embeddings moved to now()
3. Complete signals → verify health moved to now()
4. Complete health → verify analytics moved to now()
5. Cascade with dead downstream job → no error
```

### 2.4 Authentication flow
```
1. POST /auth/login with valid credentials → 200 + session cookie
2. POST /auth/login with wrong password → 401
3. POST /auth/login with bcrypt hash credential → verify hash comparison
4. Access protected route without session → 401
5. Access protected route with expired session → 401
6. CSRF token validation: missing → 403, invalid → 403, valid → pass
7. Rate limiting: 11th attempt within 15 min → 429
```

### 2.5 Multi-tenant isolation
```
1. Create 2 projects (A, B) with different data
2. All queries with scope A → only A data
3. All queries with scope B → only B data
4. searchChunks with scope A → no B chunks
5. queryLightRag with scope A → no B evidence
```

---

## 3. E2E TESTS (Playwright)

### 3.1 Login flow
```
- Valid login → redirect to dashboard
- Invalid login → error message visible
- Rate limiting → appropriate error after N attempts
- CSRF token refresh after failed attempt
```

### 3.2 Control Tower
```
- Dashboard loads → all sections visible
- Each section toggle → content changes
- CTA buttons → navigate to correct pages (after fix)
- Real-time update (mock SSE) → data refreshes
- Empty state → appropriate placeholder
```

### 3.3 CRM page
```
- Account list loads → paginated
- Click account → detail view
- Opportunity list → stages displayed correctly
- Empty CRM → placeholder message
```

### 3.4 Search / LightRAG
```
- Type query → results appear
- Empty query → appropriate message
- Source filter toggle → results change
- Feedback submission → toast confirmation
```

### 3.5 Signals page
```
- Signals list loads
- NBA section loads
- Status update → toast + list refresh
- Empty signals → placeholder
```

### 3.6 Analytics page
```
- Overview loads with charts
- Risk overview → risk cards
- Digest list → daily/weekly
- Empty analytics → zeros, not errors
```

### 3.7 Design system compliance (automated)
```
- All pages: no arbitrary spacing values (automated by design-audit.mjs)
- All pages: no raw hex colors
- All pages: no inline styles
- Motion: anime.js uses MOTION tokens
- Typography: text-xs/sm/base/lg/xl only
```

---

## 4. CONTRACT TESTS (API shape)

### 4.1 Response shape validation
```
Для каждого endpoint проверить:
- GET /health → { status: "ok", ... }
- GET /metrics → Prometheus text format
- GET /projects → { data: [{ id, name, ... }] }
- GET /v1/control-tower → { sections: {...} }
- GET /v1/portfolio/overview → { data: {...} }
- GET /v1/signals → { data: [{ id, type, status, ... }] }
- GET /v1/nba → { data: [{ id, action, priority, ... }] }
- GET /v1/analytics/overview → { data: { metrics: {...} } }
- POST /v1/lightrag/query → { query, answer, chunks, evidence, stats }
- GET /v1/connectors/state → { data: [{ connector, status, ... }] }
- GET /v1/reconciliation → { data: { summary, details } }
- GET /v1/identity/links → { data: [...] }
- GET /v1/audit-events → { data: [...], total }
Каждый ответ:
- Zod schema validation (parse, not just match)
- Backward-compatible: старые поля не удалены
- Pagination: limit/offset работают корректно
```

---

## 5. PERFORMANCE TESTS

### 5.1 Database query performance
```
- searchChunks() с 100K chunks → <500ms
- queryLightRag() с 4 parallel queries → <1s
- getControlTower() → <200ms
- getPortfolioOverview() → <300ms
- Materialized view refresh → <5s
```

### 5.2 Redis performance
```
- Cache hit rate >80% under polling load
- Pub/Sub latency <50ms
- invalidateByPrefix() с 100 keys → <100ms
```

### 5.3 Load test
```
- 10 concurrent users polling every 15s → server stable
- Connector sync during polling → no deadlocks
- SSE with 10 clients → all receive events
```

---

## 6. SECURITY TESTS (расширение security-hardening.unit.test.js)

```
- SQL injection в LightRAG query → parameterized, safe
- XSS в toast message → escaped
- CSRF bypass attempts → blocked
- Session fixation → new session on login
- Rate limit bypass (X-Forwarded-For) → not honored
- Auth credential timing attack → bcrypt constant-time
- Large payload (>1MB body) → rejected
- Concurrent login from 2 IPs → both sessions valid
- Session after password change → invalidated
```

---

## 7. ПРИОРИТИЗАЦИЯ

### Phase 1 (до кодинга — blocking):
1. Fix CRITICAL issues (Toast, lang, toPositiveInt)
2. Add unit tests for `attio.js`, `linear.js` (mock modes)
3. Add integration test for auth flow
4. Add e2e test for login flow

### Phase 2 (первый sprint):
5. Add unit tests for `signals.js`, `intelligence.js`
6. Add integration test for LightRAG e2e
7. Add integration test for connector sync chain
8. Add e2e test for Control Tower
9. Add contract tests for top 5 endpoints

### Phase 3 (ongoing):
10. Add remaining service unit tests
11. Add e2e for all pages
12. Add performance benchmarks
13. Add security regression tests
