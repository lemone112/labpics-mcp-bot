import { fail } from "../lib/api-contract.js";
import { toPositiveInt, toNumber, clamp } from '../lib/utils.js';

function uniqueProjectIds(input) {
  if (!Array.isArray(input)) return [];
  const deduped = new Set();
  for (const item of input) {
    const normalized = String(item || "").trim();
    if (!normalized) continue;
    deduped.add(normalized);
    if (deduped.size >= 100) break;
  }
  return Array.from(deduped);
}

function computeClientValueScore(metrics) {
  const expectedRevenue = toNumber(metrics.expected_revenue, 0);
  const healthScore = toNumber(metrics.health_score, 0);
  const messageSignal = toNumber(metrics.messages_7d, 0);
  const riskPressure = toNumber(metrics.risks_open, 0);

  const revenueSignal = Math.min(28, Math.log10(1 + Math.max(0, expectedRevenue)) * 7);
  const engagementSignal = Math.min(16, messageSignal * 0.8);
  const healthSignal = Math.min(42, healthScore * 0.42);
  const riskPenalty = Math.min(30, riskPressure * 5.5);

  return Math.round(clamp(22 + revenueSignal + engagementSignal + healthSignal - riskPenalty, 0, 100));
}

function toDiscountLimit(clientValueScore) {
  const score = toNumber(clientValueScore, 0);
  if (score >= 85) return 18;
  if (score >= 70) return 14;
  if (score >= 55) return 10;
  if (score >= 40) return 7;
  return 5;
}

export async function resolveScopedProjects(pool, accountScopeId, requestedProjectIds = [], activeProjectId = null) {
  if (!accountScopeId) {
    fail(409, "account_scope_required", "Account scope is required");
  }

  const requested = uniqueProjectIds(requestedProjectIds);
  const defaultRequested = !requested.length && activeProjectId ? [String(activeProjectId)] : requested;
  const hasFilter = defaultRequested.length > 0;

  const query = hasFilter
    ? `
      SELECT id, name, account_scope_id, created_at
      FROM projects
      WHERE account_scope_id = $1
        AND id::text = ANY($2::text[])
      ORDER BY name ASC
    `
    : `
      SELECT id, name, account_scope_id, created_at
      FROM projects
      WHERE account_scope_id = $1
      ORDER BY name ASC
    `;
  const values = hasFilter ? [accountScopeId, defaultRequested] : [accountScopeId];
  const { rows } = await pool.query(query, values);
  return rows;
}

