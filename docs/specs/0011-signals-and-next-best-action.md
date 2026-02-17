# Спека 0011 — Signals & Next Best Action (продажи + PM) (DRAFT)

Статус: **draft**

## Цель

Сделать систему “сигнальной”:

- находить в коммуникациях **сигналы** (продажи/риски/delivery),
- превращать их в **Next Best Action** для PM/BD,
- сохранять evidence и не допускать автодействий без подтверждения.

## Определения

- Signal — событие/индикатор, требующий реакции.
- NBA — рекомендованное действие, максимизирующее ценность/снижающее риск.

## Типы сигналов

### Sales / Expansion
- запрос “добавить ещё”
- интерес к доп. услугам
- обсуждение бюджета
- запрос ускорения

### PM / Delivery
- риск срыва сроков
- расползание scope
- конфликт требований

### Finance
- риск неоплаты
- задержка согласования

## Объект данных: Signal

- `id`
- `scope`: account_id и/или project_id и/или opportunity_id
- `type`
- `severity`: low/med/high
- `confidence`: 0–1
- `summary`
- `evidence`: ссылки на первоисточники
- `recommended_actions`: список действий
- `status`: proposed / accepted / dismissed / done
- `owner_user_id`

## UX

### Экран Signals (единый inbox действий)
- сортировка по severity/impact
- кнопки: Accept / Dismiss / Mark done

### Карточка сигнала
- “почему” (evidence)
- “что сделать” (шаги)
- черновики сообщений (но отправка только после approve)

## Guardrails

- Любой outbound (письмо/сообщение) — через approval queue.

## Критерии приёмки

- Система создаёт proposed signals из новых сообщений.
- Пользователь может принять/отклонить.
- В accepted сигнале есть NBA и evidence.
