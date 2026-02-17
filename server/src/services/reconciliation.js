function toPositiveInt(value, fallback, min = 1, max = 3650) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value || 0)));
}

function percentOf(ok, total) {
  const safeTotal = Math.max(0, toNumber(total, 0));
  if (safeTotal <= 0) return 100;
  return clampPercent((toNumber(ok, 0) / safeTotal) * 100);
}

function averagePercent(parts) {
  if (!Array.isArray(parts) || !parts.length) return 100;
  const sum = parts.reduce((acc, item) => acc + clampPercent(item), 0);
  return clampPercent(sum / parts.length);
}

function finalizeMetric(connector, source, totalCount, missingCount, duplicateCount, payload) {
  const total = Math.max(0, toNumber(totalCount, 0));
  const missing = Math.max(0, toNumber(missingCount, 0));
  const duplicates = Math.max(0, toNumber(duplicateCount, 0));
  const completeness = clampPercent(
    payload?.completeness_pct != null
      ? payload.completeness_pct
      : percentOf(Math.max(0, total - missing - duplicates), total)
  );
  return {
    connector,
    source,
    total_count: total,
    missing_count: missing,
    duplicate_count: duplicates,
    completeness_pct: Number(completeness.toFixed(2)),
    payload: payload && typeof payload === "object" ? payload : {},
  };
}

async function computeChatwootMetrics(pool, scope, source) {
  const { rows } = await pool.query(
    `
      SELECT
        (SELECT count(*)::int FROM cw_contacts WHERE project_id = $1 AND account_scope_id = $2) AS contacts_total,
        (SELECT count(*)::int FROM cw_conversations WHERE project_id = $1 AND account_scope_id = $2) AS conversations_total,
        (SELECT count(*)::int FROM cw_messages WHERE project_id = $1 AND account_scope_id = $2) AS messages_total,
        (SELECT count(*)::int FROM cw_messages WHERE project_id = $1 AND account_scope_id = $2 AND COALESCE(contact_global_id, '') = '') AS messages_without_contact,
        (SELECT count(*)::int FROM cw_conversations WHERE project_id = $1 AND account_scope_id = $2 AND COALESCE(contact_global_id, '') = '') AS conversations_without_contact,
        (
          SELECT GREATEST(count(*) - count(DISTINCT lower(email)), 0)::int
          FROM cw_contacts
          WHERE project_id = $1
            AND account_scope_id = $2
            AND email IS NOT NULL
            AND btrim(email) <> ''
        ) AS duplicate_contacts_by_email
    `,
    [scope.projectId, scope.accountScopeId]
  );
  const row = rows[0] || {};

  const contactsTotal = toNumber(row.contacts_total, 0);
  const conversationsTotal = toNumber(row.conversations_total, 0);
  const messagesTotal = toNumber(row.messages_total, 0);
  const missingMessages = toNumber(row.messages_without_contact, 0);
  const missingConversations = toNumber(row.conversations_without_contact, 0);
  const duplicateContacts = toNumber(row.duplicate_contacts_by_email, 0);

  const completeness = averagePercent([
    percentOf(messagesTotal - missingMessages, messagesTotal),
    percentOf(conversationsTotal - missingConversations, conversationsTotal),
    percentOf(Math.max(0, contactsTotal - duplicateContacts), contactsTotal),
  ]);
  const total = contactsTotal + conversationsTotal + messagesTotal;
  const missing = missingMessages + missingConversations;

  return finalizeMetric("chatwoot", source, total, missing, duplicateContacts, {
    completeness_pct: completeness,
    contacts_total: contactsTotal,
    conversations_total: conversationsTotal,
    messages_total: messagesTotal,
    messages_without_contact: missingMessages,
    conversations_without_contact: missingConversations,
    duplicate_contacts_by_email: duplicateContacts,
  });
}

async function computeLinearMetrics(pool, scope, source) {
  const { rows } = await pool.query(
    `
      SELECT
        count(*)::int AS issues_total,
        count(*) FILTER (WHERE COALESCE(btrim(state), '') = '')::int AS issues_without_state,
        count(*) FILTER (WHERE COALESCE(btrim(state_type), '') = '')::int AS issues_without_state_type,
        count(*) FILTER (WHERE COALESCE(btrim(title), '') = '')::int AS issues_without_title,
        count(*) FILTER (WHERE blocked = true AND blocked_by_count > 0)::int AS blocked_issues
      FROM linear_issues_raw
      WHERE project_id = $1
        AND account_scope_id = $2
    `,
    [scope.projectId, scope.accountScopeId]
  );
  const row = rows[0] || {};
  const total = toNumber(row.issues_total, 0);
  const missingState = toNumber(row.issues_without_state, 0);
  const missingStateType = toNumber(row.issues_without_state_type, 0);
  const missingTitle = toNumber(row.issues_without_title, 0);
  const blocked = toNumber(row.blocked_issues, 0);
  const missing = missingState + missingStateType + missingTitle;
  const completeness = averagePercent([
    percentOf(total - missingState, total),
    percentOf(total - missingStateType, total),
    percentOf(total - missingTitle, total),
  ]);

  return finalizeMetric("linear", source, total, missing, 0, {
    completeness_pct: completeness,
    issues_total: total,
    issues_without_state: missingState,
    issues_without_state_type: missingStateType,
    issues_without_title: missingTitle,
    blocked_issues: blocked,
  });
}

