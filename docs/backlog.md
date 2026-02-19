# Бэклог (Product Backlog)

> Обновлено: 2026-02-19
> Roadmap: [`docs/mvp-vs-roadmap.md`](./mvp-vs-roadmap.md)
> Wave 2: [`docs/iteration-plan-wave2.md`](./iteration-plan-wave2.md)
> Wave 3: [`docs/iteration-plan-wave3-design.md`](./iteration-plan-wave3-design.md)
> Wave 4: [`docs/iteration-plan-wave4-growth.md`](./iteration-plan-wave4-growth.md)
> Wave 5: [`docs/iteration-plan-wave5-intelligence.md`](./iteration-plan-wave5-intelligence.md)
> **Source of truth:** [GitHub Issues & Milestones](https://github.com/lemone112/labpics-dashboard/milestones)

---

## Roadmap Overview (5 волн, 35 итераций, 307 задач)

| Wave | Iterations | Issues | Статус | Фокус |
|------|-----------|--------|--------|-------|
| **Wave 1** | Iter 0–10, 12 | #2–#17 | ✅ **DONE** (77/79) | Platform hardening |
| **Wave 2** | Iter 11–16 | #46–#119 | ⬜ In progress | LightRAG, resilience, TS, QA |
| **Wave 3** | Iter 17–24 | #125–#220 | ⬜ Planned | Design overhaul |
| **Wave 4** | Iter 25–30 | #221–#271 | ⬜ Planned | Strategic growth |
| **Wave 5** | Iter 31–35 | #272–#286 | ⬜ Planned | Client intelligence |

---

## Active Iterations (Wave 2)

### Iter 11 — HKUDS LightRAG Migration + MCP | CRITICAL

> Миграция с custom hybrid RAG на [HKUDS LightRAG](https://github.com/HKUDS/LightRAG) из форка [`lemone112/lightrag`](https://github.com/lemone112/lightrag).
> Задачи: [GitHub Milestone](https://github.com/lemone112/labpics-dashboard/milestone/1) (#46–#55)

### Iter 13 — Frontend Resilience & Auth | HIGH

> Задачи: [GitHub Milestone](https://github.com/lemone112/labpics-dashboard/milestone/2) (#56–#66, #114, #116)

### Iter 14 — Design System & Accessibility | MEDIUM

> Задачи: [GitHub Milestone](https://github.com/lemone112/labpics-dashboard/milestone/3) (#67–#76, #103–#108, #115)

### Iter 15 — TypeScript, CI/CD & Infrastructure | MEDIUM

> Задачи: [GitHub Milestone](https://github.com/lemone112/labpics-dashboard/milestone/4) (#77–#90)

### Iter 16 — QA & Release Readiness | HIGH

> Задачи: [GitHub Milestone](https://github.com/lemone112/labpics-dashboard/milestone/5) (#91–#102, #117–#119)

---

## Planned Iterations (Wave 3 — Design Overhaul)

| Iter | Название | Milestone | Issues |
|------|----------|-----------|--------|
| 17 | Analytics Instrumentation | [6](https://github.com/lemone112/labpics-dashboard/milestone/6) | #125–#134 |
| 18 | Design System Foundations | [7](https://github.com/lemone112/labpics-dashboard/milestone/7) | #131–#153 |
| 19 | Component Library Overhaul | [8](https://github.com/lemone112/labpics-dashboard/milestone/8) | #147–#198 |
| 20 | UX Logic & Information Architecture | [9](https://github.com/lemone112/labpics-dashboard/milestone/9) | #138–#171 |
| 20.5 | Charts & Data Visualization | [10](https://github.com/lemone112/labpics-dashboard/milestone/10) | #152–#196 |
| 21 | Page-Level Redesign | [11](https://github.com/lemone112/labpics-dashboard/milestone/11) | #158–#200 |
| 22 | Mobile & Responsive | [12](https://github.com/lemone112/labpics-dashboard/milestone/12) | #175–#201 |
| 23 | Accessibility, Polish & Dark Mode | [13](https://github.com/lemone112/labpics-dashboard/milestone/13) | #202–#211 |
| 24 | Design Validation & QA | [14](https://github.com/lemone112/labpics-dashboard/milestone/14) | #212–#220 |

---

## Planned Iterations (Wave 4 — Strategic Growth)

| Iter | Название | Milestone | Issues | Бизнес-impact |
|------|----------|-----------|--------|---------------|
| 25 | Performance & Caching | [15](https://github.com/lemone112/labpics-dashboard/milestone/15) | #221–#231 | LCP -50%, API costs -70% |
| 26 | API Architecture & DX | [16](https://github.com/lemone112/labpics-dashboard/milestone/16) | #228–#240 | Dev velocity +35% |
| 27 | Multi-user & RBAC | [17](https://github.com/lemone112/labpics-dashboard/milestone/17) | #235–#246 | Revenue gate (multi-seat) |
| 28 | Engagement & Notifications | [18](https://github.com/lemone112/labpics-dashboard/milestone/18) | #247–#256 | DAU +30% |
| 29 | Platform & Integrations | [19](https://github.com/lemone112/labpics-dashboard/milestone/19) | #255–#263 | Platform play |
| 30 | Offline, Personalization & Enterprise | [20](https://github.com/lemone112/labpics-dashboard/milestone/20) | #264–#271 | Enterprise compliance |

---

## Planned Iterations (Wave 5 — Client Intelligence)

| Iter | Название | Milestone | Issues | Бизнес-impact |
|------|----------|-----------|--------|---------------|
| 31 | Client Health & Signals | [21](https://github.com/lemone112/labpics-dashboard/milestone/21) | #272–#279 | Proactive client management |
| 32 | Predictive Intelligence | [22](https://github.com/lemone112/labpics-dashboard/milestone/22) | #274–#278 | Churn reduction -25% |
| 33 | Revenue & Operations Analytics | [23](https://github.com/lemone112/labpics-dashboard/milestone/23) | #280–#282 | Margin visibility |
| 34 | Automation & Workflows | [24](https://github.com/lemone112/labpics-dashboard/milestone/24) | #283–#286 | Team efficiency +30% |
| 35 | Reporting & Executive Layer | [25](https://github.com/lemone112/labpics-dashboard/milestone/25) | #284 | QBR time: 4h → 60s |

---

## Known Issues (Open)

| # | Проблема | Файл | Критичность | Решение |
|---|----------|------|-------------|---------|
| B-1 | `hydrateSessionScope()` может вызваться дважды (onRequest + preValidation) | `index.js:506,527` | MEDIUM | Добавить guard flag `request.scopeHydrated` |
| B-2 | 80+ env vars дублируются между server и worker в docker-compose | `docker-compose.yml` | LOW | Вынести в `.env` файл или `env_file` директиву |
| B-3 | `computeClientValueScore()` в JS вместо SQL | `portfolio.js` | LOW | Перенести в matview или SQL function |
| B-4 | `use-project-portfolio.js`: 335 строк, 21 values в context | `web/hooks/` | LOW | Оценено — разделение неоправданно. Оставить as-is |
| B-5 | Vector index tuning (IVFFlat probes / HNSW ef_search) только через env vars | `embeddings.js` | LOW | Будет решено при миграции на HKUDS LightRAG (Iter 11) |
| B-6 | Нет pre-built Grafana dashboards | `docker-compose.monitoring.yml` | LOW | Datasources provisioned, dashboards вручную |
| B-7 | Custom RAG quality score — proxy metric без ground truth | `lightrag.js` | LOW | Будет заменён quality metrics из HKUDS LightRAG (Iter 11) |

---

## Completed Iterations Summary

| Iter | Название | Задач | Статус |
|------|----------|-------|--------|
| 0 | Security Hardening | 7/7 | ✅ Done |
| 1 | Redis Caching Layer | 8/8 | ✅ Done |
| 2 | Backend Reliability | 5/6 | ✅ Done |
| 3 | Frontend Performance | 5/6 | ✅ Done |
| 4 | Database Optimization | 6/6 | ✅ Done |
| 5 | Observability & Ops | 6/6 | ✅ Done |
| 6 | Data Quality & UX | 5/5 | ✅ Done |
| 7 | Input Validation | 4/4 | ✅ Done |
| 8 | Security Hardening II | 7/7 | ✅ Done |
| 9 | Extended Input Validation | 5/5 | ✅ Done |
| 10 | KAG Cleanup + DB Hygiene | 9/9 | ✅ Done |
| 12 | Backend Security & Reliability | 10/10 | ✅ Done |
| **Итого** | | **77/79** | |
