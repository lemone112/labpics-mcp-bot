# Wave 3 — Full Iteration Plan (Iter 44–51)

> Status: **Wave 2 complete** (Iter 10–19, design system + component library done)
> Open from Wave 2: Iter 11 (LightRAG), 15–16 (TS/QA), 17 (Analytics), 20–26 (UX/Charts/Mobile/A11y/Perf/API)
> Closed aspirational: Iter 27–43 (roadmap placeholders — superseded by this plan)
>
> **Source:** Infrastructure audit (Feb 2026), business Q&A session, 5 research reports:
> - Web server / Caddy analysis
> - Search system (pgvector + pg_trgm) architecture review
> - Logging / Monitoring stack audit (Prometheus + Grafana + Loki)
> - Task queue / Scheduler analysis
> - Full business readiness audit
>
> **Context:** Design studio lab.pics, 2–5 PMs + Owner, 5–10 active projects,
> $5–20K avg project, 1–3 month duration, startups/IT clients.
> Deploy: VPS with Docker Compose. Target: possibly SaaS later.

---

## Business priorities (from Q&A session)

1. **Multi-user access** — Owner sees all, PM sees assigned projects. Critical for team.
2. **Telegram bot** — whole PM team uses it, CryptoBot-style buttons, voice input.
3. **Monitoring in dashboard** — no separate Grafana, embed key metrics in UI.
4. **Automated reports** — project status + financial overview + team KPI.
5. **Search improvements** — core product feature, needs better UX.
6. **Parallel connector sync** — 3x performance bottleneck, easy fix.

---

## Dependency Graph

```
Iter 44 (Scheduler) ──────────────────┐
Iter 45 (Search UX) ───────────────────┼──→ Iter 48 (Reporting)
Iter 46 (Monitoring UI) ───────────────┤
Iter 47 (Infrastructure) ─────────────┘
                                       │
Iter 49 (Multi-user) ─ requires 44,46 ─┘
                                       │
Iter 50 (TG Bot MVP) ─ requires 11 ───┤
Iter 51 (TG Bot Advanced) ─ req 50 ───┘
```

**Critical path:** Iter 44 (quick wins) → 49 (multi-user) → 50 (TG bot)
**Parallel:** Iter 45, 46, 47 can run independently
**Blocked:** Iter 50 depends on Iter 11 (LightRAG) for search integration

---

## Summary

| Iter | Name | Priority | Tasks | Depends on | Est. effort |
|------|------|----------|-------|------------|-------------|
| **44** | Scheduler & Connector Reliability | P0 | 7 | — | S |
| **45** | Search UX & Intelligence | P0 | 8 | — | M |
| **46** | System Monitoring UI | P1 | 7 | — | M |
| **47** | Infrastructure Hardening | P1 | 6 | — | S |
| **48** | Automated Reporting | P1 | 6 | 44, 46 | M |
| **49** | Multi-User & Access Control | P0 | 8 | — | L |
| **50** | Telegram Bot MVP | P0 | 8 | 11 | L |
| **51** | Telegram Bot Advanced | P1 | 7 | 50 | L |
| | **Total** | | **57** | | |

Effort: S = 1–2 days, M = 3–5 days, L = 5–8 days

---

## Iter 44 — Scheduler & Connector Reliability (P0)

**Goal:** Fix 3x connector bottleneck, improve job observability, harden scheduler.

**Research finding:** Sequential connector execution (`for (const c of CONNECTORS) { await runConnectorSync(...) }` in `connector-sync.js:168`) takes 15min instead of 5min with Promise.all. PostgreSQL scheduler with `FOR UPDATE SKIP LOCKED` is sound but lacks observability.

| # | Task | Priority | Notes |
|---|------|----------|-------|
| 44.1 | Parallel connector sync (Promise.all with per-connector error isolation) | P0 | 3x speedup, ~2h work |
| 44.2 | Job duration metrics (histogram per job type) | P0 | prom-client histogram |
| 44.3 | Dead job detection and auto-cleanup (stuck > 30min) | P1 | UPDATE SET status='failed' WHERE started_at < now()-30min |
| 44.4 | Job retry with configurable backoff per job type | P1 | Currently hard-coded delays |
| 44.5 | Connector sync progress events via SSE | P1 | Real-time sync status in UI |
| 44.6 | Job execution concurrency limit (configurable max parallel) | P2 | Prevent resource exhaustion |
| 44.7 | Scheduler health endpoint (last tick time, queue depth) | P2 | For monitoring integration |

---

## Iter 45 — Search UX & Intelligence (P0)

**Goal:** Improve search from "functional" to "delightful". Core product feature.

