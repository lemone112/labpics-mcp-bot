# Business-first Outbound System (Labpics) — Source of Truth

> **Status:** Draft (v0.1)
> 
> **Goal:** Define a business-driven plan for a fully automated, yet controllable, outbound system across Email (Loops), SMS, Telegram, WhatsApp (via Chatwoot), grounded in the existing `labpics-dashboard` architecture and database schema.
> 
> **Principle:** *Automation without control is a liability.* This document designs automation with explicit guardrails, auditability, and kill-switches.

---

## 0) Executive Summary

Labpics is a premium project-based design studio. Our outbound must feel *human, precise, and respectful*, while being operationally scalable.

We will build an outbound engine that:

- Selects targets from CRM + connectors (Attio / Chatwoot / Linear)
- Computes eligibility & timing (cooldowns, stages, health scores, signals)
- Generates safe, minimal personalization (AI, constrained output)
- Delivers through channels (Email first; SMS/Telegram/WhatsApp later)
- Writes back to CRM (notes/fields) and maintains audit logs
- Is **fully automatic**, but **explicitly controllable**: approvals, rate limits, suppression lists, per-channel policies, and emergency stop.

### What “done” looks like
- Daily, automated outbound runs with predictable volume and no duplicates
- Clear dashboards: volume, replies, winbacks, revenue attribution proxies
- Channel expansion (SMS/WhatsApp/Telegram) without rewriting core logic

---

## 1) Business Requirements (BRD)

### 1.1 Primary business outcomes
1) **Leadgen**: increase qualified inbound conversations via proactive outreach
2) **Reactivation / winback**: bring back dormant/lost accounts at the right moment
3) **Continuity**: reduce churn risk (pre-emptive communication)
4) **Upsell**: identify expansion opportunities and initiate the right conversation

### 1.2 Non-negotiables for a premium studio
- Avoid spam signals: low frequency, high relevance
- Avoid hallucinated claims in AI messages
- Clear opt-out and suppression handling
- Auditability: what was sent, why, to whom, and by what logic

### 1.3 Constraints
- Early-stage product: schema exists, data may be incomplete
- Multiple sources (Attio, Chatwoot, later internal DB) → entity resolution required
- Deliverability risk is existential: start small, prove safety

---

## 2) Core Concepts & Definitions

### 2.1 Entities
- **Account (Company)**: `crm_accounts`
- **Contact (Person)**: resolved identity with one or more channel addresses
- **Opportunity / Deal**: `crm_opportunities`
- **Campaign**: outbound initiative with segments + events

### 2.2 Key fields in existing schema
- `health_scores(score, factors, generated_at)` — account-level maturity/health proxy
- `signals`, `next_best_actions` — reasons for outreach
- `campaigns`, `campaign_members`, `campaign_events` — execution + outcomes
- `outbox` / `outbound_attempts` (existing or planned) — channel send tracking
- `identity_links` — cross-source entity resolution

### 2.3 Outbound decision stages
1) **Candidate discovery** (who)
2) **Eligibility gating** (can we)
3) **Timing & channel selection** (when + where)
4) **Message generation** (what)
5) **Dispatch** (send)
6) **Write-back** (CRM log)
7) **Outcome capture** (reply, click, meeting, etc.)

---

## 3) Business Scenarios (Use Cases)

Each scenario has: trigger → segmentation → channel → message → controls → write-back.

### 3.1 Leadgen — New prospect intro (Email)
- **Trigger:** new qualified prospect enters CRM / imported from Attio
- **Segment:** ICP industries (SaaS/Tech/Payments/Finance/E-com), senior roles
- **Channel:** Email via Loops
- **Message:** short, low-commitment CTA (“OK if I send 3 UI ideas?”)
- **Controls:** 14-day cooldown, daily cap, allowlist in SAFE_MODE
- **Write-back:** Attio note “outreach_sent”, campaign_event row

### 3.2 Leadgen — “No-touch” follow-up
- **Trigger:** no reply after 5–7 days
- **Channel:** Email
- **Controls:** max 1 follow-up, stop if any reply

### 3.3 Reactivation — Inactive account
- **Trigger:** `crm_accounts.stage = inactive` OR last interaction > N days
- **Channel:** Email → WhatsApp (later) if opt-in and available
- **Message:** check-in + small helpful artifact (audit snippet)

### 3.4 Winback — Lost deal cooldown
- **Trigger:** opportunity stage becomes `lost`, wait 30/90 days
- **Message:** new angle: different package/format

### 3.5 Pre-emptive retention (CS play)
- **Trigger:** health score drops sharply OR critical risk radar item
- **Channel:** Email (internal to team) + optional client nudge
- **Controls:** require manual approval for client-facing message

### 3.6 Upsell — Score rebound / expansion signal
- **Trigger:** health score rises above threshold, or NBA suggests expansion
- **Channel:** Email

### 3.7 Multi-channel escalation (later)
- **Rule:** Email first; if no reply and channel policy allows, escalate:
  - WhatsApp (Chatwoot) → Telegram → SMS

