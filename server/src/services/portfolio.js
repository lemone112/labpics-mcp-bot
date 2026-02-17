import { fail } from "../lib/api-contract.js";

function toPositiveInt(value, fallback, min = 1, max = 1000) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function clamp(value, min = 0, max = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
}

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

  const [dashboardRows, trendRows, messagesRows, agreementsRows, risksRows, financeRows, upsellRows, offerRows, loopsRows] =
    await Promise.all([
      pool.query(
        `
          SELECT
            p.id::text AS project_id,
            p.name AS project_name,
            COALESCE(msg.messages_7d, 0)::int AS messages_7d,
            COALESCE(lin.issues_open, 0)::int AS linear_open_issues,
            COALESCE(att.pipeline_amount, 0)::numeric(14,2) AS attio_pipeline_amount,
            COALESCE(crm.pipeline_amount, 0)::numeric(14,2) AS crm_pipeline_amount,
            COALESCE(crm.expected_revenue, 0)::numeric(14,2) AS expected_revenue,
            COALESCE(hs.score, 0)::numeric(6,2) AS health_score,
            COALESCE(risk.risks_open, 0)::int AS risks_open
          FROM projects AS p
          LEFT JOIN LATERAL (
            SELECT count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS messages_7d
            FROM cw_messages
            WHERE project_id = p.id
              AND account_scope_id = $1
          ) AS msg ON TRUE
          LEFT JOIN LATERAL (
            SELECT count(*) FILTER (WHERE completed_at IS NULL)::int AS issues_open
            FROM linear_issues_raw
            WHERE project_id = p.id
              AND account_scope_id = $1
          ) AS lin ON TRUE
          LEFT JOIN LATERAL (
            SELECT COALESCE(sum(amount), 0)::numeric(14,2) AS pipeline_amount
            FROM attio_opportunities_raw
            WHERE project_id = p.id
              AND account_scope_id = $1
              AND lower(COALESCE(stage, '')) NOT IN ('won', 'lost', 'closed-won', 'closed-lost')
          ) AS att ON TRUE
          LEFT JOIN LATERAL (
            SELECT
              COALESCE(sum(amount_estimate), 0)::numeric(14,2) AS pipeline_amount,
              COALESCE(sum(amount_estimate * probability), 0)::numeric(14,2) AS expected_revenue
            FROM crm_opportunities
            WHERE project_id = p.id
              AND account_scope_id = $1
              AND stage NOT IN ('won', 'lost')
          ) AS crm ON TRUE
          LEFT JOIN LATERAL (
            SELECT score
            FROM health_scores
            WHERE project_id = p.id
              AND account_scope_id = $1
            ORDER BY generated_at DESC
            LIMIT 1
          ) AS hs ON TRUE
          LEFT JOIN LATERAL (
            SELECT count(*)::int AS risks_open
            FROM risk_radar_items
            WHERE project_id = p.id
              AND account_scope_id = $1
              AND status <> 'closed'
          ) AS risk ON TRUE
          WHERE p.account_scope_id = $1
            AND p.id::text = ANY($2::text[])
          ORDER BY p.name ASC
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
            COALESCE(crm.deal_amount, 0)::numeric(14,2) AS deal_amount,
            COALESCE(crm.pipeline_amount, 0)::numeric(14,2) AS pipeline_amount,
            COALESCE(crm.expected_revenue, 0)::numeric(14,2) AS expected_revenue,
            COALESCE(o.signed_total, 0)::numeric(14,2) AS signed_total,
            COALESCE(ar.costs_amount, 0)::numeric(14,2) AS costs_amount,
            COALESCE(ar.gross_margin, COALESCE(crm.expected_revenue, 0) - COALESCE(ar.costs_amount, 0))::numeric(14,2) AS gross_margin,
            COALESCE(crm.forecast_days, 0)::int AS forecast_days
          FROM projects AS p
          LEFT JOIN LATERAL (
            SELECT
              COALESCE(sum(amount_estimate) FILTER (WHERE stage = 'won'), 0)::numeric(14,2) AS deal_amount,
              COALESCE(sum(amount_estimate) FILTER (WHERE stage NOT IN ('won', 'lost')), 0)::numeric(14,2) AS pipeline_amount,
              COALESCE(sum(amount_estimate * probability) FILTER (WHERE stage NOT IN ('won', 'lost')), 0)::numeric(14,2) AS expected_revenue,
              COALESCE(avg(GREATEST(0, expected_close_date - current_date)) FILTER (WHERE stage NOT IN ('won', 'lost') AND expected_close_date IS NOT NULL), 0)::int AS forecast_days
            FROM crm_opportunities
            WHERE project_id = p.id
              AND account_scope_id = $1
          ) AS crm ON TRUE
          LEFT JOIN LATERAL (
            SELECT COALESCE(sum(total) FILTER (WHERE status = 'signed'), 0)::numeric(14,2) AS signed_total
            FROM offers
            WHERE project_id = p.id
              AND account_scope_id = $1
          ) AS o ON TRUE
          LEFT JOIN LATERAL (
            SELECT costs_amount, gross_margin
            FROM analytics_revenue_snapshots
            WHERE project_id = p.id
              AND account_scope_id = $1
            ORDER BY generated_at DESC
            LIMIT 1
          ) AS ar ON TRUE
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
    ]);

  const dashboardByProject = dashboardRows.rows.map((row) => {
    const attioPipeline = toNumber(row.attio_pipeline_amount, 0);
    const crmPipeline = toNumber(row.crm_pipeline_amount, 0);
    const expectedRevenue = Math.max(toNumber(row.expected_revenue, 0), attioPipeline + crmPipeline);
    const metrics = {
      project_id: row.project_id,
      project_name: row.project_name,
      messages_7d: toNumber(row.messages_7d, 0),
      linear_open_issues: toNumber(row.linear_open_issues, 0),
      attio_pipeline_amount: attioPipeline,
      crm_pipeline_amount: crmPipeline,
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
      },
      by_project: dashboardByProject,
      trend: dashboardTrend,
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
