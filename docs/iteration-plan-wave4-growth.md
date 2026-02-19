# Wave 4 — Strategic Growth (Iter 25–30)

> Status: **Planning**
> Depends on: Wave 2 (Iter 11–16) complete, Wave 3 partially complete (Iter 17–19 minimum)
> Target: Transform single-user dashboard into scalable B2B platform
>
> Source: Deep architectural analysis (2026-02-19), senior+++ audit of product gaps,
> business metric impact assessment.

---

## Architecture

```
Iter 25 (Performance) ─── can start after Iter 18 (tokens in place) ──────────┐
                                                                               │
Iter 26 (API Architecture) ─── can start after Iter 16 (QA done) ────────────│
                                                                               │
Iter 27 (Multi-user) ─── depends on 26 (route extraction, API keys) ─────────│
                                                                               │
Iter 28 (Engagement) ─── depends on 27 (user model for notifications) ───────│
                           ─── depends on 25 (Cmd+K needs search infra) ──────│
                                                                               │
Iter 29 (Platform) ─── depends on 27 (team model for webhooks) ──────────────│
                                                                               │
Iter 30 (Offline + Enterprise) ─── after ALL above ──────────────────────────┘
```

**Critical path:** 26 → 27 → 28 → 30
**Parallel:** 25 (anytime after 18), 26 (anytime after 16)
**Final:** 30 — after ALL other Wave 4 iterations

---

## Summary

