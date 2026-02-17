import { getTopNba } from "./signals.js";

function clampScore(value, min = 0, max = 100) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function weekStartDate(date = new Date()) {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function computeAnalyticsCore(pool, scope, periodDays = 30) {
  const stats = await pool.query(
    `
      WITH period_window AS (
        SELECT
          (current_date - ($3::int || ' days')::interval)::date AS period_start,
          current_date::date AS period_end
      ),
      comms AS (
        SELECT
          count(*)::int AS inbound_messages,
          count(DISTINCT contact_global_id)::int AS unique_contacts
        FROM cw_messages
        WHERE project_id = $1
          AND account_scope_id = $2
          AND created_at >= (SELECT period_start FROM period_window)
      ),
      delivery AS (
        SELECT
          count(*) FILTER (WHERE completed_at IS NULL)::int AS open_issues,
          count(*) FILTER (WHERE completed_at IS NULL AND due_date < current_date)::int AS overdue_issues,
          count(*) FILTER (WHERE completed_at IS NOT NULL)::int AS completed_issues
        FROM linear_issues_raw
        WHERE project_id = $1
          AND account_scope_id = $2
      ),
      pipeline AS (
        SELECT
          COALESCE(sum(amount), 0)::numeric(14,2) AS pipeline_amount,
          COALESCE(sum(amount * probability), 0)::numeric(14,2) AS expected_revenue
        FROM attio_opportunities_raw
        WHERE project_id = $1
          AND account_scope_id = $2
          AND lower(COALESCE(stage, '')) NOT IN ('won', 'lost', 'closed-won', 'closed-lost')
      )
      SELECT
        (SELECT period_start FROM period_window) AS period_start,
        (SELECT period_end FROM period_window) AS period_end,
        comms.inbound_messages,
        comms.unique_contacts,
        delivery.open_issues,
        delivery.overdue_issues,
        delivery.completed_issues,
        pipeline.pipeline_amount,
        pipeline.expected_revenue
      FROM comms, delivery, pipeline
    `,
    [scope.projectId, scope.accountScopeId, periodDays]
  );
  return stats.rows[0] || null;
}

export async function refreshAnalytics(pool, scope, periodDays = 30) {
  const core = await computeAnalyticsCore(pool, scope, periodDays);
  const periodStart = core?.period_start || new Date(Date.now() - periodDays * 86400000).toISOString().slice(0, 10);
  const periodEnd = core?.period_end || new Date().toISOString().slice(0, 10);

  await pool.query(
    `
      INSERT INTO analytics_delivery_snapshots(
        project_id,
        account_scope_id,
        period_start,
        period_end,
        open_issues,
        overdue_issues,
        completed_issues,
        lead_time_days,
        throughput,
        payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $7, '{}'::jsonb)
      ON CONFLICT (project_id, period_start, period_end)
      DO UPDATE SET
        open_issues = EXCLUDED.open_issues,
        overdue_issues = EXCLUDED.overdue_issues,
        completed_issues = EXCLUDED.completed_issues,
        throughput = EXCLUDED.throughput,
        created_at = now()
    `,
    [
      scope.projectId,
      scope.accountScopeId,
      periodStart,
      periodEnd,
      Number(core?.open_issues || 0),
      Number(core?.overdue_issues || 0),
      Number(core?.completed_issues || 0),
    ]
  );

  await pool.query(
    `
      INSERT INTO analytics_comms_snapshots(
        project_id,
        account_scope_id,
        period_start,
        period_end,
        inbound_messages,
        outbound_messages,
        unique_contacts,
        avg_response_minutes,
        payload
      )
      VALUES ($1, $2, $3, $4, $5, 0, $6, 0, '{}'::jsonb)
      ON CONFLICT (project_id, period_start, period_end)
      DO UPDATE SET
        inbound_messages = EXCLUDED.inbound_messages,
        unique_contacts = EXCLUDED.unique_contacts,
        created_at = now()
    `,
    [
      scope.projectId,
      scope.accountScopeId,
      periodStart,
      periodEnd,
      Number(core?.inbound_messages || 0),
      Number(core?.unique_contacts || 0),
    ]
  );

  const horizons = [30, 60, 90];
  for (const horizon of horizons) {
    await pool.query(
      `
        INSERT INTO analytics_revenue_snapshots(
          project_id,
          account_scope_id,
          period_start,
          horizon_days,
          pipeline_amount,
          commit_amount,
          won_amount,
          expected_revenue,
          costs_amount,
          gross_margin,
          attribution,
          generated_at
        )
        VALUES ($1, $2, date_trunc('month', now())::date, $3, $4, $5, 0, $5, 0, $5, '{}'::jsonb, now())
        ON CONFLICT (project_id, period_start, horizon_days)
        DO UPDATE SET
          pipeline_amount = EXCLUDED.pipeline_amount,
          commit_amount = EXCLUDED.commit_amount,
          expected_revenue = EXCLUDED.expected_revenue,
          gross_margin = EXCLUDED.gross_margin,
          generated_at = now()
      `,
      [
        scope.projectId,
        scope.accountScopeId,
        horizon,
        Number(core?.pipeline_amount || 0),
        Number(core?.expected_revenue || 0),
      ]
    );
  }

  return {
    period_start: periodStart,
    period_end: periodEnd,
    pipeline_amount: Number(core?.pipeline_amount || 0),
    expected_revenue: Number(core?.expected_revenue || 0),
    open_issues: Number(core?.open_issues || 0),
    overdue_issues: Number(core?.overdue_issues || 0),
    inbound_messages: Number(core?.inbound_messages || 0),
  };
}

export async function getAnalyticsOverview(pool, scope) {
  const [revenue, delivery, comms] = await Promise.all([
    pool.query(
      `
        SELECT horizon_days, pipeline_amount, commit_amount, won_amount, expected_revenue, gross_margin, generated_at
        FROM analytics_revenue_snapshots
        WHERE project_id = $1
          AND account_scope_id = $2
        ORDER BY generated_at DESC
        LIMIT 3
      `,
      [scope.projectId, scope.accountScopeId]
    ),
    pool.query(
      `
        SELECT period_start, period_end, open_issues, overdue_issues, completed_issues, throughput, created_at
        FROM analytics_delivery_snapshots
        WHERE project_id = $1
          AND account_scope_id = $2
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [scope.projectId, scope.accountScopeId]
    ),
    pool.query(
      `
        SELECT period_start, period_end, inbound_messages, outbound_messages, unique_contacts, avg_response_minutes, created_at
        FROM analytics_comms_snapshots
        WHERE project_id = $1
          AND account_scope_id = $2
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [scope.projectId, scope.accountScopeId]
    ),
  ]);

  return {
    revenue: revenue.rows,
    delivery: delivery.rows[0] || null,
    comms: comms.rows[0] || null,
  };
}

export async function refreshRiskAndHealth(pool, scope) {
  const [signals, overdue, failedJobs] = await Promise.all([
    pool.query(
      `
        SELECT severity, confidence, signal_type, summary, evidence_refs
        FROM signals
        WHERE project_id = $1
          AND account_scope_id = $2
          AND status IN ('proposed', 'accepted')
        ORDER BY created_at DESC
        LIMIT 300
      `,
      [scope.projectId, scope.accountScopeId]
    ),
    pool.query(
      `
        SELECT count(*)::int AS overdue_issues
        FROM linear_issues_raw
        WHERE project_id = $1
          AND account_scope_id = $2
          AND completed_at IS NULL
          AND due_date IS NOT NULL
          AND due_date < current_date
      `,
      [scope.projectId, scope.accountScopeId]
    ),
    pool.query(
      `
        SELECT count(*)::int AS failed_jobs
        FROM job_runs
        WHERE project_id = $1
          AND account_scope_id = $2
          AND status = 'failed'
          AND started_at > now() - interval '7 days'
      `,
      [scope.projectId, scope.accountScopeId]
    ),
  ]);

  const severityWeighted = signals.rows.reduce(
    (acc, row) => acc + Number(row.severity || 0) * Number(row.confidence || 0),
    0
  );
  const signalPressure = Math.min(40, severityWeighted / 10);
  const overduePressure = Math.min(30, Number(overdue.rows?.[0]?.overdue_issues || 0) * 2);
  const failedJobPressure = Math.min(20, Number(failedJobs.rows?.[0]?.failed_jobs || 0) * 3);
  const totalPressure = signalPressure + overduePressure + failedJobPressure;
  const healthScore = clampScore(100 - totalPressure, 0, 100);

  const factors = [
    { key: "signal_pressure", value: Number(signalPressure.toFixed(2)) },
    { key: "overdue_pressure", value: Number(overduePressure.toFixed(2)) },
    { key: "failed_job_pressure", value: Number(failedJobPressure.toFixed(2)) },
  ];

  await pool.query(
    `
      INSERT INTO health_scores(project_id, account_scope_id, account_id, score, factors, generated_at)
      VALUES ($1, $2, NULL, $3, $4::jsonb, now())
    `,
    [scope.projectId, scope.accountScopeId, healthScore, JSON.stringify(factors)]
  );

  await pool.query(
    `
      INSERT INTO risk_pattern_events(
        project_id,
        account_scope_id,
        pattern_key,
        title,
        weight,
        status,
        mitigation_playbook,
        evidence_refs,
        updated_at
      )
      VALUES ($1, $2, 'delivery_risk_cluster', 'Delivery risk pattern cluster', $3, 'open', $4::jsonb, $5::jsonb, now())
      ON CONFLICT DO NOTHING
    `,
    [
      scope.projectId,
      scope.accountScopeId,
      Math.min(1, totalPressure / 100),
      JSON.stringify({
        playbook: [
          "Review top severity signals",
          "Accept/dismiss stale signals",
          "Create/refresh mitigation NBA",
          "Align with client timeline",
        ],
      }),
      JSON.stringify(signals.rows.flatMap((row) => row.evidence_refs || []).slice(0, 25)),
    ]
  );

  await pool.query(
    `
      INSERT INTO risk_radar_items(
        project_id,
        account_scope_id,
        account_id,
        opportunity_id,
        severity,
        probability,
        title,
        mitigation_action,
        status,
        evidence_refs,
        updated_at
      )
      VALUES ($1, $2, NULL, NULL, $3, $4, 'Project delivery/commercial risk composite', $5, 'open', $6::jsonb, now())
      ON CONFLICT DO NOTHING
    `,
    [
      scope.projectId,
      scope.accountScopeId,
      Math.max(1, Math.min(5, Math.round(totalPressure / 20))),
      Math.max(0, Math.min(1, totalPressure / 100)),
      "Run mitigation playbook and prioritize accepted NBA items.",
      JSON.stringify(signals.rows.flatMap((row) => row.evidence_refs || []).slice(0, 25)),
    ]
  );

  return {
    health_score: Number(healthScore.toFixed(2)),
    factors,
    total_pressure: Number(totalPressure.toFixed(2)),
  };
}

export async function getRiskOverview(pool, scope) {
  const [health, risks, patterns] = await Promise.all([
    pool.query(
      `
        SELECT score, factors, generated_at
        FROM health_scores
        WHERE project_id = $1
          AND account_scope_id = $2
        ORDER BY generated_at DESC
        LIMIT 1
      `,
      [scope.projectId, scope.accountScopeId]
    ),
    pool.query(
      `
        SELECT severity, probability, title, mitigation_action, status, evidence_refs, updated_at
        FROM risk_radar_items
        WHERE project_id = $1
          AND account_scope_id = $2
        ORDER BY updated_at DESC
        LIMIT 30
      `,
      [scope.projectId, scope.accountScopeId]
    ),
    pool.query(
      `
        SELECT pattern_key, title, weight, status, mitigation_playbook, evidence_refs, updated_at
        FROM risk_pattern_events
        WHERE project_id = $1
          AND account_scope_id = $2
        ORDER BY updated_at DESC
        LIMIT 30
      `,
      [scope.projectId, scope.accountScopeId]
    ),
  ]);

  return {
    health: health.rows[0] || null,
    risks: risks.rows,
    patterns: patterns.rows,
  };
}

export async function generateDailyDigest(pool, scope) {
  const [signals, overdue, outbound, topNba] = await Promise.all([
    pool.query(
      `
        SELECT count(*)::int AS proposed_signals
        FROM signals
        WHERE project_id = $1
          AND account_scope_id = $2
          AND status = 'proposed'
      `,
      [scope.projectId, scope.accountScopeId]
    ),
    pool.query(
      `
        SELECT count(*)::int AS overdue_issues
        FROM linear_issues_raw
        WHERE project_id = $1
          AND account_scope_id = $2
          AND completed_at IS NULL
          AND due_date IS NOT NULL
          AND due_date < current_date
      `,
      [scope.projectId, scope.accountScopeId]
    ),
    pool.query(
      `
        SELECT
          count(*) FILTER (WHERE status = 'draft')::int AS draft,
          count(*) FILTER (WHERE status = 'approved')::int AS approved,
          count(*) FILTER (WHERE status = 'failed')::int AS failed
        FROM outbound_messages
        WHERE project_id = $1
          AND account_scope_id = $2
      `,
      [scope.projectId, scope.accountScopeId]
    ),
    getTopNba(pool, scope, 8),
  ]);

  const summary = {
    project_id: scope.projectId,
    account_scope_id: scope.accountScopeId,
    generated_at: new Date().toISOString(),
    highlights: {
      proposed_signals: Number(signals.rows?.[0]?.proposed_signals || 0),
      overdue_issues: Number(overdue.rows?.[0]?.overdue_issues || 0),
      outbound_draft: Number(outbound.rows?.[0]?.draft || 0),
      outbound_approved: Number(outbound.rows?.[0]?.approved || 0),
      outbound_failed: Number(outbound.rows?.[0]?.failed || 0),
    },
    top_nba: topNba.map((row) => ({
      id: row.id,
      action_type: row.action_type,
      priority: row.priority,
      status: row.status,
      summary: row.summary,
    })),
  };
  const evidenceRefs = topNba.flatMap((row) => row.evidence_refs || []).slice(0, 50);
  const date = new Date().toISOString().slice(0, 10);
  await pool.query(
    `
      INSERT INTO daily_digests(project_id, account_scope_id, digest_date, summary, evidence_refs)
      VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
      ON CONFLICT (project_id, digest_date)
      DO UPDATE SET
        summary = EXCLUDED.summary,
        evidence_refs = EXCLUDED.evidence_refs,
        created_at = now()
    `,
    [scope.projectId, scope.accountScopeId, date, JSON.stringify(summary), JSON.stringify(evidenceRefs)]
  );
  return { digest_date: date, summary, evidence_refs: evidenceRefs };
}

export async function generateWeeklyDigest(pool, scope) {
  const [analytics, risk, topNba, opportunities] = await Promise.all([
    getAnalyticsOverview(pool, scope),
    getRiskOverview(pool, scope),
    getTopNba(pool, scope, 12),
    pool.query(
      `
        SELECT count(*)::int AS open_pipeline
        FROM attio_opportunities_raw
        WHERE project_id = $1
          AND account_scope_id = $2
          AND lower(COALESCE(stage, '')) NOT IN ('won', 'lost', 'closed-won', 'closed-lost')
      `,
      [scope.projectId, scope.accountScopeId]
    ),
  ]);

  const weekStart = weekStartDate().toISOString().slice(0, 10);
  const summary = {
    project_id: scope.projectId,
    account_scope_id: scope.accountScopeId,
    generated_at: new Date().toISOString(),
    portfolio: {
      open_pipeline: Number(opportunities.rows?.[0]?.open_pipeline || 0),
      revenue: analytics.revenue,
      delivery: analytics.delivery,
      comms: analytics.comms,
    },
    risk: {
      health: risk.health,
      top_risks: risk.risks.slice(0, 5),
      patterns: risk.patterns.slice(0, 5),
    },
    growth: {
      top_nba: topNba.map((row) => ({
        id: row.id,
        action_type: row.action_type,
        priority: row.priority,
        status: row.status,
        summary: row.summary,
      })),
    },
  };
  const evidenceRefs = [
    ...topNba.flatMap((row) => row.evidence_refs || []),
    ...(risk.risks || []).flatMap((row) => row.evidence_refs || []),
  ].slice(0, 80);
  await pool.query(
    `
      INSERT INTO weekly_digests(project_id, account_scope_id, week_start, summary, evidence_refs)
      VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
      ON CONFLICT (project_id, week_start)
      DO UPDATE SET
        summary = EXCLUDED.summary,
        evidence_refs = EXCLUDED.evidence_refs,
        created_at = now()
    `,
    [scope.projectId, scope.accountScopeId, weekStart, JSON.stringify(summary), JSON.stringify(evidenceRefs)]
  );
  return { week_start: weekStart, summary, evidence_refs: evidenceRefs };
}

export async function getDigests(pool, scope, type = "daily", limit = 20) {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 100)) : 20;
  if (type === "weekly") {
    const { rows } = await pool.query(
      `
        SELECT id, week_start, summary, evidence_refs, created_at
        FROM weekly_digests
        WHERE project_id = $1
          AND account_scope_id = $2
        ORDER BY week_start DESC
        LIMIT $3
      `,
      [scope.projectId, scope.accountScopeId, safeLimit]
    );
    return rows;
  }

  const { rows } = await pool.query(
    `
      SELECT id, digest_date, summary, evidence_refs, created_at
      FROM daily_digests
      WHERE project_id = $1
        AND account_scope_id = $2
      ORDER BY digest_date DESC
      LIMIT $3
    `,
    [scope.projectId, scope.accountScopeId, safeLimit]
  );
  return rows;
}

