# Спеки (`docs/specs/`)

Эта папка — **поведенческие спеки** (семантические требования): что должно быть истинно, как ведёт себя система, инварианты и acceptance criteria.

- Канонические термины: [`docs/glossary.md`](../glossary.md)
- Правила оформления: [`docs/style-guide.md`](../style-guide.md)
- Границы MVP vs Roadmap: [`docs/mvp-vs-roadmap.md`](../mvp-vs-roadmap.md)

## Целевые инварианты (для требований)

1. **Никакого смешивания проектов.** Система никогда не читает/пишет данные другого проекта.
2. **Evidence-first.** Любая ценная производная сущность должна ссылаться на первоисточники.
3. **Safe-by-default.** Если привязка неоднозначна — система не действует автоматически.
4. **Идемпотентность.** Повторные прогоны джоб не создают дубликаты или мусор.
5. **Объяснимость.** Любое действие/вывод должны показывать «почему» и «на основании чего».

> Примечание по текущему MVP: `active_project_id` уже хранится в сессии, но строгая project-scoped SQL изоляция retrieval/search пока не внедрена в коде.

## Как пользоваться спеками

- Одна спека = одна проблема и один измеримый результат.
- Предпочитай явные **критерии приёмки** (acceptance criteria).
- Если требование не входит в MVP — помечай как **Roadmap** и ссылайся на `mvp-vs-roadmap.md`.

## Рекомендуемая структура спеки

- Статус (Draft/Ready/Implemented)
- Цель
- Не-цели
- Определения (со ссылками на глоссарий)
- UX / поведение
- Правила данных и скоупа (project-scoped)
- Failure modes
- Операционные заметки
- Критерии приёмки

## Индекс

- [0001 — Мультипроектная изоляция памяти (RAG)](./0001-multiproject-rag-scope.md)
- [0002 — Commitments v1](./0002-commitments-v1.md)
- [0003 — Risks v1](./0003-risks-v1.md)
- [0004 — Weekly digest v1](./0004-weekly-digest-v1.md)
- [0005 — Интеграции Linear/Attio: preview/apply](./0005-integrations-linear-attio-preview.md)
- [0006 — Проекты, клиенты и связывание идентичностей](./0006-projects-clients-and-links.md)
- [0007 — Jobs cadence и контроль стоимости](./0007-jobs-cadence-and-cost-control.md)
- [0008 — Аудит, приватность и retention](./0008-audit-privacy-retention.md)
- [0009 — Web IA: страницы и навигация](./0009-web-ia-pages-navigation.md)

## Индекс (Roadmap CRM/PM/Sales)

- [0010 — Accounts & Opportunities (CRM ядро) v1](./0010-accounts-and-opportunities-v1.md)
- [0011 — Signals & Next Best Action (продажи + PM)](./0011-signals-and-next-best-action.md)
- [0012 — Offers / SOW / Quote Builder](./0012-offers-sow-and-quote-builder.md)
- [0013 — Campaigns / Sequences / Compliance](./0013-campaigns-sequences-and-compliance.md)
- [0014 — Health Score & Risk Radar](./0014-health-score-and-risk-radar.md)
- [0015 — Case Library & Similar Projects](./0015-case-library-and-similar-projects.md)
- [0016 — Revenue Analytics / Margin / Forecast](./0016-revenue-analytics-margin-and-forecast.md)
