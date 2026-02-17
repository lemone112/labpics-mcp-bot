# Спека 0015 — Case Library & Similar Projects

Статус: **draft**

Дата: 2026-02-17

> Roadmap: CRM/PM/Sales


## Цель

Сделать “продающую память студии”:

- библиотека кейсов,
- поиск похожих,
- вставка кейсов в офферы.

## Сущности

### cases
- `id`
- `account_id` (nullable)
- `project_id` (nullable)
- `industry`
- `work_type_tags` (text[])
- `problem` (md)
- `solution` (md)
- `outcomes` (md)
- `links` (jsonb)
- `created_at`, `updated_at`

## Генерация кейса

- полуавтоматически: система предлагает draft → человек approve.

## Similarity

Комбинация:

- фильтры (industry/work_type)
- embeddings по problem/solution/outcomes

Вывод обязателен с объяснением “почему похож”.

## UX

- Case library
- Similar cases в Opportunity/Offer

## Критерии приёмки

- Можно создать кейс.
- Можно найти похожие.
- Можно прикрепить кейсы к Offer.
