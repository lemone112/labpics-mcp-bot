# Frontend plan (Next.js + TypeScript) — iteration 1

## Context from current docs

Canonical docs reviewed:

- `docs/product/overview.md`
- `docs/mvp-vs-roadmap.md`
- `docs/specs/0001-multiproject-rag-scope.md`
- `docs/specs/0009-web-ia-pages-navigation.md`
- `docs/specs/0002`, `0003`, `0004`, `0005`, `0006`, `0007`, `0008`
- `docs/specs/0010..0016` (CRM/Revenue roadmap)

## Priority functionality (frontend perspective)

### P0 (must be strong now)

1. Auth + session awareness (`/login`, `/auth/me`).
2. Project selection as explicit scope guard (`/projects`, active project state).
3. Jobs control and observability (`/jobs` + statuses/counters/errors).
4. Evidence-first retrieval (`/search` + source IDs).
5. SaaS shell UX consistency:
   - sidebar + top bar
   - dense but readable cards/tables
   - clear empty states with CTA

### P1 (next after iteration 1)

1. Dashboard as "5-minute value" page:
   - what is active
   - what is hot
   - what to do next
2. Conversations reader with list -> details panel pattern.
3. UI scaffolding for:
   - Commitments
   - Risks
   - Digest
   - Settings/links
4. Visual support for evidence and project safety hints.

### P2 (later roadmap)

1. CRM core (Accounts/Opportunities, spec 0010).
2. Signals + NBA inbox (0011).
3. Offer/SOW builder (0012).
4. Campaigns/compliance (0013).
5. Health radar (0014).
6. Case library (0015).
7. Revenue analytics (0016).

## Frontend architecture plan (Next + TS)

1. Move web app from JS/JSX to TS/TSX.
2. Keep UI stack in shadcn-style primitives on Tailwind:
   - lightweight, composable, low vendor lock-in
   - fits current codebase and existing components
3. Introduce typed API contracts in `web/lib/types.ts`.
4. Keep pages client-first for iteration 1; defer server components optimization.
5. Build reusable shell:
   - `AppSidebar`
   - `PageShell` with top bar
   - status badges + empty states + metrics

## Visual direction (benchmark references)

Target qualities inspired by Linear / Attio / Plane / ClickUp:

- compact information density
- low-noise dark UI
- predictable spacing and list semantics
- actions visible where decision is made
- "current context" always obvious (active project)

## Self-critical gaps and risks

1. **Search scoping risk (critical):** backend `POST /search` is not project-scoped yet.
   - **Resolved in iteration 2:** `rag_chunks` received `project_id`, API now enforces `active_project_id` and scoped search.
2. **Roadmap entities missing API:** risks/digest/settings links are not fully backed by server endpoints yet.
   - Iteration 2 connected `commitments` with project-scoped API + DB persistence.
3. **Linking UX incomplete:** no full project-source linking editor in backend yet (spec 0006).
4. **Audit/privacy surface incomplete:** UI should avoid raw full-text dumps in list views by default (spec 0008).

## Iteration 1 delivery (implementation target)

1. TypeScript baseline in `web/`.
2. Updated SaaS shell/navigation.
3. Working pages:
   - Dashboard (partial, mixed real data + roadmap placeholders)
   - Projects
   - Jobs
   - Search
   - Conversations
4. Roadmap-ready pages with explicit status:
   - Commitments
   - Risks
   - Digest
   - Settings

## Done criteria for this iteration

1. Frontend builds on Next.js with TypeScript.
2. User can log in, select project, run jobs, search evidence, inspect conversations.
3. Empty states and project-scope UX are explicit.
4. Roadmap sections are visible but transparently marked as not fully connected.
