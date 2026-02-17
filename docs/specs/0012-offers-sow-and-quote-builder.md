# Спека 0012 — Offers / SOW / Quote Builder (DRAFT)

Статус: **draft**

## Цель

Сократить time-to-quote и поднять средний чек:

- Каталог пакетов услуг (productized services)
- Сборка коммерческого (SOW/Quote) из блоков
- Опции: upsell/cross-sell/fast-track/retainer

## Объекты данных

### Service Package
- `id`, `name`
- `price_from`, `price_to` (или фикс)
- `duration_days_range`
- `includes` / `excludes`
- `add_ons` (список)
- `ideal_for` (сегменты/сценарии)

### Offer
- `id`, `account_id`, `opportunity_id`
- `packages_selected`
- `add_ons_selected`
- `assumptions` (явно)
- `price_total`
- `timeline`
- `status`: draft / approved / sent / accepted / rejected
- `evidence` (почему эти пакеты)

## UX

- Offer builder: выбор пакета → аддоны → таймлайн → допущения
- Генерация текста коммерческого (черновик)
- Approval

## Safe-by-default

- Любая скидка или изменение прайса — только с явным подтверждением.

## Критерии приёмки

- Есть каталог пакетов.
- Можно создать Offer по Opportunity.
- Можно сгенерировать черновик SOW.
- Есть статус approval.
