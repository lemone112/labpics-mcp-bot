# Спеки (`docs/specs/`)

Эта папка — **поведенческие спеки** (семантические требования): что должно быть истинно, как ведёт себя система, инварианты и acceptance criteria.

- Канонические термины: [`docs/glossary.md`](../glossary.md)
- Правила оформления: [`docs/style-guide.md`](../style-guide.md)
- Границы MVP vs Roadmap: [`docs/mvp-vs-roadmap.md`](../mvp-vs-roadmap.md)

## Индекс (MVP — сейчас, LightRAG-only)

- [0001 — Мультипроектная изоляция памяти (RAG)](./0001-multiproject-rag-scope.md)
- [0006 — Проекты, клиенты и связывание идентичностей](./0006-projects-clients-and-links.md)
- [0007 — Jobs cadence и контроль стоимости](./0007-jobs-cadence-and-cost-control.md)
- [0008 — Аудит, приватность и retention](./0008-audit-privacy-retention.md)
- [0009 — Web IA: страницы и навигация](./0009-web-ia-pages-navigation.md)
- [0017 — Auth v1: логин/пароль, сессии](./0017-auth-login-password-sessions.md)
- [0018 — LightRAG-only режим и API-контракт](./0018-lightrag-only-mode.md)

## Legacy / roadmap (неактивно в текущем релизе)

- [0002 — Commitments v1](./0002-commitments-v1.md)
- [0003 — Risks v1](./0003-risks-v1.md)
- [0004 — Weekly digest v1](./0004-weekly-digest-v1.md)
- [0005 — Интеграции Linear/Attio: preview/apply](./0005-integrations-linear-attio-preview.md)
- [0010 — Accounts & Opportunities (CRM ядро) v1](./0010-accounts-and-opportunities-v1.md)
- [0011 — Signals & Next Best Action](./0011-signals-and-next-best-action.md)
- [0012 — Offers / SOW / Quote Builder](./0012-offers-sow-and-quote-builder.md)
- [0013 — Campaigns / Sequences / Compliance](./0013-campaigns-sequences-and-compliance.md)
- [0014 — Health Score & Risk Radar](./0014-health-score-and-risk-radar.md)
- [0016 — Revenue Analytics / Margin / Forecast](./0016-revenue-analytics-margin-and-forecast.md)

## Примечание по UI

UI shell для MVP фиксирован: **shadcn/ui sidebar-04** (`npx shadcn@latest add sidebar-04`).

## Важное правило релиза

Текущий целевой режим: `LIGHTRAG_ONLY=1`.  
Все изменения, которые требуют включения `/kag/*`, считаются отдельным RFC и не входят в базовый MVP.
