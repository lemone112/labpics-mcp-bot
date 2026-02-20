# Iterations in Work Now — Priority Selection (2026-02-20)

> Цель: зафиксировать **что берём в немедленную реализацию** после ревью кода и open Issues.
> Sources of truth: GitHub Milestones/Issues + `iteration-plan-wave3` + critique findings.

## Что изучено

- Архитектурный и продуктовый контекст монорепозитория (`README.md`, `docs/index.md`).
- Актуальный unified-план по итерациям и фазам (`docs/iterations/iteration-plan-wave3.md`).
- Аудит-критика с подтверждёнными code hotspots (`docs/audits/critique-findings-2026-02-20.md`).
- Ключевые runtime-узкие места напрямую в коде:
  - vector search/embeddings,
  - scheduler claiming,
  - outbound locking,
  - CSRF/auth routing,
  - Telegram webhook auth,
  - business signal extraction,
  - frontend CSP.

## Приоритетные итерации, которые беру **сейчас**

## 1) Iter 61 — Security Hardening (P0)

**Почему сейчас:** в текущем коде есть прямые security-risks на mutation/webhook-контуре, влияющие на безопасность продакшена.

**Берём в работу first:**

- Ужесточение CSRF/public route rules (`/auth/logout` и смежные мутирующие auth routes).
- Обязательная валидация Telegram webhook secret и startup guard.
- Быстрые high-impact усиления CSP/auth surface.

**Ожидаемый эффект:** закрываем риски несанкционированных действий до начала feature-итераций.

## 2) Iter 63 — DB & Vector Optimization (P0)

**Почему сейчас:** есть критичные data/performance дефекты в основном query path и worker-циклах.

**Берём в работу first:**

- Исправление vector operator для индексов cosine.
- Атомарный claim scheduler jobs (без race/double-run).
- Locking/claim pattern для outbound processing (без double-send).
- Корректная обработка retry при token-budget truncation.

**Ожидаемый эффект:** снимаем системные риски деградации, дублирования jobs и лишней нагрузки на БД.

## 3) Iter 62 — Business Logic Accuracy (P0)

**Почему сейчас:** текущая ценность дашборда для студии упирается в корректность сигналов и метрик, а не в новые UI-экраны.

**Берём в работу first:**

- Русскоязычные паттерны в signal detection (delivery/budget/upsell/urgency и related paths).
- Устранение «фиктивных нулевых» бизнес-метрик в health/analytics/reporting цепочке.

**Ожидаемый эффект:** выводим в рабочее состояние decision-support слой для Owner/PM.

## 4) Iter 54 — Frontend Resilience (raised to P0)

**Почему сейчас:** часть интерфейса падает целиком при одном failed endpoint; CSP в dev ослаблен чрезмерно.

**Берём в работу first:**

- Перевод критичных страниц на `Promise.allSettled`/graceful degradation.
- Устранение CSP anti-patterns и базовые frontend hardening fixes.

**Ожидаемый эффект:** меньше blank-states и аварийных сценариев в daily use.

## 5) Iter 57 — Backend Unit Test Expansion (start in parallel)

**Почему сейчас:** без покрытия фиксы P0-уровня не удержатся; нужно верифицировать инварианты сразу по мере изменений.

**Берём в работу first:**

- Тесты на security behavior (CSRF/auth/webhook).
- Тесты на scheduler/outbox concurrency semantics.
- Тесты на RAG/vector и retry edge-cases.

**Ожидаемый эффект:** предотвращаем регрессии в тех же критичных зонах.

---

## Что откладываю после этих итераций

- Iter 11 (LightRAG migration) — остаётся важной, но не первой по revenue/operational risk.
- Iter 21 / 20.5 (глубокий UI redesign/charts) — после стабилизации data correctness.
- Iter 50/51 (Telegram bot product expansion) — после закрытия P0-контуров web platform.

## Рабочий порядок (операционный)

1. **Security stop-the-bleed:** Iter 61
2. **Data integrity + performance:** Iter 63
3. **Business truthfulness:** Iter 62
4. **UX fault tolerance:** Iter 54
5. **Coverage growth alongside fixes:** Iter 57

Это даёт самый быстрый путь к устойчивому production baseline: безопасно, корректно, наблюдаемо, затем масштабируемо по roadmap.