async function computeAttioMetrics(pool, scope, source) {
  const { rows } = await pool.query(
    `
      WITH raw_accounts AS (
        SELECT count(*)::int AS total
        FROM attio_accounts_raw
        WHERE project_id = $1
          AND account_scope_id = $2
      ),
      raw_opportunities AS (
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE COALESCE(account_external_id, '') = '')::int AS without_account_ref
        FROM attio_opportunities_raw
        WHERE project_id = $1
          AND account_scope_id = $2
      ),
      mapped_accounts AS (
        SELECT count(*)::int AS total
        FROM crm_accounts
        WHERE project_id = $1
          AND account_scope_id = $2
          AND source_system = 'attio'
          AND COALESCE(external_ref, '') <> ''
      ),
      mapped_opportunities AS (
        SELECT count(*)::int AS total
        FROM crm_opportunities
        WHERE project_id = $1
          AND account_scope_id = $2
          AND source_system = 'attio'
          AND COALESCE(external_ref, '') <> ''
      ),
      opportunities_with_account_ref AS (
        SELECT count(*)::int AS total
        FROM attio_opportunities_raw
        WHERE project_id = $1
          AND account_scope_id = $2
          AND COALESCE(account_external_id, '') <> ''
      ),
      opportunities_unmapped_to_crm_account AS (
        SELECT count(*)::int AS total
        FROM attio_opportunities_raw AS opp
        LEFT JOIN crm_accounts AS acc
          ON acc.project_id = opp.project_id
         AND acc.account_scope_id = opp.account_scope_id
         AND acc.source_system = 'attio'
         AND acc.external_ref = opp.account_external_id
        WHERE opp.project_id = $1
          AND opp.account_scope_id = $2
          AND COALESCE(opp.account_external_id, '') <> ''
          AND acc.id IS NULL
      )
      SELECT
        (SELECT total FROM raw_accounts) AS raw_accounts_total,
        (SELECT total FROM raw_opportunities) AS raw_opportunities_total,
        (SELECT without_account_ref FROM raw_opportunities) AS opportunities_without_account_ref,
        (SELECT total FROM mapped_accounts) AS mapped_accounts_total,
        (SELECT total FROM mapped_opportunities) AS mapped_opportunities_total,
        (SELECT total FROM opportunities_with_account_ref) AS opportunities_with_account_ref_total,
        (SELECT total FROM opportunities_unmapped_to_crm_account) AS opportunities_unmapped_to_crm_account_total
    `,
    [scope.projectId, scope.accountScopeId]
  );
  const row = rows[0] || {};

  const rawAccounts = toNumber(row.raw_accounts_total, 0);
  const rawOpportunities = toNumber(row.raw_opportunities_total, 0);
  const mappedAccounts = toNumber(row.mapped_accounts_total, 0);
  const mappedOpportunities = toNumber(row.mapped_opportunities_total, 0);
  const opportunitiesWithoutAccountRef = toNumber(row.opportunities_without_account_ref, 0);
  const opportunitiesWithAccountRef = toNumber(row.opportunities_with_account_ref_total, 0);
  const opportunitiesUnmappedToCrmAccount = toNumber(row.opportunities_unmapped_to_crm_account_total, 0);

  const completeness = averagePercent([
    percentOf(mappedAccounts, rawAccounts),
    percentOf(mappedOpportunities, rawOpportunities),
    percentOf(opportunitiesWithAccountRef - opportunitiesUnmappedToCrmAccount, opportunitiesWithAccountRef),
    percentOf(rawOpportunities - opportunitiesWithoutAccountRef, rawOpportunities),
  ]);

  const total = rawAccounts + rawOpportunities;
  const missing = opportunitiesWithoutAccountRef + opportunitiesUnmappedToCrmAccount;

  return finalizeMetric("attio", source, total, missing, 0, {
    completeness_pct: completeness,
    raw_accounts_total: rawAccounts,
    raw_opportunities_total: rawOpportunities,
    mapped_accounts_total: mappedAccounts,
    mapped_opportunities_total: mappedOpportunities,
    opportunities_without_account_ref: opportunitiesWithoutAccountRef,
    opportunities_unmapped_to_crm_account: opportunitiesUnmappedToCrmAccount,
  });
}

function buildPortfolioMetric(source, connectorMetrics = []) {
  const rows = Array.isArray(connectorMetrics) ? connectorMetrics : [];
  const totals = rows.reduce(
    (acc, row) => {
      acc.total += toNumber(row.total_count, 0);
      acc.missing += toNumber(row.missing_count, 0);
      acc.duplicates += toNumber(row.duplicate_count, 0);
      acc.weighted += toNumber(row.completeness_pct, 0) * Math.max(1, toNumber(row.total_count, 0));
      acc.weight += Math.max(1, toNumber(row.total_count, 0));
      return acc;
    },
    { total: 0, missing: 0, duplicates: 0, weighted: 0, weight: 0 }
  );
  const completeness = totals.weight > 0 ? totals.weighted / totals.weight : 100;
  return finalizeMetric("portfolio", source, totals.total, totals.missing, totals.duplicates, {
    completeness_pct: completeness,
    by_connector: rows.map((item) => ({
      connector: item.connector,
      completeness_pct: item.completeness_pct,
      total_count: item.total_count,
      missing_count: item.missing_count,
      duplicate_count: item.duplicate_count,
    })),
  });
}

