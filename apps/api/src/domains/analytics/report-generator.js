/**
 * Report Generator Service (Iter 48.2)
 *
 * Takes a template + date range and produces structured report data.
 * Aggregates data from projects, connectors, jobs, embeddings.
 *
 * Supported sections:
 * - summary_stats: High-level project metrics (messages, issues, pipeline)
 * - connector_health: Connector sync watermarks and failure rates
 * - project_activity: Recent activity (messages, issues, signals)
 * - embedding_coverage: RAG embedding status distribution
 * - error_summary: Recent job errors and connector failures
 */

// ── Section data collectors ─────────────────────────────────────

/**
 * @param {import('pg').Pool} pool
 * @param {{ projectId: string, accountScopeId: string }} scope
 * @param {string} dateStart - ISO date string
 * @param {string} dateEnd   - ISO date string
 */
async function collectSummaryStats(pool, scope, dateStart, dateEnd) {
  const { rows } = await pool.query(
    `
      WITH params AS (
        SELECT $3::date AS range_start, $4::date AS range_end
      ),
      msg AS (
        SELECT
          count(*)::int AS total_messages,
          count(*) FILTER (WHERE message_type = '0')::int AS inbound_messages,
          count(*) FILTER (WHERE message_type = '1')::int AS outbound_messages,
          count(DISTINCT contact_global_id)::int AS unique_contacts
        FROM cw_messages
        WHERE project_id = $1
          AND account_scope_id = $2
          AND created_at >= (SELECT range_start FROM params)
          AND created_at < (SELECT range_end FROM params) + interval '1 day'
      ),
      issues AS (
        SELECT
          count(*)::int AS total_issues,
          count(*) FILTER (WHERE completed_at IS NOT NULL)::int AS completed_issues,
          count(*) FILTER (WHERE completed_at IS NULL)::int AS open_issues,
          count(*) FILTER (WHERE completed_at IS NULL AND due_date < current_date)::int AS overdue_issues
        FROM linear_issues_raw
        WHERE project_id = $1
          AND account_scope_id = $2
      ),
      pipeline AS (
        SELECT
          COALESCE(sum(amount), 0)::numeric(14,2) AS pipeline_amount,
          COALESCE(sum(amount * probability), 0)::numeric(14,2) AS expected_revenue,
          count(*)::int AS open_opportunities
        FROM attio_opportunities_raw
        WHERE project_id = $1
          AND account_scope_id = $2
          AND lower(COALESCE(stage, '')) NOT IN ('won', 'lost', 'closed-won', 'closed-lost')
      ),
      health AS (
        SELECT score AS health_score, generated_at
        FROM health_scores
        WHERE project_id = $1
          AND account_scope_id = $2
        ORDER BY generated_at DESC
        LIMIT 1
      )
      SELECT
        msg.total_messages,
        msg.inbound_messages,
        msg.outbound_messages,
        msg.unique_contacts,
        issues.total_issues,
        issues.completed_issues,
        issues.open_issues,
        issues.overdue_issues,
        pipeline.pipeline_amount,
        pipeline.expected_revenue,
        pipeline.open_opportunities,
        health.health_score,
        health.generated_at AS health_generated_at
      FROM msg, issues, pipeline
      LEFT JOIN health ON true
    `,
    [scope.projectId, scope.accountScopeId, dateStart, dateEnd]
  );
  return rows[0] || {};
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ projectId: string, accountScopeId: string }} scope
 */
async function collectConnectorHealth(pool, scope) {
  const [watermarks, recentErrors] = await Promise.all([
    pool.query(
      `
        SELECT
          source,
          cursor_ts,
          cursor_id,
          updated_at
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
          connector,
          count(*)::int AS error_count,
          max(captured_at) AS latest_error_at
        FROM connector_event_log
        WHERE project_id = $1
          AND account_scope_id = $2
          AND event_type = 'error'
          AND captured_at > now() - interval '7 days'
        GROUP BY connector
        ORDER BY error_count DESC
      `,
      [scope.projectId, scope.accountScopeId]
    ),
  ]);
  return {
    watermarks: watermarks.rows,
    recent_errors_by_connector: recentErrors.rows,
  };
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ projectId: string, accountScopeId: string }} scope
 * @param {string} dateStart
 * @param {string} dateEnd
 */