| Iter | Name | Category | Tasks | Milestone | Depends on | Effort |
|------|------|----------|-------|-----------|------------|--------|
| **25** | Performance & Caching | Performance | 9 | [15](https://github.com/lemone112/labpics-dashboard/milestone/15) | 18 | L |
| **26** | API Architecture & DX | Architecture | 8 | [16](https://github.com/lemone112/labpics-dashboard/milestone/16) | 16 | L |
| **27** | Multi-user & RBAC | Auth | 9 | [17](https://github.com/lemone112/labpics-dashboard/milestone/17) | 26 | XL |
| **28** | Engagement & Notifications | Engagement | 9 | [18](https://github.com/lemone112/labpics-dashboard/milestone/18) | 25, 27 | XL |
| **29** | Platform & Integrations | Platform | 8 | [19](https://github.com/lemone112/labpics-dashboard/milestone/19) | 27 | L |
| **30** | Offline, Personalization & Enterprise | Enterprise | 8 | [20](https://github.com/lemone112/labpics-dashboard/milestone/20) | ALL | XL |
| | **Total** | | **51** | | | |

Effort: S = 1–2 days, M = 3–5 days, L = 5–8 days, XL = 8–12 days

---

## Iter 25 — Performance & Caching

**Category:** Performance
**Priority:** HIGH
**Why:** Dashboard LCP ~3s, API p95 ~800ms. RSC streaming cuts perceived load time
by 50%. Multi-tier cache reduces API costs by 70% and backend load by 3–5x.

| # | Task | Issue | Description |
|---|------|-------|-------------|
| 25.1 | RSC + Streaming: portfolio overview | [#221](https://github.com/lemone112/labpics-dashboard/issues/221) | Server Components for dashboard with `<Suspense>` streaming |
| 25.2 | RSC + Streaming: control-tower sections | [#222](https://github.com/lemone112/labpics-dashboard/issues/222) | All 6 sections with parallel server-side data loading |
| 25.3 | RSC: projects и login | [#223](https://github.com/lemone112/labpics-dashboard/issues/223) | Minimal client JS for auth flow |
| 25.4 | HTTP Cache-Control headers | [#224](https://github.com/lemone112/labpics-dashboard/issues/224) | stale-while-revalidate + ETag for read endpoints |
| 25.5 | Redis cache expansion | [#225](https://github.com/lemone112/labpics-dashboard/issues/225) | Cover all read-heavy endpoints with event-driven invalidation |
| 25.6 | Materialized view auto-refresh | [#226](https://github.com/lemone112/labpics-dashboard/issues/226) | Scheduler job for mv_portfolio_dashboard REFRESH CONCURRENTLY |
| 25.7 | Dynamic imports for Recharts | [#227](https://github.com/lemone112/labpics-dashboard/issues/227) | Code-split per chart type, -80KB first-load JS |
| 25.8 | Bundle size budget in CI | [#229](https://github.com/lemone112/labpics-dashboard/issues/229) | <200KB first-load JS gate, delta report in PRs |
| 25.9 | Dead code elimination | [#231](https://github.com/lemone112/labpics-dashboard/issues/231) | Remove 4 orphan backend services (~2000 LOC) |

**Exit criteria:**
- [ ] LCP < 1.5s on dashboard (was ~3s)
- [ ] API p95 < 50ms for cached endpoints (was ~800ms)
- [ ] Bundle first-load JS < 200KB
- [ ] Zero dead code services in backend

**Business impact:** LCP -50% → retention improvement. Cache → OpenAI costs -70%.

---

## Iter 26 — API Architecture & DX

**Category:** Architecture & Developer Experience
**Priority:** HIGH
**Why:** `index.js` is 94KB/2300 LOC monolith. No API versioning. No rate limiting
on expensive endpoints. Developer velocity bottleneck.

| # | Task | Issue | Description |
|---|------|-------|-------------|
| 26.1 | Extract routes → modules | [#228](https://github.com/lemone112/labpics-dashboard/issues/228) | 13 route modules, index.js → 200 LOC orchestrator |
| 26.2 | API versioning (/v1/) | [#230](https://github.com/lemone112/labpics-dashboard/issues/230) | /v1/ prefix, backward-compatible redirects |
| 26.3 | Per-endpoint rate limiting | [#232](https://github.com/lemone112/labpics-dashboard/issues/232) | Redis-backed sliding window, X-RateLimit headers |
| 26.4 | OpenAPI auto-generation | [#233](https://github.com/lemone112/labpics-dashboard/issues/233) | From Zod schemas, Swagger UI at /docs |
| 26.5 | Feature flags: DB + API + hook | [#234](https://github.com/lemone112/labpics-dashboard/issues/234) | `useFeatureFlag()`, `<FeatureGate>`, gradual rollout |
| 26.6 | Feature flags: admin UI | [#236](https://github.com/lemone112/labpics-dashboard/issues/236) | /settings/flags page, toggle/slider controls |
| 26.7 | Structured logging | [#238](https://github.com/lemone112/labpics-dashboard/issues/238) | JSON request/response logs for Grafana/Loki |
| 26.8 | API contract testing | [#240](https://github.com/lemone112/labpics-dashboard/issues/240) | Automated response shape validation |

**Exit criteria:**
- [ ] index.js ≤ 200 LOC
- [ ] All endpoints under /v1/ prefix
- [ ] Rate limiting on LightRAG, sync, embeddings endpoints
- [ ] OpenAPI spec auto-generated and served
- [ ] Feature flags operational

**Business impact:** Dev velocity +35%. Deployment risk → 0 with feature flags. Partner API ready.

---

## Iter 27 — Multi-user & RBAC

**Category:** Authentication & Authorization
**Priority:** CRITICAL (revenue gate)
**Why:** Single-user auth blocks B2B sales. Each additional seat = revenue.
Viewer role enables stakeholders who don't use dashboard daily.

| # | Task | Issue | Description |
|---|------|-------|-------------|
| 27.1 | DB schema: users, teams, roles | [#235](https://github.com/lemone112/labpics-dashboard/issues/235) | owner/admin/manager/viewer roles, project_access |
| 27.2 | Auth upgrade: session + refresh | [#237](https://github.com/lemone112/labpics-dashboard/issues/237) | Refresh tokens, rate-limited login, OWASP compliant |
| 27.3 | Invitation flow | [#239](https://github.com/lemone112/labpics-dashboard/issues/239) | Email invite, accept, expire, resend |
| 27.4 | Permission middleware | [#241](https://github.com/lemone112/labpics-dashboard/issues/241) | requireAuth(), requireRole(), requireProjectAccess() |
| 27.5 | Frontend: team management | [#242](https://github.com/lemone112/labpics-dashboard/issues/242) | /settings/team page, invite/remove/change role |
| 27.6 | Frontend: user profile | [#243](https://github.com/lemone112/labpics-dashboard/issues/243) | /settings/profile, password change, sessions |
| 27.7 | Role-based UI | [#244](https://github.com/lemone112/labpics-dashboard/issues/244) | Hide mutations for viewer, `<RequireRole>` component |
| 27.8 | Project-level access control | [#245](https://github.com/lemone112/labpics-dashboard/issues/245) | Per-team project access (full/readonly/none) |
| 27.9 | Audit trail: user actions | [#246](https://github.com/lemone112/labpics-dashboard/issues/246) | user_id in audit_events, /settings/audit page |

**Exit criteria:**
- [ ] Multiple users can register and login
- [ ] Team invitation flow works end-to-end
- [ ] Viewer role sees read-only dashboard
- [ ] Project access restricted per team
- [ ] All mutations audit-logged with user_id

**Business impact:** Enables multi-seat B2B sales. Viral growth through invitations.

---

## Iter 28 — Engagement & Notifications

**Category:** User Engagement
**Priority:** HIGH
**Why:** Users must open dashboard to see updates. Proactive notifications drive
DAU +25–40%. Optimistic UI makes app feel 10x faster.

| # | Task | Issue | Description |
|---|------|-------|-------------|
| 28.1 | Notification DB schema | [#247](https://github.com/lemone112/labpics-dashboard/issues/247) | subscriptions, notifications, delivery_log |
| 28.2 | Event triggers | [#248](https://github.com/lemone112/labpics-dashboard/issues/248) | Risk threshold, sync failure, signal created |
| 28.3 | Web Push | [#249](https://github.com/lemone112/labpics-dashboard/issues/249) | VAPID keys, Service Worker, push delivery |
| 28.4 | Email delivery | [#250](https://github.com/lemone112/labpics-dashboard/issues/250) | Loops/SMTP integration, templates, throttle |
| 28.5 | Telegram delivery | [#251](https://github.com/lemone112/labpics-dashboard/issues/251) | MCP server integration, inline keyboard actions |
| 28.6 | Notification preferences UI | [#252](https://github.com/lemone112/labpics-dashboard/issues/252) | /settings/notifications, event × channel matrix |
| 28.7 | Optimistic UI mutations | [#253](https://github.com/lemone112/labpics-dashboard/issues/253) | React Query useMutation + rollback |
| 28.8 | Search infrastructure | [#254](https://github.com/lemone112/labpics-dashboard/issues/254) | pg_trgm + GIN indexes, unified /v1/search/quick |
| 28.9 | Cmd+K command palette | [#256](https://github.com/lemone112/labpics-dashboard/issues/256) | cmdk library, navigation + search + actions |

**Exit criteria:**
- [ ] Notifications delivered via push, email, Telegram
- [ ] User controls notification preferences
- [ ] Optimistic updates for all common mutations
- [ ] Cmd+K palette functional with live search

**Business impact:** DAU +30%. Task completion +20%. Power user retention via Cmd+K.

---

## Iter 29 — Platform & Integrations

**Category:** Platform Capabilities
**Priority:** HIGH
**Why:** Transforms product from "closed dashboard" to "platform". Webhooks enable
external integrations. Data export expands user base. Job observability builds ops trust.

| # | Task | Issue | Description |
|---|------|-------|-------------|
| 29.1 | Webhook schema + API | [#255](https://github.com/lemone112/labpics-dashboard/issues/255) | CRUD, HTTPS validation, per-team |
| 29.2 | Webhook dispatch + HMAC | [#257](https://github.com/lemone112/labpics-dashboard/issues/257) | Async dispatch, retry with backoff, circuit breaker |
| 29.3 | Webhook management UI | [#258](https://github.com/lemone112/labpics-dashboard/issues/258) | /settings/webhooks, delivery log, test button |
| 29.4 | Data export: CSV/XLSX | [#259](https://github.com/lemone112/labpics-dashboard/issues/259) | Streaming export for all table entities |
| 29.5 | Data export: PDF reports | [#260](https://github.com/lemone112/labpics-dashboard/issues/260) | Async generation, templates, branding |
| 29.6 | Scheduled reports | [#261](https://github.com/lemone112/labpics-dashboard/issues/261) | Cron-like schedule, email delivery |
| 29.7 | Job observability dashboard | [#262](https://github.com/lemone112/labpics-dashboard/issues/262) | /ops page with queue metrics, failure rates, SLA |
| 29.8 | Shareable links | [#263](https://github.com/lemone112/labpics-dashboard/issues/263) | Temporary read-only snapshots with token auth |

**Exit criteria:**
- [ ] Webhooks deliver events with HMAC signing
- [ ] CSV/XLSX export works for all tables
- [ ] PDF reports generate with professional layout
- [ ] Scheduled reports deliver on time
- [ ] /ops page shows job health metrics

**Business impact:** Platform play (webhook integrations). User base expansion (share/export).

---

## Iter 30 — Offline, Personalization & Enterprise

**Category:** Enterprise & Advanced UX
**Priority:** MEDIUM (high for specific verticals)
**Why:** PWA enables mobile-first usage in unstable network environments (labs).
Personalization increases daily engagement. Encryption unlocks enterprise contracts.

| # | Task | Issue | Description |
|---|------|-------|-------------|
| 30.1 | PWA: Service Worker + Workbox | [#264](https://github.com/lemone112/labpics-dashboard/issues/264) | Cache-first static, network-first API, install prompt |
| 30.2 | PWA: offline data cache | [#265](https://github.com/lemone112/labpics-dashboard/issues/265) | IndexedDB for last dashboard data |
| 30.3 | PWA: offline action queue | [#266](https://github.com/lemone112/labpics-dashboard/issues/266) | Background sync for queued mutations |
| 30.4 | E2E encryption: sensitive data | [#267](https://github.com/lemone112/labpics-dashboard/issues/267) | pgcrypto AES-256, column-level, key rotation |
| 30.5 | Encryption audit log | [#268](https://github.com/lemone112/labpics-dashboard/issues/268) | Decrypt access logging, anomaly detection |
| 30.6 | Personalization: usage tracking | [#269](https://github.com/lemone112/labpics-dashboard/issues/269) | user_activity table, aggregation, privacy |
| 30.7 | Personalization: smart dashboard | [#270](https://github.com/lemone112/labpics-dashboard/issues/270) | "Для вас" section, smart ordering, nudges |
| 30.8 | Customizable layout | [#271](https://github.com/lemone112/labpics-dashboard/issues/271) | Drag-and-drop widget grid, persist per user |

**Exit criteria:**
- [ ] PWA installable, Lighthouse PWA > 90
- [ ] Dashboard shows cached data when offline
- [ ] Sensitive data encrypted at rest
- [ ] Dashboard adapts to user behavior
- [ ] Layout customizable via drag-and-drop

**Business impact:** Mobile session +25%. Enterprise compliance (SOC 2/GDPR). DAU/WAU +20%.

---

## Effort Estimate

| Iter | Tasks | Effort | Calendar (1 dev) |
|------|-------|--------|------------------|
| 25 | 9 | L (5–8d) | Week 1–2 |
| 26 | 8 | L (5–8d) | Week 1–2 (parallel with 25) |
| 27 | 9 | XL (8–12d) | Week 3–4 |
| 28 | 9 | XL (8–12d) | Week 5–6 |
| 29 | 8 | L (5–8d) | Week 5–6 (parallel with 28) |
| 30 | 8 | XL (8–12d) | Week 7–8 |
| **Total** | **51** | | **~8 weeks** |

---

## Labels

| Label | Color | Description |
|-------|-------|-------------|
| `performance` | #0E8A16 | Performance optimization |
| `architecture` | #1D76DB | Architecture & developer experience |
| `auth` | #B60205 | Authentication & authorization |
| `engagement` | #FBCA04 | User engagement & notifications |
| `platform` | #5319E7 | Platform capabilities & integrations |
| `enterprise` | #006B75 | Enterprise features & compliance |