async function persistMetric(pool, scope, metric) {
  await pool.query(
    `
      INSERT INTO sync_reconciliation_metrics(
        project_id,
        account_scope_id,
        connector,
        source,
        completeness_pct,
        duplicate_count,
        missing_count,
        total_count,
        payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
    `,
    [
      scope.projectId,
      scope.accountScopeId,
      metric.connector,
      metric.source,
      metric.completeness_pct,
      metric.duplicate_count,
      metric.missing_count,
      metric.total_count,
      JSON.stringify(metric.payload || {}),
    ]
  );
}

export async function runSyncReconciliation(pool, scope, options = {}) {
  const source = String(options.source || "manual").trim().toLowerCase() || "manual";
  const chatwoot = await computeChatwootMetrics(pool, scope, source);
  const linear = await computeLinearMetrics(pool, scope, source);
  const attio = await computeAttioMetrics(pool, scope, source);
  const portfolio = buildPortfolioMetric(source, [chatwoot, linear, attio]);
  const metrics = [chatwoot, linear, attio, portfolio];

  for (const metric of metrics) {
    await persistMetric(pool, scope, metric);
  }

  return {
    source,
    captured_at: new Date().toISOString(),
    metrics,
    summary: {
      completeness_pct: portfolio.completeness_pct,
      missing_count: portfolio.missing_count,
      duplicate_count: portfolio.duplicate_count,
      total_count: portfolio.total_count,
    },
  };
}

export async function listSyncReconciliation(pool, scope, options = {}) {
  const days = toPositiveInt(options.days, 14, 1, 365);
  const limit = toPositiveInt(options.limit, 500, 20, 3000);

  const [latestRows, trendRows, byConnectorRows] = await Promise.all([
    pool.query(
      `
        SELECT DISTINCT ON (connector)
          connector,
          source,
          completeness_pct,
          duplicate_count,
          missing_count,
          total_count,
          payload,
          captured_at
        FROM sync_reconciliation_metrics
        WHERE project_id = $1
          AND account_scope_id = $2
        ORDER BY connector ASC, captured_at DESC
      `,
      [scope.projectId, scope.accountScopeId]
    ),
    pool.query(
      `
        SELECT
          date_trunc('day', captured_at)::date::text AS point,
          avg(completeness_pct)::numeric(6,2) AS completeness_pct,
          sum(missing_count)::int AS missing_count,
          sum(duplicate_count)::int AS duplicate_count,
          sum(total_count)::int AS total_count
        FROM sync_reconciliation_metrics
        WHERE project_id = $1
          AND account_scope_id = $2
          AND connector <> 'portfolio'
          AND captured_at >= now() - (($3::int)::text || ' days')::interval
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      [scope.projectId, scope.accountScopeId, days]
    ),
    pool.query(
      `
        SELECT
          date_trunc('day', captured_at)::date::text AS point,
          connector,
          avg(completeness_pct)::numeric(6,2) AS completeness_pct,
          sum(missing_count)::int AS missing_count,
          sum(duplicate_count)::int AS duplicate_count,
          sum(total_count)::int AS total_count
        FROM sync_reconciliation_metrics
        WHERE project_id = $1
          AND account_scope_id = $2
          AND connector <> 'portfolio'
          AND captured_at >= now() - (($3::int)::text || ' days')::interval
        GROUP BY 1, 2
        ORDER BY point ASC, connector ASC
        LIMIT $4
      `,
      [scope.projectId, scope.accountScopeId, days, limit]
    ),
  ]);

  return {
    latest: latestRows.rows.map((row) => ({
      connector: row.connector,
      source: row.source,
      completeness_pct: toNumber(row.completeness_pct, 0),
      duplicate_count: toNumber(row.duplicate_count, 0),
      missing_count: toNumber(row.missing_count, 0),
      total_count: toNumber(row.total_count, 0),
      payload: row.payload || {},
      captured_at: row.captured_at,
    })),
    trend: trendRows.rows.map((row) => ({
      point: row.point,
      completeness_pct: toNumber(row.completeness_pct, 0),
      missing_count: toNumber(row.missing_count, 0),
      duplicate_count: toNumber(row.duplicate_count, 0),
      total_count: toNumber(row.total_count, 0),
    })),
    by_connector: byConnectorRows.rows.map((row) => ({
      point: row.point,
      connector: row.connector,
      completeness_pct: toNumber(row.completeness_pct, 0),
      missing_count: toNumber(row.missing_count, 0),
      duplicate_count: toNumber(row.duplicate_count, 0),
      total_count: toNumber(row.total_count, 0),
    })),
  };
}