async function collectProjectActivity(pool, scope, dateStart, dateEnd) {
  const [signals, recentMessages, recentIssues] = await Promise.all([
    pool.query(
      `
        SELECT
          count(*)::int AS total_signals,
          count(*) FILTER (WHERE status = 'proposed')::int AS proposed,
          count(*) FILTER (WHERE status = 'accepted')::int AS accepted,
          count(*) FILTER (WHERE status = 'dismissed')::int AS dismissed
        FROM signals
        WHERE project_id = $1
          AND account_scope_id = $2
          AND created_at >= $3::date
          AND created_at < $4::date + interval '1 day'
      `,
      [scope.projectId, scope.accountScopeId, dateStart, dateEnd]
    ),
    pool.query(
      `
        SELECT count(*)::int AS messages_in_range
        FROM cw_messages
        WHERE project_id = $1
          AND account_scope_id = $2
          AND created_at >= $3::date
          AND created_at < $4::date + interval '1 day'
      `,
      [scope.projectId, scope.accountScopeId, dateStart, dateEnd]
    ),
    pool.query(
      `
        SELECT
          count(*) FILTER (WHERE created_at >= $3::date AND created_at < $4::date + interval '1 day')::int AS created_in_range,
          count(*) FILTER (WHERE completed_at >= $3::date AND completed_at < $4::date + interval '1 day')::int AS completed_in_range
        FROM linear_issues_raw
        WHERE project_id = $1
          AND account_scope_id = $2
      `,
      [scope.projectId, scope.accountScopeId, dateStart, dateEnd]
    ),
  ]);
  return {
    signals: signals.rows[0] || {},
    messages_in_range: Number(recentMessages.rows[0]?.messages_in_range || 0),
    issues: recentIssues.rows[0] || {},
  };
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ projectId: string, accountScopeId: string }} scope
 */
async function collectEmbeddingCoverage(pool, scope) {
  const { rows } = await pool.query(
    `
      SELECT
        COALESCE(rag_status, 'unknown') AS status,
        count(*)::int AS cnt
      FROM rag_items
      WHERE project_id = $1
        AND account_scope_id = $2
      GROUP BY rag_status
      ORDER BY cnt DESC
    `,
    [scope.projectId, scope.accountScopeId]
  );
  const totals = rows.reduce((acc, r) => {
    acc[r.status] = Number(r.cnt);
    acc.total = (acc.total || 0) + Number(r.cnt);
    return acc;
  }, { total: 0 });
  return {
    by_status: rows,
    totals,
    coverage_pct:
      totals.total > 0
        ? Number(((Number(totals.ready || 0) / totals.total) * 100).toFixed(2))
        : 0,
  };
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ projectId: string, accountScopeId: string }} scope
 */
async function collectErrorSummary(pool, scope) {
  const [jobErrors, connectorErrors] = await Promise.all([
    pool.query(
      `
        SELECT
          job_type,
          count(*)::int AS error_count,
          max(started_at) AS latest_error_at,
          (array_agg(error ORDER BY started_at DESC))[1] AS latest_error
        FROM worker_runs
        WHERE project_id = $1
          AND account_scope_id = $2
          AND status = 'failed'
          AND started_at > now() - interval '7 days'
        GROUP BY job_type
        ORDER BY error_count DESC
        LIMIT 20
      `,
      [scope.projectId, scope.accountScopeId]
    ),
    pool.query(
      `
        SELECT
          connector,
          event_type,
          count(*)::int AS event_count,
          max(captured_at) AS latest_at,
          (array_agg(payload ORDER BY captured_at DESC))[1] AS latest_payload
        FROM connector_event_log
        WHERE project_id = $1
          AND account_scope_id = $2
          AND event_type IN ('error', 'warning')
          AND captured_at > now() - interval '7 days'
        GROUP BY connector, event_type
        ORDER BY event_count DESC
        LIMIT 20
      `,
      [scope.projectId, scope.accountScopeId]
    ),
  ]);
  return {
    job_errors: jobErrors.rows,
    connector_errors: connectorErrors.rows,
  };
}

