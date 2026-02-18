# Frontend, дизайн и UX-логика

Документ описывает UI-архитектуру продукта, дизайн-систему и то, как фронтенд реализует бизнес-логику.

---

## 1) Роль фронтенда в продукте

Frontend (Next.js) решает три задачи:

1. **Операционный интерфейс** для PM/Owner (control tower + рабочие модули).
2. **Объяснимый контекст**: показать риски и факты из LightRAG с evidence.
3. **Безопасная оркестрация действий**: запуск jobs, смена статусов, review сигналов.

---

## 2) Технологический стек UI

## 2.1 Основа

- `Next.js 16` (App Router) + `React 19`
- `next-themes` для light/dark/system
- `tailwindcss v4` + semantic CSS variables

Назначение: быстрый SSR/CSR гибрид и предсказуемый UI-каркас.

## 2.2 Компонентная система

- `shadcn/ui` как базовый дизайн-контур
- `Radix UI` как headless accessibility primitives
- `lucide-react` как единая иконография

Назначение: единая визуальная и интерактивная грамматика без ad-hoc UI.

## 2.3 Анимации и графики

- `animejs` — единый motion engine
- `recharts` — графики в dashboard/finance/analytics

Назначение: motion только для повышения читаемости интерфейса и обратной связи.

---

## 3) Дизайн-система (shadcn/ui)

Ключевые правила зафиксированы в:

- `web/DESIGN_SYSTEM_2026.md`
- `web/components/ui/*`
- `web/components.json`

Основные принципы:

1. сначала использовать primitives из `components/ui`;
2. использовать semantic-классы (`bg-background`, `text-foreground`, `border-input`);
3. не вводить одноразовые цвета/типографику без причины;
4. состояния hover/focus/disabled должны быть единообразны.

### Токены темы

- определены в `web/app/globals.css` через CSS variables;
- поддерживаются светлая/тёмная темы;
- отдельно есть токены для sidebar и chart-палитры.

### Базовые UI-блоки

- `Card`, `Table`, `Button`, `Input`, `Select`
- `Badge`, `StatusChip`, `StatTile`
- `Toast`, `EmptyState`, `SkeletonBlock`
- `Drawer`, `Filters`, `Kanban`, `InboxList`, `Chart`

Для чего: повторно использовать проверенные UI-паттерны, а не собирать новые виджеты на каждом экране.

---

## 4) Motion-система на anime.js

Стандарты motion определены в:

- `web/MOTION_GUIDELINES.md`
- `web/lib/motion.js`

Токены:

- micro: `120ms`
- fast: `220ms`
- base: `320ms`
- slow: `420ms`

Правила:

- motion включается только если `prefers-reduced-motion` не активен;
- нельзя использовать случайные тайминги и агрессивные декоративные эффекты;
- motion служит чтению данных, а не отвлечению.

Где используется сейчас:

- `MotionGroup` — staged reveal контентных секций;
- `PageLoadingSkeleton` — controlled loading pulse.

---

## 5) Архитектура фронтенда

## 5.1 Layout и провайдеры

- `web/app/layout.jsx` — root layout, шрифты, глобальные стили.
- `web/app/providers.jsx`:
  - `ThemeProvider`
  - `ProjectPortfolioProvider`

Назначение: единое состояние темы и контекста проектного выбора для всего приложения.

## 5.2 UI shell

- `PageShell` собирает трехколоночный рабочий экран:
  1. `NavRail` (иконки разделов),
  2. `ProjectSidebar` (проекты/тема/logout),
  3. main content area.

Назначение: быстрый переход между доменами и всегда видимый проектный контекст.

## 5.3 Маршрутизация (App Router)

Основные поверхности:

- `/control-tower/[section]` (dashboard/messages/agreements/risks/finance/offers)
- `/projects`, `/jobs`, `/search`, `/signals`, `/crm`, `/offers`, `/digests`, `/analytics`

Назначение: разделить стратегический portfolio режим и операционные страницы управления.

---

## 6) Логика состояния и данных

## 6.1 Auth guard

- `useAuthGuard` проверяет `/auth/me`;
- неаутентифицированных пользователей редиректит на `/login`.

Назначение: централизованный guard без дублирования проверок на каждой странице.

## 6.2 Project portfolio context

- `useProjectPortfolio` управляет:
  - списком проектов,
  - выбранным project scope,
  - режимом `Все проекты` для допустимых секций,
  - fallback логикой для секции messages (только один проект).
- хранит выбор в `localStorage` для стабильного UX между сессиями.

Назначение: избежать рассинхронизации фильтров и project scope в разных разделах.

## 6.3 API-клиент

- `apiFetch` (`web/lib/api.js`) добавляет:
  - `credentials: include`,
  - `x-request-id`,
  - CSRF header из cookie,
  - timeout + единый error handling.

Назначение: безопасный и единообразный контракт запросов.

## 6.4 Data hooks

- `usePortfolioOverview` -> `/portfolio/overview`
- `usePortfolioMessages` -> `/portfolio/messages`
- search-страница -> `/lightrag/query`

Нормативно: frontend не должен вызывать `/kag/*`.

Назначение: инкапсулировать загрузку/ошибки/reload-механику и держать страницы тонкими.

---

## 7) UI-логика по продуктовым разделам

## 7.1 Control Tower

`features/control-tower/section-page.jsx`:

- выбирает источник данных по section;
- рендерит charts/cards/messages feed;
- учитывает single vs all-project behavior;
- показывает skeleton/error states.

## 7.2 Jobs

- запускает sync/embeddings/scheduler endpoints;
- показывает телеметрию и последние job-runs.

## 7.3 Signals/CRM/Analytics/Offers

- CRUD/refresh операции идут через API;
- таблицы/kanban/карточки используют общий UI-kit;
- статусные действия (accept/done/review) остаются cheap-операциями без полного пересчёта всей системы.

---

## 8) Frontend quality gates

Перед merge:

1. `npm run lint` (включает design audit + consistency checks),
2. `npm run build`,
3. проверка мобильной переполненности и sticky-shell,
4. проверка reduced-motion поведения,
5. проверка контрастности и keyboard доступности на критичных формах.

---

## 9) Что важно не ломать при развитии UI

- Нельзя обходить `apiFetch` ad-hoc fetch-запросами без CSRF/request-id.
- Нельзя вводить новые визуальные паттерны в обход `components/ui/*`.
- Нельзя добавлять page-specific motion curves/durations вне `web/lib/motion.js`.
- Нельзя нарушать project scope UX (особенно rules для all-project mode).

---

## 10) Связанные документы

- Product overview: [`docs/product/overview.md`](./product/overview.md)
- Архитектура платформы: [`docs/architecture.md`](./architecture.md)
- Pipeline/автоматизации: [`docs/pipelines.md`](./pipelines.md)
- Roadmap: [`docs/mvp-vs-roadmap.md`](./mvp-vs-roadmap.md)