export async function getPortfolioOverview(pool, options = {}) {
  const accountScopeId = String(options.accountScopeId || "");
  const activeProjectId = String(options.activeProjectId || "") || null;
  const messageLimit = toPositiveInt(options.messageLimit, 40, 5, 200);
  const cardLimit = toPositiveInt(options.cardLimit, 16, 4, 80);

  const projects = await resolveScopedProjects(pool, accountScopeId, options.projectIds, activeProjectId);
  if (!projects.length) {
    return {
      projects: [],
      selected_project_ids: [],
      dashboard: { totals: null, by_project: [], trend: [] },
      messages: [],
      agreements: [],
      risks: [],
      finances: { totals: null, by_project: [] },
      offers: { upsell: [], recent_offers: [], discount_policy: [] },
      loops: { contacts_with_email: 0, unique_emails: 0 },
    };
  }

  const selectedProjectIds = projects.map((row) => String(row.id));

  const [
    dashboardRows,
    trendRows,
    messagesRows,
    agreementsRows,
    risksRows,
    financeRows,
    upsellRows,
    offerRows,
    loopsRows,
    healthTrendRows,
    velocityRows,
    overdueIssuesRows,
    responseRows,
    agreementsCreatedRows,
    signedOffersRows,
    risksTrendRows,
    burnBudgetRows,
    upsellTrendRows,
    financeStageRows,
    reconciliationTrendRows,
  ] =
    await Promise.all([
      pool.query(
        `
          SELECT
            project_id::text AS project_id,
            project_name,
            messages_7d,
            linear_open_issues,
            attio_pipeline_amount,
            attio_expected_revenue,
            crm_pipeline_amount,
            expected_revenue,
            health_score,
            risks_open
          FROM mv_portfolio_dashboard
          WHERE account_scope_id = $1
            AND project_id::text = ANY($2::text[])
          ORDER BY project_name ASC
        `,
        [accountScopeId, selectedProjectIds]
      ),
      pool.query(
        `
          SELECT
            period_start::text AS period_start,
            COALESCE(sum(expected_revenue), 0)::numeric(14,2) AS expected_revenue,
            COALESCE(sum(pipeline_amount), 0)::numeric(14,2) AS pipeline_amount,
            COALESCE(sum(costs_amount), 0)::numeric(14,2) AS costs_amount
          FROM analytics_revenue_snapshots
          WHERE account_scope_id = $1
            AND project_id::text = ANY($2::text[])
          GROUP BY period_start
          ORDER BY period_start DESC
          LIMIT 12
        `,
        [accountScopeId, selectedProjectIds]
      ),
      pool.query(
        `
          SELECT
            m.id,
            m.project_id::text AS project_id,
            p.name AS project_name,
            m.sender_type,
            m.contact_global_id,
            m.conversation_global_id,
            m.created_at,
            left(COALESCE(m.content, ''), 600) AS content
          FROM cw_messages AS m
          JOIN projects AS p ON p.id = m.project_id
          WHERE m.account_scope_id = $1
            AND m.project_id::text = ANY($2::text[])
            AND btrim(COALESCE(m.content, '')) <> ''
          ORDER BY m.created_at DESC NULLS LAST
          LIMIT $3
        `,
        [accountScopeId, selectedProjectIds, messageLimit]
      ),
      pool.query(
        `
          SELECT
            e.id::text AS id,
            e.project_id::text AS project_id,
            p.name AS project_name,
            e.source_table,
            e.source_pk,
            COALESCE(NULLIF(e.snippet, ''), left(e.payload::text, 280), e.source_pk) AS summary,
            e.created_at
          FROM evidence_items AS e
          JOIN projects AS p ON p.id = e.project_id
          WHERE e.account_scope_id = $1
            AND e.project_id::text = ANY($2::text[])
            AND (
              COALESCE(e.snippet, '') ILIKE ANY($3::text[])
              OR COALESCE(e.payload::text, '') ILIKE ANY($3::text[])
            )
          ORDER BY e.created_at DESC
          LIMIT $4
        `,
        [
          accountScopeId,
          selectedProjectIds,
          ["%agreement%", "%договор%", "%соглас%", "%commit%", "%услов%", "%deadline%", "%срок%"],
          cardLimit,
        ]
      ),
      pool.query(
        `
          SELECT *
          FROM (
            SELECT
              r.id::text AS id,
              r.project_id::text AS project_id,
              p.name AS project_name,
              r.title,
              r.severity,
              r.probability,
              r.status,
              r.updated_at,
              'risk_radar'::text AS source
            FROM risk_radar_items AS r
            JOIN projects AS p ON p.id = r.project_id
            WHERE r.account_scope_id = $1
              AND r.project_id::text = ANY($2::text[])
              AND r.status <> 'closed'

            UNION ALL

            SELECT
              s.id::text AS id,
              s.project_id::text AS project_id,
              p.name AS project_name,
              s.summary AS title,
              s.severity,
              s.confidence AS probability,
              s.status,
              s.created_at AS updated_at,
              'signal'::text AS source
            FROM signals AS s
            JOIN projects AS p ON p.id = s.project_id
            WHERE s.account_scope_id = $1
              AND s.project_id::text = ANY($2::text[])
              AND s.severity >= 4
              AND s.status IN ('proposed', 'accepted')

            UNION ALL

            SELECT
              rp.id::text AS id,
              rp.project_id::text AS project_id,
              COALESCE(p.name, 'Паттерн из истории') AS project_name,
              rp.title,
              GREATEST(1, LEAST(5, round(rp.weight * 5)::int)) AS severity,
              rp.weight AS probability,
              rp.status,
              rp.updated_at,
              'risk_pattern'::text AS source
            FROM risk_pattern_events AS rp
            LEFT JOIN projects AS p ON p.id = rp.project_id
            WHERE rp.account_scope_id = $1
              AND rp.project_id::text = ANY($2::text[])
              AND rp.status = 'open'
          ) AS combined
          ORDER BY severity DESC, updated_at DESC
          LIMIT $3
        `,
        [accountScopeId, selectedProjectIds, cardLimit]
      ),
      pool.query(
        `
          SELECT
            p.id::text AS project_id,
            p.name AS project_name,
            COALESCE(crm.deal_amount, 0)::numeric(14,2) + COALESCE(attio.deal_amount, 0)::numeric(14,2) AS deal_amount,
            COALESCE(crm.pipeline_amount, 0)::numeric(14,2) + COALESCE(attio.pipeline_amount, 0)::numeric(14,2) AS pipeline_amount,
            COALESCE(crm.expected_revenue, 0)::numeric(14,2) + COALESCE(attio.expected_revenue, 0)::numeric(14,2) AS expected_revenue,
            COALESCE(o.signed_total, 0)::numeric(14,2) AS signed_total,
            COALESCE(ar.costs_amount, 0)::numeric(14,2) AS costs_amount,
            COALESCE(
              ar.gross_margin,
              COALESCE(crm.expected_revenue, 0) + COALESCE(attio.expected_revenue, 0) - COALESCE(ar.costs_amount, 0)
            )::numeric(14,2) AS gross_margin,
            GREATEST(COALESCE(crm.forecast_days, 0), COALESCE(attio.forecast_days, 0))::int AS forecast_days
          FROM projects AS p
          LEFT JOIN (
            SELECT
              project_id,
              COALESCE(sum(amount_estimate) FILTER (WHERE stage = 'won'), 0)::numeric(14,2) AS deal_amount,
              COALESCE(sum(amount_estimate) FILTER (WHERE stage NOT IN ('won', 'lost')), 0)::numeric(14,2) AS pipeline_amount,
              COALESCE(sum(amount_estimate * probability) FILTER (WHERE stage NOT IN ('won', 'lost')), 0)::numeric(14,2) AS expected_revenue,
              COALESCE(avg(GREATEST(0, expected_close_date - current_date)) FILTER (WHERE stage NOT IN ('won', 'lost') AND expected_close_date IS NOT NULL), 0)::int AS forecast_days
            FROM crm_opportunities
            WHERE account_scope_id = $1
              AND project_id::text = ANY($2::text[])
              AND COALESCE(source_system, 'manual') <> 'attio'
            GROUP BY project_id
          ) AS crm ON crm.project_id = p.id
          LEFT JOIN (
            SELECT
              project_id,
              COALESCE(sum(amount) FILTER (
                WHERE lower(COALESCE(stage, '')) IN ('won', 'closed-won')
              ), 0)::numeric(14,2) AS deal_amount,
              COALESCE(sum(amount) FILTER (
                WHERE lower(COALESCE(stage, '')) NOT IN ('won', 'lost', 'closed-won', 'closed-lost')
              ), 0)::numeric(14,2) AS pipeline_amount,
              COALESCE(sum(amount * probability) FILTER (
                WHERE lower(COALESCE(stage, '')) NOT IN ('won', 'lost', 'closed-won', 'closed-lost')
              ), 0)::numeric(14,2) AS expected_revenue,
              COALESCE(avg(GREATEST(0, expected_close_date - current_date)) FILTER (
                WHERE lower(COALESCE(stage, '')) NOT IN ('won', 'lost', 'closed-won', 'closed-lost')
                  AND expected_close_date IS NOT NULL
              ), 0)::int AS forecast_days
            FROM attio_opportunities_raw
            WHERE account_scope_id = $1
              AND project_id::text = ANY($2::text[])
            GROUP BY project_id
          ) AS attio ON attio.project_id = p.id
          LEFT JOIN (
            SELECT
              project_id,
              COALESCE(sum(total) FILTER (WHERE status = 'signed'), 0)::numeric(14,2) AS signed_total
            FROM offers
            WHERE account_scope_id = $1
              AND project_id::text = ANY($2::text[])
            GROUP BY project_id
          ) AS o ON o.project_id = p.id
          LEFT JOIN (
            SELECT DISTINCT ON (project_id)
              project_id, costs_amount, gross_margin
            FROM analytics_revenue_snapshots
            WHERE account_scope_id = $1
              AND project_id::text = ANY($2::text[])
            ORDER BY project_id, generated_at DESC
          ) AS ar ON ar.project_id = p.id
          WHERE p.account_scope_id = $1
            AND p.id::text = ANY($2::text[])
          ORDER BY p.name ASC
        `,
        [accountScopeId, selectedProjectIds]
      ),
      pool.query(
        `
          SELECT
            u.id::text AS id,
            u.project_id::text AS project_id,
            p.name AS project_name,
            u.title,
            u.rationale,
            u.score,
            u.status,
            u.created_at,
            COALESCE((u.suggested_offer_payload->>'discount_pct')::numeric, 0)::numeric(5,2) AS suggested_discount_pct
          FROM upsell_opportunities AS u
          JOIN projects AS p ON p.id = u.project_id
          WHERE u.account_scope_id = $1
            AND u.project_id::text = ANY($2::text[])
          ORDER BY u.score DESC, u.created_at DESC
          LIMIT $3
        `,
        [accountScopeId, selectedProjectIds, cardLimit]
      ),
      pool.query(
        `
          SELECT
            o.id::text AS id,
            o.project_id::text AS project_id,
            p.name AS project_name,
            o.title,
            o.status,
            o.discount_pct,
            o.total,
            o.updated_at
          FROM offers AS o
          JOIN projects AS p ON p.id = o.project_id
          WHERE o.account_scope_id = $1
            AND o.project_id::text = ANY($2::text[])
          ORDER BY o.updated_at DESC
          LIMIT $3
        `,
        [accountScopeId, selectedProjectIds, cardLimit]
      ),
      pool.query(
        `
          SELECT
            count(*)::int AS contacts_with_email,
            count(DISTINCT lower(email))::int AS unique_emails
          FROM cw_contacts
          WHERE account_scope_id = $1
            AND project_id::text = ANY($2::text[])
            AND email IS NOT NULL
            AND btrim(email) <> ''
        `,
        [accountScopeId, selectedProjectIds]
      ),
      pool.query(
        `
          SELECT
            date_trunc('day', generated_at)::date::text AS point,
            avg(score)::numeric(6,2) AS value
          FROM health_scores
          WHERE account_scope_id = $1
            AND project_id::text = ANY($2::text[])
            AND generated_at > now() - interval '60 days'
          GROUP BY 1
          ORDER BY 1 ASC
          LIMIT 60
        `,
        [accountScopeId, selectedProjectIds]
      ),
      pool.query(
        `
          SELECT
            date_trunc('week', completed_at)::date::text AS point,
            count(*)::int AS value
          FROM linear_issues_raw
          WHERE account_scope_id = $1
            AND project_id::text = ANY($2::text[])
            AND completed_at IS NOT NULL
            AND completed_at > now() - interval '120 days'
          GROUP BY 1
          ORDER BY 1 ASC
          LIMIT 24
        `,
        [accountScopeId, selectedProjectIds]
      ),
      pool.query(
        `
          SELECT
            date_trunc('week', due_date)::date::text AS point,
            count(*)::int AS value
          FROM linear_issues_raw
          WHERE account_scope_id = $1
            AND project_id::text = ANY($2::text[])
            AND completed_at IS NULL
            AND due_date IS NOT NULL
            AND due_date < current_date
          GROUP BY 1
          ORDER BY 1 ASC
          LIMIT 24
        `,
        [accountScopeId, selectedProjectIds]
      ),
      pool.query(
        `
          SELECT
            period_start::text AS point,
            avg(avg_response_minutes)::numeric(10,2) AS value
          FROM analytics_comms_snapshots
          WHERE account_scope_id = $1
            AND project_id::text = ANY($2::text[])
          GROUP BY 1
          ORDER BY 1 ASC
          LIMIT 24
        `,
        [accountScopeId, selectedProjectIds]
      ),
      pool.query(
        `
          SELECT
            date_trunc('week', created_at)::date::text AS point,
            count(*)::int AS value
          FROM evidence_items
          WHERE account_scope_id = $1
            AND project_id::text = ANY($2::text[])
            AND (
              COALESCE(snippet, '') ILIKE ANY($3::text[])
              OR COALESCE(payload::text, '') ILIKE ANY($3::text[])
            )
          GROUP BY 1
          ORDER BY 1 ASC
          LIMIT 24
        `,
        [accountScopeId, selectedProjectIds, ["%agreement%", "%договор%", "%соглас%", "%commit%", "%услов%", "%deadline%", "%срок%"]]
      ),
      pool.query(
        `
          SELECT
            date_trunc('week', updated_at)::date::text AS point,
            count(*)::int AS value
          FROM offers
          WHERE account_scope_id = $1
            AND project_id::text = ANY($2::text[])
            AND status = 'signed'
          GROUP BY 1
          ORDER BY 1 ASC
          LIMIT 24
        `,
        [accountScopeId, selectedProjectIds]
      ),
      pool.query(
        `
          SELECT
            date_trunc('week', created_at)::date::text AS point,
            count(*)::int AS count,
            avg(severity)::numeric(6,2) AS severity_avg
          FROM risk_radar_items
          WHERE account_scope_id = $1
            AND project_id::text = ANY($2::text[])
          GROUP BY 1
          ORDER BY 1 ASC
          LIMIT 24
        `,
        [accountScopeId, selectedProjectIds]
      ),
      pool.query(
        `
          SELECT
            period_start::text AS point,
            COALESCE(sum(costs_amount), 0)::numeric(14,2) AS burn,
            COALESCE(sum(pipeline_amount), 0)::numeric(14,2) AS budget
          FROM analytics_revenue_snapshots
          WHERE account_scope_id = $1
            AND project_id::text = ANY($2::text[])
          GROUP BY 1
          ORDER BY 1 ASC
          LIMIT 24
        `,
        [accountScopeId, selectedProjectIds]
      ),
      pool.query(
        `
          SELECT
            date_trunc('week', created_at)::date::text AS point,
            avg(score)::numeric(6,4) AS value
          FROM upsell_opportunities
          WHERE account_scope_id = $1
            AND project_id::text = ANY($2::text[])
          GROUP BY 1
          ORDER BY 1 ASC
          LIMIT 24
        `,
        [accountScopeId, selectedProjectIds]
      ),
      pool.query(
        `
          SELECT
            stage,
            count(*)::int AS opportunities,
            COALESCE(sum(amount), 0)::numeric(14,2) AS amount
          FROM (
            SELECT
              stage,
              amount_estimate AS amount
            FROM crm_opportunities
            WHERE account_scope_id = $1
              AND project_id::text = ANY($2::text[])
              AND COALESCE(source_system, 'manual') <> 'attio'

            UNION ALL

            SELECT
              CASE
                WHEN lower(COALESCE(stage, '')) IN ('won', 'closed-won') THEN 'won'
                WHEN lower(COALESCE(stage, '')) IN ('lost', 'closed-lost') THEN 'lost'
                WHEN lower(COALESCE(stage, '')) IN ('proposal', 'proposal_sent') THEN 'proposal'
                WHEN lower(COALESCE(stage, '')) IN ('negotiation') THEN 'negotiation'
                WHEN lower(COALESCE(stage, '')) IN ('qualified') THEN 'qualified'
                ELSE 'discovery'
              END AS stage,
              amount
            FROM attio_opportunities_raw
            WHERE account_scope_id = $1
              AND project_id::text = ANY($2::text[])
          ) AS stage_source
          GROUP BY stage
          ORDER BY opportunities DESC, amount DESC
          LIMIT 20
        `,
        [accountScopeId, selectedProjectIds]
      ),
      pool.query(
        `
          SELECT
            date_trunc('day', captured_at)::date::text AS point,
            avg(completeness_pct)::numeric(6,2) AS completeness_pct,
            sum(missing_count)::int AS missing_count,
            sum(duplicate_count)::int AS duplicate_count
          FROM sync_reconciliation_metrics
          WHERE account_scope_id = $1
            AND project_id::text = ANY($2::text[])
            AND connector <> 'portfolio'
            AND captured_at >= now() - interval '60 days'
          GROUP BY 1
          ORDER BY 1 ASC
          LIMIT 60
        `,
        [accountScopeId, selectedProjectIds]
      ),
    ]);

  const dashboardByProject = dashboardRows.rows.map((row) => {
    const attioPipeline = toNumber(row.attio_pipeline_amount, 0);
    const attioExpectedRevenue = toNumber(row.attio_expected_revenue, 0);
    const crmPipeline = toNumber(row.crm_pipeline_amount, 0);
    const expectedRevenue = Math.max(toNumber(row.expected_revenue, 0) + attioExpectedRevenue, attioPipeline + crmPipeline);
    const metrics = {
      project_id: row.project_id,
      project_name: row.project_name,
      messages_7d: toNumber(row.messages_7d, 0),
      linear_open_issues: toNumber(row.linear_open_issues, 0),
      attio_pipeline_amount: attioPipeline,
      crm_pipeline_amount: crmPipeline,
      attio_expected_revenue: attioExpectedRevenue,
      expected_revenue: expectedRevenue,
      health_score: toNumber(row.health_score, 0),
      risks_open: toNumber(row.risks_open, 0),
    };
    return {
      ...metrics,
      client_value_score: computeClientValueScore(metrics),
    };
  });

  const dashboardTotals = dashboardByProject.reduce(
    (acc, row) => {
      acc.messages_7d += row.messages_7d;
      acc.linear_open_issues += row.linear_open_issues;
      acc.expected_revenue += row.expected_revenue;
      acc.risks_open += row.risks_open;
      acc.health_score_total += row.health_score;
      acc.client_value_score_total += row.client_value_score;
      return acc;
    },
    {
      selected_projects: dashboardByProject.length,
      messages_7d: 0,
      linear_open_issues: 0,
      expected_revenue: 0,
      risks_open: 0,
      health_score_total: 0,
      client_value_score_total: 0,
    }
  );
  const latestSyncCompletenessRow = reconciliationTrendRows.rows[reconciliationTrendRows.rows.length - 1] || null;
  const latestSyncCompletenessPct = toNumber(latestSyncCompletenessRow?.completeness_pct, 100);

  const dashboardTrendRaw = trendRows.rows.map((row) => ({
    period_start: row.period_start,
    expected_revenue: toNumber(row.expected_revenue, 0),
    pipeline_amount: toNumber(row.pipeline_amount, 0),
    costs_amount: toNumber(row.costs_amount, 0),
  }));
  const dashboardTrend = (dashboardTrendRaw.length ? dashboardTrendRaw : [
    {
      period_start: new Date().toISOString().slice(0, 10),
      expected_revenue: dashboardTotals.expected_revenue,
      pipeline_amount: dashboardByProject.reduce((acc, row) => acc + row.attio_pipeline_amount + row.crm_pipeline_amount, 0),
      costs_amount: 0,
    },
  ]).reverse();

  const financesByProject = financeRows.rows.map((row) => ({
    project_id: row.project_id,
    project_name: row.project_name,
    deal_amount: toNumber(row.deal_amount, 0),
    pipeline_amount: toNumber(row.pipeline_amount, 0),
    expected_revenue: toNumber(row.expected_revenue, 0),
    signed_total: toNumber(row.signed_total, 0),
    costs_amount: toNumber(row.costs_amount, 0),
    gross_margin: toNumber(row.gross_margin, 0),
    forecast_days: toNumber(row.forecast_days, 0),
  }));

  const financeTotals = financesByProject.reduce(
    (acc, row) => {
      acc.deal_amount += row.deal_amount;
      acc.pipeline_amount += row.pipeline_amount;
      acc.expected_revenue += row.expected_revenue;
      acc.signed_total += row.signed_total;
      acc.costs_amount += row.costs_amount;
      acc.gross_margin += row.gross_margin;
      return acc;
    },
    {
      deal_amount: 0,
      pipeline_amount: 0,
      expected_revenue: 0,
      signed_total: 0,
      costs_amount: 0,
      gross_margin: 0,
    }
  );

  const discountPolicy = dashboardByProject.map((project) => ({
    project_id: project.project_id,
    project_name: project.project_name,
    client_value_score: project.client_value_score,
    max_discount_pct: toDiscountLimit(project.client_value_score),
  }));

  const agreementsCreatedByPoint = new Map(
    agreementsCreatedRows.rows.map((row) => [String(row.point), toNumber(row.value, 0)])
  );
  const signedOffersByPoint = new Map(
    signedOffersRows.rows.map((row) => [String(row.point), toNumber(row.value, 0)])
  );
  const agreementPoints = [...new Set([...agreementsCreatedByPoint.keys(), ...signedOffersByPoint.keys()])].sort();

  const dashboardCharts = {
    health_score: healthTrendRows.rows.map((row) => ({
      point: row.point,
      value: toNumber(row.value, 0),
    })),
    velocity_completed_issues: velocityRows.rows.map((row) => ({
      point: row.point,
      value: toNumber(row.value, 0),
    })),
    overdue_issues_count: overdueIssuesRows.rows.map((row) => ({
      point: row.point,
      value: toNumber(row.value, 0),
    })),
    client_responsiveness_minutes: responseRows.rows.map((row) => ({
      point: row.point,
      value: toNumber(row.value, 0),
    })),
    agreements_vs_signed_offers: agreementPoints.map((point) => {
      return {
        point,
        agreements: agreementsCreatedByPoint.get(point) || 0,
        signed_offers: signedOffersByPoint.get(point) || 0,
      };
    }),
    risks_trend: risksTrendRows.rows.map((row) => ({
      point: row.point,
      count: toNumber(row.count, 0),
      severity_avg: toNumber(row.severity_avg, 0),
    })),
    burn_vs_budget: burnBudgetRows.rows.map((row) => ({
      point: row.point,
      burn: toNumber(row.burn, 0),
      budget: toNumber(row.budget, 0),
    })),
    upsell_potential_score: upsellTrendRows.rows.map((row) => ({
      point: row.point,
      value: toNumber(row.value, 0),
    })),
    sync_reconciliation_completeness: reconciliationTrendRows.rows.map((row) => ({
      point: row.point,
      completeness_pct: toNumber(row.completeness_pct, 0),
      missing_count: toNumber(row.missing_count, 0),
      duplicate_count: toNumber(row.duplicate_count, 0),
    })),
  };

  const financeCharts = {
    revenue_by_project: financesByProject.map((row) => ({
      project_id: row.project_id,
      project_name: row.project_name,
      value: row.expected_revenue,
    })),
    costs_by_project: financesByProject.map((row) => ({
      project_id: row.project_id,
      project_name: row.project_name,
      value: row.costs_amount,
    })),
    margin_by_project: financesByProject.map((row) => ({
      project_id: row.project_id,
      project_name: row.project_name,
      value: row.gross_margin,
    })),
    burn_rate_trend: burnBudgetRows.rows.map((row) => ({
      point: row.point,
      burn: toNumber(row.burn, 0),
      budget: toNumber(row.budget, 0),
    })),
    forecast_completion_days: financesByProject.map((row) => ({
      project_id: row.project_id,
      project_name: row.project_name,
      value: row.forecast_days,
    })),
    budget_vs_actual: burnBudgetRows.rows.map((row) => ({
      point: row.point,
      budget: toNumber(row.budget, 0),
      actual: toNumber(row.burn, 0),
    })),
    unit_economics_proxy: dashboardByProject.map((row) => ({
      project_id: row.project_id,
      project_name: row.project_name,
      client_value_score: row.client_value_score,
      expected_revenue: row.expected_revenue,
    })),
    funnel_nodes: financeStageRows.rows.map((row) => ({
      stage: row.stage,
      opportunities: toNumber(row.opportunities, 0),
      amount: toNumber(row.amount, 0),
    })),
  };

  return {
    projects,
    selected_project_ids: selectedProjectIds,
    dashboard: {
      totals: {
        selected_projects: dashboardTotals.selected_projects,
        messages_7d: dashboardTotals.messages_7d,
        linear_open_issues: dashboardTotals.linear_open_issues,
        expected_revenue: Number(dashboardTotals.expected_revenue.toFixed(2)),
        risks_open: dashboardTotals.risks_open,
        avg_health_score:
          dashboardByProject.length > 0 ? Number((dashboardTotals.health_score_total / dashboardByProject.length).toFixed(2)) : 0,
        avg_client_value_score:
          dashboardByProject.length > 0
            ? Number((dashboardTotals.client_value_score_total / dashboardByProject.length).toFixed(2))
            : 0,
        sync_completeness_pct: Number(latestSyncCompletenessPct.toFixed(2)),
      },
      by_project: dashboardByProject,
      trend: dashboardTrend,
      charts: dashboardCharts,
    },
    messages: messagesRows.rows,
    agreements: agreementsRows.rows,
    risks: risksRows.rows.map((row) => ({
      ...row,
      severity: toNumber(row.severity, 0),
      probability: toNumber(row.probability, 0),
    })),
    finances: {
      totals: {
        ...financeTotals,
        deal_amount: Number(financeTotals.deal_amount.toFixed(2)),
        pipeline_amount: Number(financeTotals.pipeline_amount.toFixed(2)),
        expected_revenue: Number(financeTotals.expected_revenue.toFixed(2)),
        signed_total: Number(financeTotals.signed_total.toFixed(2)),
        costs_amount: Number(financeTotals.costs_amount.toFixed(2)),
        gross_margin: Number(financeTotals.gross_margin.toFixed(2)),
      },
      by_project: financesByProject,
      charts: financeCharts,
    },
    offers: {
      upsell: upsellRows.rows.map((row) => ({
        ...row,
        score: toNumber(row.score, 0),
        suggested_discount_pct: toNumber(row.suggested_discount_pct, 0),
      })),
      recent_offers: offerRows.rows.map((row) => ({
        ...row,
        discount_pct: toNumber(row.discount_pct, 0),
        total: toNumber(row.total, 0),
      })),
      discount_policy: discountPolicy,
    },
    loops: loopsRows.rows[0] || { contacts_with_email: 0, unique_emails: 0 },
  };
}