**Research finding:** Current search has no debounce, no autocomplete, no date filters, no pagination. 25s timeout is too long. No search analytics. pgvector + pg_trgm is sufficient for 5–10 projects — Elasticsearch NOT recommended.

| # | Task | Priority | Notes |
|---|------|----------|-------|
| 45.1 | Search input debounce (300ms) + loading indicator | P0 | UX quick win |
| 45.2 | Search results pagination (offset/limit + UI) | P0 | Currently returns all results |
| 45.3 | Date range filter (from/to) on search | P0 | Filter by message/issue date |
| 45.4 | Source type filter chips (Chatwoot / Linear / Attio) | P1 | Already has source param, needs UI |
| 45.5 | Search query analytics (log queries + popular queries endpoint) | P1 | Table: search_queries(query, user, project, results_count, ts) |
| 45.6 | Fuzzy matching tolerance (pg_trgm similarity threshold) | P1 | `SET pg_trgm.similarity_threshold = 0.3` |
| 45.7 | Search autocomplete suggestions (recent queries + entity names) | P2 | Dropdown below search input |
| 45.8 | Reduce search timeout from 25s to 10s + progressive loading | P2 | Show partial results as they arrive |

---

## Iter 46 — System Monitoring UI (P1)

**Goal:** Embed key system metrics in dashboard UI. No separate Grafana needed.

**Research finding:** Full Prometheus + Grafana + Loki stack already deployed in `docker-compose.monitoring.yml`. 37+ metrics at `/metrics`. 11 alert rules configured. Just needs embedding in UI.

| # | Task | Priority | Notes |
|---|------|----------|-------|
| 46.1 | System Health page: service status cards (API, DB, Redis, Worker) | P0 | New page in nav: "System" |
| 46.2 | Job dashboard: last runs table + duration sparklines | P0 | Data from /jobs/status + new metrics |
| 46.3 | Connector sync status visualization (timeline + success rate) | P1 | Per-connector cards with charts |
| 46.4 | Resource usage indicators (DB pool, Redis memory, disk) | P1 | Expose via new /system/resources endpoint |
| 46.5 | Alert history feed (recent Prometheus alerts in UI) | P1 | Read from alertmanager API or custom store |
| 46.6 | Log viewer (recent errors, searchable) | P2 | Tail Loki via API, display in UI |
| 46.7 | System health SSE events (real-time status updates) | P2 | Push health changes to UI |

---

## Iter 47 — Infrastructure Hardening (P1)

**Goal:** Production-grade infrastructure for VPS deployment.

**Research finding:** Caddy 2.9.1 handles TLS/compression/routing well. Missing: HTTP/2 push, CDN for static assets, automated backups, DDoS protection.

| # | Task | Priority | Notes |
|---|------|----------|-------|
| 47.1 | Caddy: enable HTTP/2 + verify HTTP/3 (QUIC) | P1 | Caddy supports by default, verify config |
| 47.2 | Static asset CDN headers (Cache-Control immutable for _next/static) | P1 | Add to Caddyfile |
| 47.3 | Automated PostgreSQL backup (pg_dump cron + retention) | P0 | Daily backup, 7-day retention, S3/local |
| 47.4 | fail2ban integration for SSH + API brute force | P1 | Or Caddy rate-limit module |
| 47.5 | Docker healthcheck improvements (all services) | P2 | Consistent healthcheck across compose |
| 47.6 | Deployment automation script (zero-downtime docker compose) | P2 | Rolling restart with health gate |

---

## Iter 48 — Automated Reporting (P1)

**Goal:** PM doesn't manually compile status reports. System generates them.

**Business context:** PMs waste time on manual reporting. Need automated project status, financial overview, team KPI. Export not needed now (backlog).

| # | Task | Priority | Notes |
|---|------|----------|-------|
| 48.1 | Report data model (report_templates, report_runs, report_snapshots) | P0 | DB schema + CRUD |
| 48.2 | Project status report generator (automated weekly) | P0 | Aggregates: tasks, risks, messages, commitments |
| 48.3 | Financial overview report generator (monthly) | P1 | Revenue, costs, margin per project |
| 48.4 | Team KPI dashboard (utilization, response time, delivery rate) | P1 | Cross-project team metrics |
| 48.5 | Report scheduling (cron-based, configurable per report type) | P1 | Integrate with scheduler |
| 48.6 | Report viewer UI (history + current + comparison) | P1 | New page: "Reports" |

---

## Iter 49 — Multi-User & Access Control (P0)

**Goal:** Support 2–5 PMs + Owner with proper access isolation.

**Business context:** Owner sees all projects, PM sees only assigned. Currently single-user bcrypt auth. Need: users table, roles, project-scoped access, team management.