// ── Section dispatcher ──────────────────────────────────────────

const SECTION_COLLECTORS = {
  summary_stats: collectSummaryStats,
  connector_health: collectConnectorHealth,
  project_activity: collectProjectActivity,
  embedding_coverage: collectEmbeddingCoverage,
  error_summary: collectErrorSummary,
};

// ── HTML renderer (simple) ──────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderSectionHtml(sectionName, data) {
  const title = sectionName.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  let content = `<h2>${escapeHtml(title)}</h2>\n`;
  content += `<pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>\n`;
  return content;
}

/**
 * Render report data as a simple HTML document.
 * @param {string} templateName
 * @param {string} dateStart
 * @param {string} dateEnd
 * @param {Record<string, unknown>} sections
 * @returns {string}
 */
function renderReportHtml(templateName, dateStart, dateEnd, sections) {
  const parts = [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    `<meta charset="utf-8">`,
    `<title>${escapeHtml(templateName)} — ${escapeHtml(dateStart)} to ${escapeHtml(dateEnd)}</title>`,
    "<style>",
    "body { font-family: system-ui, sans-serif; max-width: 960px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }",
    "h1 { font-size: 1.5rem; border-bottom: 2px solid #e5e5e5; padding-bottom: 0.5rem; }",
    "h2 { font-size: 1.2rem; color: #444; margin-top: 2rem; }",
    "pre { background: #f5f5f5; padding: 1rem; border-radius: 6px; overflow-x: auto; font-size: 0.85rem; }",
    ".meta { color: #666; font-size: 0.9rem; margin-bottom: 1.5rem; }",
    "</style>",
    "</head>",
    "<body>",
    `<h1>${escapeHtml(templateName)}</h1>`,
    `<p class="meta">Period: ${escapeHtml(dateStart)} — ${escapeHtml(dateEnd)} | Generated: ${new Date().toISOString()}</p>`,
  ];

  for (const [name, data] of Object.entries(sections)) {
    parts.push(renderSectionHtml(name, data));
  }

  parts.push("</body>", "</html>");
  return parts.join("\n");
}

// ── Main generator ──────────────────────────────────────────────

/**
 * Generate a report from a template definition and date range.
 *
 * @param {import('pg').Pool} pool
 * @param {{ projectId: string, accountScopeId: string }} scope
 * @param {object} template - Template object with { name, sections, format }
 * @param {string} dateStart - ISO date (YYYY-MM-DD)
 * @param {string} dateEnd   - ISO date (YYYY-MM-DD)
 * @returns {Promise<{ data: Record<string, unknown>, html?: string }>}
 */
export async function generateReport(pool, scope, template, dateStart, dateEnd) {
  const sections = Array.isArray(template.sections) ? template.sections : [];
  const sectionData = {};

  for (const sectionName of sections) {
    const collector = SECTION_COLLECTORS[sectionName];
    if (!collector) {
      sectionData[sectionName] = { error: "unknown_section" };
      continue;
    }
    // Collectors that need date range get 4 args, others get 2
    if (sectionName === "summary_stats" || sectionName === "project_activity") {
      sectionData[sectionName] = await collector(pool, scope, dateStart, dateEnd);
    } else {
      sectionData[sectionName] = await collector(pool, scope);
    }
  }

  const result = {
    template_name: template.name,
    date_range: { start: dateStart, end: dateEnd },
    generated_at: new Date().toISOString(),
    sections: sectionData,
  };

  if (template.format === "html") {
    result.html = renderReportHtml(template.name, dateStart, dateEnd, sectionData);
  }

  return result;
}

/**
 * Generate a report and persist it in the generated_reports table.
 *
 * @param {import('pg').Pool} pool
 * @param {{ projectId: string, accountScopeId: string }} scope
 * @param {object} template - Full template row
 * @param {string} dateStart
 * @param {string} dateEnd
 * @returns {Promise<object>} - The generated_reports row
 */