function normalizeMessageAttachments(rawAttachments) {
  if (!Array.isArray(rawAttachments)) return [];
  return rawAttachments
    .slice(0, 8)
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      return {
        id: String(item.id || item.file_id || item.url || item.data_url || ""),
        name: String(item.file_name || item.filename || item.name || "attachment"),
        url: String(item.data_url || item.url || item.download_url || ""),
        content_type: String(item.file_type || item.content_type || item.mime_type || "file"),
      };
    })
    .filter((item) => item && item.id);
}

export async function getPortfolioMessages(pool, options = {}) {
  const accountScopeId = String(options.accountScopeId || "");
  const requestedProjectId = String(options.projectId || "").trim();
  if (!requestedProjectId) {
    fail(400, "project_id_required", "project_id is required");
  }

  const scopedProjects = await resolveScopedProjects(pool, accountScopeId, [requestedProjectId], null);
  const project = scopedProjects[0];
  if (!project) {
    fail(404, "project_not_found", "Project not found in current account scope");
  }

  const limit = toPositiveInt(options.limit, 200, 20, 500);
  const requestedContactId = String(options.contactGlobalId || "").trim() || null;

  const personsRows = await pool.query(
    `
      SELECT
        id AS contact_global_id,
        COALESCE(NULLIF(btrim(name), ''), NULLIF(btrim(email), ''), NULLIF(btrim(identifier), ''), contact_id::text) AS person_name,
        email
      FROM cw_contacts
      WHERE project_id = $1
        AND account_scope_id = $2
      ORDER BY person_name ASC
      LIMIT 200
    `,
    [project.id, accountScopeId]
  );

  const persons = personsRows.rows.map((row) => ({
    contact_global_id: row.contact_global_id,
    person_name: row.person_name || "Контакт",
    email: row.email || null,
  }));
  const personSet = new Set(persons.map((row) => String(row.contact_global_id || "")));
  const selectedContactGlobalId =
    requestedContactId && personSet.has(requestedContactId)
      ? requestedContactId
      : persons[0]?.contact_global_id || null;

  const messagesResult = await pool.query(
    `
      SELECT
        m.id,
        m.project_id::text AS project_id,
        m.contact_global_id,
        m.conversation_global_id,
        m.sender_type,
        m.created_at,
        COALESCE(m.content, '') AS content,
        m.data
      FROM cw_messages AS m
      WHERE m.project_id = $1
        AND m.account_scope_id = $2
        AND (
          $3::text IS NULL
          OR m.contact_global_id = $3
        )
      ORDER BY m.created_at ASC NULLS LAST
      LIMIT $4
    `,
    [project.id, accountScopeId, selectedContactGlobalId, limit]
  );

  const personMap = new Map(persons.map((row) => [String(row.contact_global_id || ""), row.person_name]));
  const messages = messagesResult.rows.map((row) => {
    const data = row.data && typeof row.data === "object" ? row.data : {};
    const senderType = String(row.sender_type || "").toLowerCase();
    const isClient = senderType === "contact" || senderType === "customer" || senderType === "client";
    const authorName = isClient
      ? personMap.get(String(row.contact_global_id || "")) || "Клиент"
      : String(data?.sender?.name || data?.sender_name || "Команда");
    const channel = String(data?.channel || data?.source || "chatwoot");
    const attachments = normalizeMessageAttachments(data?.attachments || data?.attachment || []);

    return {
      id: row.id,
      project_id: row.project_id,
      project_name: project.name,
      contact_global_id: row.contact_global_id,
      conversation_global_id: row.conversation_global_id,
      sender_type: senderType || "unknown",
      author_name: authorName,
      channel,
      created_at: row.created_at,
      content: String(row.content || ""),
      attachments,
    };
  });

  return {
    project: {
      id: String(project.id),
      name: String(project.name),
      account_scope_id: String(project.account_scope_id),
    },
    persons,
    selected_contact_global_id: selectedContactGlobalId,
    messages,
  };
}