| # | Task | Priority | Notes |
|---|------|----------|-------|
| 49.1 | DB schema: users table (id, email, name, password_hash, role, created_at) | P0 | Roles: owner, pm |
| 49.2 | Auth upgrade: multi-user login (email + password) | P0 | Replace single AUTH_CREDENTIALS |
| 49.3 | Session upgrade: user_id in sessions, multi-session support | P0 | Current session model + user_id FK |
| 49.4 | Permission middleware: role-based route protection | P0 | Owner=all, PM=assigned projects |
| 49.5 | Project-user assignment table + API | P0 | project_users(project_id, user_id, role) |
| 49.6 | Team management UI (invite, assign to projects, manage roles) | P1 | Owner-only page |
| 49.7 | User profile page (name, password change) | P2 | Self-service |
| 49.8 | Audit trail: user_id in audit events | P1 | Who did what |

---

## Iter 50 — Telegram Bot MVP (P0)

**Goal:** PM team uses TG bot for quick status checks and actions.

**Business context:** CryptoBot-style inline buttons, whole team uses it. Must mirror key dashboard features. Bot code exists in `telegram-bot/` (TypeScript, Docker, Supabase).

**Depends on:** Iter 11 (LightRAG) for search integration.

| # | Task | Priority | Notes |
|---|------|----------|-------|
| 50.1 | Bot auth: link TG user to dashboard user (token-based pairing) | P0 | telegram_user_links table |
| 50.2 | Button navigation: main menu (Status / Search / Tasks / CRM / Digests) | P0 | CryptoBot-style inline keyboards |
| 50.3 | Status command: project summary card (tasks, risks, messages count) | P0 | Formatted message with stats |
| 50.4 | Search integration: free text query → LightRAG → formatted results | P0 | Forward to /lightrag/query |
| 50.5 | Task list: show Linear tasks by project (with status buttons) | P1 | Read from Linear via API |
| 50.6 | CRM quick view: recent Attio opportunities with stage | P1 | Read from Attio API |
| 50.7 | Push notifications: risks + approaching deadlines | P0 | Scheduler-triggered, configurable |
| 50.8 | Push notifications: new client messages (Chatwoot) | P1 | On sync event, notify assigned PM |

---

## Iter 51 — Telegram Bot Advanced (P1)

**Goal:** Full AI-powered assistant with voice and actions.

**Business context:** Composio MCP for Linear + Attio actions, Whisper voice-to-text, proactive daily/weekly digests.

**Depends on:** Iter 50 (TG Bot MVP).

| # | Task | Priority | Notes |
|---|------|----------|-------|
| 51.1 | Composio MCP integration: Linear actions (create/update tasks) | P0 | Via MCP protocol |
| 51.2 | Composio MCP integration: Attio actions (update deals, add notes) | P0 | Via MCP protocol |
| 51.3 | Free text NLU: parse intent from text message → route to action | P1 | LLM-based intent extraction |
| 51.4 | Whisper voice input: voice message → text → NLU → action | P0 | OpenAI Whisper API |
| 51.5 | Proactive daily digest (morning summary per PM) | P1 | Scheduled at 09:00, customizable |
| 51.6 | Proactive weekly digest (weekly wrap-up with trends) | P1 | Scheduled Monday 10:00 |
| 51.7 | Voice command shortcuts (status, search, notes) | P2 | Whisper → intent → quick action |

---

## Backlog (post Wave 3)

These items are tracked for future planning but not scheduled:

| Area | Item | Notes |
|------|------|-------|
| **Integrations** | Email connector (Gmail/Outlook) | Sync client emails into timeline |
| **Integrations** | File attachments (S3/R2) | Upload/attach files to projects |
| **Integrations** | Google Calendar connector | Sync meetings, deadlines |
| **Integrations** | GitHub connector (dev metrics) | PR velocity, deployment frequency |
| **Finance** | Invoicing integration (Stripe/manual) | Generate + track invoices |
| **Finance** | Budget tracking per project | Cost vs budget alerts |
| **Platform** | Client portal (read-only) | Client sees project status |
| **Platform** | SaaS multi-tenancy | Org isolation, billing, onboarding |
| **Platform** | PDF/XLSX export | Report export for offline sharing |
| **Platform** | BullMQ job queue migration | If >10 projects or >5 concurrent users |
| **Platform** | Webhook system (outgoing) | Notify external systems on events |
| **AI** | Sentiment analysis on messages | Detect negative sentiment trends |
| **AI** | Predictive churn model | Risk scoring from engagement patterns |
| **AI** | Cross-sell/upsell engine | Suggest services based on project data |

---

## Changelog

- **v1** (2026-02-20): Initial Wave 3 plan based on 5 research reports + 6-round Q&A session.
  57 tasks across 8 iterations (Iter 44–51). Supersedes closed Iter 27–43 aspirational issues.