export async function generateAndStoreReport(pool, scope, template, dateStart, dateEnd) {
  // Insert a pending record first
  const { rows: insertRows } = await pool.query(
    `
      INSERT INTO generated_reports(
        template_id, project_id, account_scope_id,
        template_name, date_range_start, date_range_end,
        format, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'generating')
      RETURNING id
    `,
    [
      template.id,
      scope.projectId,
      scope.accountScopeId,
      template.name,
      dateStart,
      dateEnd,
      template.format || "json",
    ]
  );
  const reportId = insertRows[0].id;

  try {
    const reportData = await generateReport(pool, scope, template, dateStart, dateEnd);

    const { rows } = await pool.query(
      `
        UPDATE generated_reports
        SET
          data = $2::jsonb,
          status = 'completed'
        WHERE id = $1
        RETURNING *
      `,
      [reportId, JSON.stringify(reportData)]
    );
    return rows[0];
  } catch (error) {
    const errMsg = String(error?.message || error).slice(0, 1000);
    await pool.query(
      `
        UPDATE generated_reports
        SET status = 'failed', error = $2
        WHERE id = $1
      `,
      [reportId, errMsg]
    );
    throw error;
  }
}

/**
 * List generated reports with optional filtering and pagination.
 *
 * @param {import('pg').Pool} pool
 * @param {{ projectId: string, accountScopeId: string }} scope
 * @param {object} [filters]
 * @param {string} [filters.templateId]
 * @param {string} [filters.status]
 * @param {string} [filters.dateFrom]
 * @param {string} [filters.dateTo]
 * @param {number} [filters.limit]
 * @param {number} [filters.offset]
 * @returns {Promise<{ reports: object[], total: number }>}
 */
export async function listGeneratedReports(pool, scope, filters = {}) {
  const conditions = [
    "project_id = $1",
    "account_scope_id = $2",
  ];
  const values = [scope.projectId, scope.accountScopeId];
  let paramIdx = 3;

  if (filters.templateId) {
    conditions.push(`template_id = $${paramIdx}`);
    values.push(filters.templateId);
    paramIdx++;
  }
  if (filters.status) {
    conditions.push(`status = $${paramIdx}`);
    values.push(filters.status);
    paramIdx++;
  }
  if (filters.dateFrom) {
    conditions.push(`date_range_start >= $${paramIdx}::date`);
    values.push(filters.dateFrom);
    paramIdx++;
  }
  if (filters.dateTo) {
    conditions.push(`date_range_end <= $${paramIdx}::date`);
    values.push(filters.dateTo);
    paramIdx++;
  }

  const where = conditions.join(" AND ");
  const limit = Math.max(1, Math.min(Number(filters.limit) || 50, 200));
  const offset = Math.max(0, Number(filters.offset) || 0);

  const [countResult, dataResult] = await Promise.all([
    pool.query(
      `SELECT count(*)::int AS total FROM generated_reports WHERE ${where}`,
      values
    ),
    pool.query(
      `
        SELECT
          id, template_id, template_name,
          date_range_start, date_range_end,
          format, status, error, created_at
        FROM generated_reports
        WHERE ${where}
        ORDER BY created_at DESC
        LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
      `,
      [...values, limit, offset]
    ),
  ]);

  return {
    reports: dataResult.rows,
    total: Number(countResult.rows[0]?.total || 0),
  };
}

/**
 * Get a single generated report by ID (includes full data).
 *
 * @param {import('pg').Pool} pool
 * @param {{ projectId: string, accountScopeId: string }} scope
 * @param {string} reportId
 * @returns {Promise<object|null>}
 */
export async function getGeneratedReport(pool, scope, reportId) {
  const { rows } = await pool.query(
    `
      SELECT
        id, template_id, template_name,
        date_range_start, date_range_end,
        data, format, status, error, created_at
      FROM generated_reports
      WHERE id = $1
        AND project_id = $2
        AND account_scope_id = $3
      LIMIT 1
    `,
    [reportId, scope.projectId, scope.accountScopeId]
  );
  return rows[0] || null;
}