export async function getControlTower(pool, scope) {
  const [watermarks, attioSummary, linearSummary, chatSummary, nba, risk, analytics] = await Promise.all([
    pool.query(
      `
        SELECT source, cursor_ts, cursor_id, updated_at
        FROM sync_watermarks
        WHERE project_id = $1
          AND account_scope_id = $2
          AND source ~ '^(chatwoot|attio|linear):'
        ORDER BY updated_at DESC
      `,
      [scope.projectId, scope.accountScopeId]
    ),
    pool.query(
      `
        SELECT
          count(*)::int AS accounts,
          COALESCE(sum(annual_revenue), 0)::numeric(14,2) AS annual_revenue,
          (SELECT COALESCE(sum(amount), 0)::numeric(14,2)
           FROM attio_opportunities_raw
           WHERE project_id = $1 AND account_scope_id = $2) AS pipeline_amount
        FROM attio_accounts_raw
        WHERE project_id = $1
          AND account_scope_id = $2
      `,
      [scope.projectId, scope.accountScopeId]
    ),
    pool.query(
      `
        SELECT
          count(*)::int AS issues_total,
          count(*) FILTER (WHERE completed_at IS NULL)::int AS issues_open,
          count(*) FILTER (WHERE completed_at IS NULL AND due_date < current_date)::int AS issues_overdue
        FROM linear_issues_raw
        WHERE project_id = $1
          AND account_scope_id = $2
      `,
      [scope.projectId, scope.accountScopeId]
    ),
    pool.query(
      `
        SELECT
          count(*)::int AS conversations,
          count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS messages_7d
        FROM cw_messages
        WHERE project_id = $1
          AND account_scope_id = $2
      `,
      [scope.projectId, scope.accountScopeId]
    ),
    getTopNba(pool, scope, 8),
    getRiskOverview(pool, scope),
    getAnalyticsOverview(pool, scope),
  ]);

  const latestEvidence = await pool.query(
    `
      SELECT
        id,
        source_type,
        source_table,
        source_pk,
        snippet,
        created_at
      FROM evidence_items
      WHERE project_id = $1
        AND account_scope_id = $2
      ORDER BY created_at DESC
      LIMIT 12
    `,
    [scope.projectId, scope.accountScopeId]
  );

  return {
    project_id: scope.projectId,
    account_scope_id: scope.accountScopeId,
    integrations: {
      sync_watermarks: watermarks.rows,
      linear: linearSummary.rows[0] || null,
      attio: attioSummary.rows[0] || null,
      chatwoot: chatSummary.rows[0] || null,
    },
    top_nba: nba,
    risk,
    analytics,
    evidence: latestEvidence.rows,
  };
}
