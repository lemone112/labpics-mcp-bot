# Спека 0009 — Web IA: страницы и навигация (LightRAG MVP)

Статус: **implemented**

## Цель

За 5 минут пользователь должен:

1. выбрать проект,
2. увидеть состояние данных,
3. получить контекст через LightRAG,
4. перейти к действию (jobs/crm/offers).

## Обязательный shell

- shadcn/ui token-based layout.
- Desktop: nav rail + project sidebar + content.
- Mobile: burger -> project sheet + нижний tabbar (6 business items).

## Актуальная карта страниц

- `/login`
- `/projects`
- `/control-tower/[dashboard|messages|agreements|risks|finance|offers]`
- `/jobs`
- `/search` (LightRAG)
- `/crm`
- `/signals`
- `/offers`
- `/digests`
- `/analytics`

## UX-инварианты

1. Без активного проекта проектные страницы показывают корректный empty state.
2. Все ключевые страницы используют единый набор primitives (`components/ui/*`).
3. Любой критичный action имеет прозрачный loading/error state.
4. Навигация и layout одинаково предсказуемы на desktop и mobile.

## Acceptance criteria

1. Пользователь не теряет project scope при переходах.
2. Мобильный tabbar всегда доступен на основных рабочих страницах.
3. Search страница возвращает LightRAG result без зависимостей от `/kag/*`.
