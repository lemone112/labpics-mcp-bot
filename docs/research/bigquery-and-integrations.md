# BigQuery Feasibility & Strategic Integrations — Analysis

> Date: 2026-02-19
> Status: Research complete
> Verdict: BigQuery = NO. DuckDB = future option. Top 5 integrations identified.

---

## Part 1: Google BigQuery — стоит ли игра свеч?

### Вердикт: **НЕТ**

### Финансовый анализ

| Компонент | Стоимость | Наш объём | Итого |
|-----------|-----------|-----------|-------|
| Storage (active) | $0.02/GB/month | ~1-5 GB | **$0.02-$0.10/month** |
| Storage (long-term, >90d) | $0.01/GB/month | ~0.5 GB | $0.005/month |
| Queries (on-demand) | $6.25/TiB scanned | < 1 TB/month | **$0 (free tier)** |
| Streaming inserts | $0.01/200 MB | ~150 MB/month | $0.0075/month |
| **Total monthly cost** | | | **~$0** (free tier) |

**Проблема не в деньгах. Проблема в operational cost:**

| Hidden Cost | Impact | Hours/month |
|-------------|--------|-------------|
| ETL pipeline development | 40-80h initial, then maintenance | 4-8h ongoing |
| Dual schema maintenance | Every migration → 2 databases | 2-4h |
| GCP auth management | Service accounts, IAM, key rotation | 1-2h |
| Debugging across 2 DBs | Different SQL dialects, sync lag | 2-4h |
| Network dependency | Self-hosted → requires internet for analytics | Availability risk |
| **Total operational overhead** | | **~10-18h/month** |

### Почему NOT worth it

1. **~1-5 GB данных** — PostgreSQL handles this without breaking a sweat
2. **Уже есть:** materialized views, Redis cache, partitioning infra, 85+ indexes
3. **Self-hosted** — зависимость от cloud для аналитики противоречит архитектуре
4. **1-3 разработчика** — overhead 10-18h/month = 5-10% capacity на zero-value work
5. **Iter 25 targets** — API p95 < 50ms уже достижим с PostgreSQL + Redis

### Альтернативы (если когда-нибудь понадобится)

| Решение | Когда использовать | Effort |
|---------|-------------------|--------|
| **PostgreSQL (current)** | 0-50 GB, текущий масштаб | Уже работает |
| **DuckDB (embedded)** | 10-100 GB, ad-hoc аналитика | S — npm install, zero infra |
| **TimescaleDB (extension)** | Time-series focus, >100 GB snapshots | M — PG extension, no new server |
| **ClickHouse** | >100 GB, heavy analytical queries | L — separate server, DevOps overhead |
| **BigQuery** | >1 TB, multi-source warehouse | XL — cloud dependency, ETL pipeline |

**Рекомендация:** Если понадобится аналитический ускоритель — **DuckDB** embedded
в Node.js через `duckdb-node`. Zero infrastructure, read PostgreSQL напрямую через
`postgres_scanner` extension, columnar storage, runs in-process. Идеально для QBR
Auto-Generator (Iter 35) и ad-hoc отчётов.

---

## Part 2: Strategic Integrations

### Текущие интеграции

| Connector | Data | Status |
|-----------|------|--------|
| **Chatwoot** | Messages, conversations, contacts | ✅ Active |
| **Linear** | Issues, states, cycles, projects | ✅ Active |
| **Attio** | Accounts, people, opportunities, activities | ✅ Active |

### Топ-5 интеграций (приоритизированный список)

---

### #1: Time Tracking (Toggl Track / Clockify)

| Параметр | Значение |
|----------|---------|
| **Business Value** | **9/10** |
| **Complexity** | **S-M** (1-3 weeks) |
| **Revenue Impact** | DIRECT — accurate P&L |

