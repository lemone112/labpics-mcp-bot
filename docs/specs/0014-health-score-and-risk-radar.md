# Спека 0014 — Health Score & Risk Radar (DRAFT)

Статус: **draft**

## Цель

Сделать “панель здоровья” аккаунта/проекта:

- health score (объяснимый)
- прогноз рисков delivery
- рекомендации mitigation

## Сигналы для health

- задержки ответов
- рост правок
- негативная тональность
- расхождение обещаний и плана

## Объект данных

- HealthSnapshot(scope, score, factors[], evidence[])

## UX

- health badge на Account/Project
- drill-down: почему такой score

## Критерии приёмки

- Health score считается и объясняется факторами.
- Есть список top risks + suggested actions.