---

## 4) Channel Roadmap

### 4.1 Email (Loops) — Phase 1
- Event-based loops (workflow) in Loops, driven by `LOOPS_SO_SEND_EVENT`
- Contact sync to Loops audience
- Dynamic message fields from `eventProperties` (already validated)

### 4.2 WhatsApp + Telegram via Chatwoot — Phase 2
- Use Chatwoot as the single inbox + delivery layer
- Benefits:
  - unified conversation thread
  - agent handoff
  - compliance controls

### 4.3 SMS — Phase 3
- Only for explicit opt-in / transactional-style reminders
- Strict suppression + compliance

---

## 5) Control & Governance (Make it automatic AND manageable)

### 5.1 Global kill-switch
- One env var / setting: `OUTBOUND_ENABLED=false`
- Enforced at dispatch layer

### 5.2 Rate limiting
- Global daily cap
- Per-account cap
- Per-contact cap

### 5.3 Cooldowns
- Default 14 days per contact
- Separate cooldowns per scenario

### 5.4 Suppression lists
- Global unsubscribe
- “Do not contact” flags
- Hard bounce list

### 5.5 Approvals
- Required for:
  - non-email channels
  - retention messages in critical contexts
  - any stage-changing CRM automation

### 5.6 Audit trail
- Every outbound attempt logged with:
  - scenario, reason, payload hash, idempotency key
  - channel, provider response

---

## 6) AI Personalization — Safe-by-design

### 6.1 Scope
- Only generate:
  - subject
  - opening line
  - one reason line
  - yes/no question

### 6.2 Hard constraints
- No unverified claims
- Length caps
- Forbidden phrases list
- Fallback templates always available

### 6.3 Self-critique: risks & mitigations
- **Risk:** hallucination harms premium brand → mitigate with constraints + fallback
- **Risk:** over-personalization feels creepy → limit to high-level context
- **Risk:** inconsistency of voice → fixed style guide + templated framing

---

## 7) Data Quality & Identity Resolution

### 7.1 Why identity graph is mandatory
- Contacts can appear in Attio + Chatwoot + future sources
- Need canonical contact key for cooldown + suppression

### 7.2 Phase plan
- Phase 1: email-keyed identity (fast)
- Phase 2: `identity_links` canonical IDs

---

## 8) Iterations & Task Plan (Wave-based)

> Guiding rule: **ship value every iteration**. Prefer thin vertical slices.

### Iter 0 — Foundations (CRITICAL)
- [ ] Define canonical identifiers (email + identity_links roadmap)
- [ ] Create suppression/cooldown schema and idempotency policy
- [ ] Add global kill-switch & daily cap
- [ ] Add structured audit events for outbound

### Iter 1 — Email MVP (Leadgen) (CRITICAL)
- [ ] Candidate selection from Attio (ICP filters)
- [ ] Loops contact upsert + event trigger
- [ ] Dynamic email content from event properties
- [ ] Write-back to Attio via Notes (idempotency-aware)
- [ ] SAFE_MODE allowlist + dry-run mode

### Iter 2 — Follow-up & basic outcome tracking (HIGH)
- [ ] Follow-up scheduler (single follow-up)
- [ ] Capture basic outcomes (manual tagging + placeholders)
- [ ] Dashboard: sent counts + reasons + skips

### Iter 3 — AI personalization v1 (HIGH)
- [ ] Add AI constrained personalization (2 lines + question)
- [ ] Add validation + fallback
- [ ] Store prompt/output hashes in audit

### Iter 4 — Winback scenarios (MEDIUM)
- [ ] Inactive account reactivation
- [ ] Lost deal cooldown
- [ ] Governance: approvals for sensitive scenarios

### Iter 5 — Chatwoot channels (WhatsApp/Telegram) (MEDIUM)
- [ ] Outbound via Chatwoot messages
- [ ] Unify conversation logging
- [ ] Agent handoff process

### Iter 6 — SMS (LOW / gated)
- [ ] SMS provider integration
- [ ] Compliance gating + explicit opt-in

---

## 9) Scaling Considerations

### 9.1 Technical
- Move from per-record operations to batch queries
- Use queueing for bursts
- Partition outbound logs by day/project

### 9.2 Business
- Maintain premium feel: cap volume, prioritize relevance
- Add “human review” for high-stakes accounts

---

## 10) Open Questions (to resolve before expanding scope)
- Which fields in Attio represent lifecycle stage for prospects vs clients?
- Where will we store canonical opt-in / do-not-contact?
- How will we capture replies reliably (Gmail/Chatwoot inbox ingestion)?

---

## Appendix A — Default Templates (fallback)

### Email subject fallback
- 3 идеи по UI?

### Email body fallback
- Привет! Я Даниил из Лабпикс.
- Могу прислать 3 быстрых идеи по UI одним письмом — без созвона.
- Ок, если пришлю?