**Почему #1:** Это **единственный missing data source** который блокирует 3 запланированные фичи:
- Iter 33.1 Client Profitability Dashboard (#280) — **requires actual hours × rate**
- Iter 33.2 Resource Utilization Analytics (#281) — **requires billable vs non-billable**
- Iter 32.3 Scope Creep Detector (#277) — **requires estimated vs actual hours**

**Без time tracking** эти фичи работают на оценках. **С time tracking** — на фактах.

**Data unlocked:**
- Billable vs non-billable hours per client/project/person
- Actual cost per project (hours × hourly rate)
- Team utilization rate
- Scope creep quantification (estimated vs actual)
- Project estimation accuracy

**Industry insight:** 15-20% margin improvement from time tracking visibility.

---

### #2: Stripe (Billing & Payments)

| Параметр | Значение |
|----------|---------|
| **Business Value** | **9/10** |
| **Complexity** | **M** (2-4 weeks) |
| **Revenue Impact** | DIRECT — accurate revenue data |

**Почему #2:** `analytics_revenue_snapshots` трекает `pipeline_amount`, `won_amount`,
`costs_amount`, `gross_margin` — но без биллинга это оценки, не факты.

**Data unlocked:**
- Real invoicing and payment data
- Subscription management (retainer clients)
- Payment velocity and delays
- Cash flow forecasting
- Auto-fill `connector_events` events: `invoice_sent`, `invoice_paid`

---

### #3: Telegram Bot (Notifications)

| Параметр | Значение |
|----------|---------|
| **Business Value** | **8/10** |
| **Complexity** | **S** (3-5 days) |
| **Revenue Impact** | DAU +30% |

**Почему #3:** Lowest effort, highest engagement impact. Already planned (Iter 28.5).
Для Russian-market agency Telegram = primary business messenger.

**Data unlocked:**
- Notification delivery rates
- User engagement with alerts
- Response time to critical signals

---

### #4: Google Calendar

| Параметр | Значение |
|----------|---------|
| **Business Value** | **7/10** |
| **Complexity** | **M** (2-3 weeks) |
| **Revenue Impact** | Indirect — engagement signal |

**Почему #4:** Meeting frequency — один из strongest engagement signals для Health Score.
Клиент который перестаёт назначать встречи = churn signal.

**Data unlocked:**
- Client meeting frequency (engagement signal for DEAR Health Score)
- Team availability and capacity
- Meeting-to-deal conversion correlation
- Time-to-next-meeting as churn predictor
- Client touchpoints for Unified Timeline (Iter 31.3)

---

### #5: GitHub

| Параметр | Значение |
|----------|---------|
| **Business Value** | **7/10** |
| **Complexity** | **S-M** (1-2 weeks) |
| **Revenue Impact** | Indirect — delivery metrics |

**Почему #5:** Linear tracks work management, GitHub tracks code delivery.
Together = true development cycle time.

**Data unlocked:**
- DORA metrics (deployment frequency, lead time, MTTR, change failure rate)
- PR velocity and review bottlenecks
- Commit-to-deploy pipeline health
- Code→deployment correlation with Linear issue states

---

### Roadmap интеграций

```
Q1 (immediate):
  #3 Telegram Bot     [S]  3-5 days   ← Quick win, already planned
  #1 Time Tracking    [M]  1-3 weeks  ← Highest data impact

Q2:
  #2 Stripe           [M]  2-4 weeks  ← Revenue accuracy
  #4 Google Calendar   [M]  2-3 weeks  ← Engagement signals

Q3:
  #5 GitHub           [M]  1-2 weeks  ← Development cycle
  +  GA4 (optional)   [M]  2-4 weeks  ← If agency does marketing
```

### Не рекомендуется (сейчас)

| Integration | Business Value | Why Skip |
|-------------|---------------|----------|
| Slack | 5/10 | Russian market = Telegram. Slack = international expansion |
| QuickBooks/Xero | 6/10 | Secondary to Stripe. Complex OAuth. Add after Stripe. |
| Notion | 4/10 | Niche. Only if team uses Notion internally. |
| BambooHR/Deel | 3/10 | Too early at <10 team members. |
| Meta Ads | 6/10 | Only if agency runs paid campaigns. Specialized tool better. |
| Figma | 6/10 | Nice-to-have for design agencies. Not core data. |

### Архитектурная совместимость

Connector framework (`createConnector` в `/server/src/connectors/index.js`) уже поддерживает
добавление новых connectors. Для каждого нового:

1. ALTER CHECK constraint на `connector_sync_state` (добавить connector name)
2. Implement `httpRunner` function
3. Создать `*_raw` таблицы для сырых данных
4. Добавить event types в `connector_events` CHECK
5. Update materialized views если нужно
