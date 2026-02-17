import crypto from "node:crypto";

function similarityScore(a, b) {
  const left = String(a || "").trim().toLowerCase();
  const right = String(b || "").trim().toLowerCase();
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.86;
  const leftWords = new Set(left.split(/[^a-z0-9]+/g).filter(Boolean));
  const rightWords = new Set(right.split(/[^a-z0-9]+/g).filter(Boolean));
  if (!leftWords.size || !rightWords.size) return 0;
  let overlap = 0;
  for (const word of leftWords) {
    if (rightWords.has(word)) overlap += 1;
  }
  return overlap / Math.max(leftWords.size, rightWords.size);
}

function dedupeKey(leftType, leftId, rightType, rightId) {
  return crypto.createHash("sha1").update(`${leftType}:${leftId}|${rightType}:${rightId}`).digest("hex");
}

async function upsertSuggestions(pool, scope, suggestions) {
  if (!suggestions.length) return 0;
  const payload = suggestions.map((row) => ({
    project_id: scope.projectId,
    account_scope_id: scope.accountScopeId,
    left_entity_type: row.left_entity_type,
    left_entity_id: row.left_entity_id,
    right_entity_type: row.right_entity_type,
    right_entity_id: row.right_entity_id,
    confidence: row.confidence,
    reason: row.reason,
    status: "proposed",
    dedupe_key: row.dedupe_key,
    evidence_refs: row.evidence_refs || [],
    meta: row.meta || {},
  }));

  const result = await pool.query(
    `
      INSERT INTO identity_link_suggestions(
        project_id,
        account_scope_id,
        left_entity_type,
        left_entity_id,
        right_entity_type,
        right_entity_id,
        confidence,
        reason,
        status,
        dedupe_key,
        evidence_refs,
        meta,
        updated_at
      )
      SELECT
        x.project_id,
        x.account_scope_id,
        x.left_entity_type,
        x.left_entity_id,
        x.right_entity_type,
        x.right_entity_id,
        x.confidence,
        x.reason,
        x.status,
        x.dedupe_key,
        x.evidence_refs,
        x.meta,
        now()
      FROM jsonb_to_recordset($1::jsonb) AS x(
        project_id uuid,
        account_scope_id uuid,
        left_entity_type text,
        left_entity_id text,
        right_entity_type text,
        right_entity_id text,
        confidence numeric,
        reason text,
        status text,
        dedupe_key text,
        evidence_refs jsonb,
        meta jsonb
      )
      ON CONFLICT (project_id, dedupe_key)
      DO UPDATE SET
        confidence = GREATEST(identity_link_suggestions.confidence, EXCLUDED.confidence),
        reason = EXCLUDED.reason,
        evidence_refs = EXCLUDED.evidence_refs,
        meta = EXCLUDED.meta,
        updated_at = now()
      WHERE identity_link_suggestions.status = 'proposed'
    `,
    [JSON.stringify(payload)]
  );
  return result.rowCount || 0;
}

function domainFromEmail(email) {
  const value = String(email || "").trim().toLowerCase();
  if (!value || !value.includes("@")) return null;
  return value.split("@")[1] || null;
}

export async function previewIdentitySuggestions(pool, scope, limit = 100) {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 200)) : 100;
  const [contactsResult, attioResult, linearProjectsResult] = await Promise.all([
    pool.query(
      `
        SELECT id, name, email
        FROM cw_contacts
        WHERE project_id = $1
          AND account_scope_id = $2
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 400
      `,
      [scope.projectId, scope.accountScopeId]
    ),
    pool.query(
      `
        SELECT id, external_id, name, domain
        FROM attio_accounts_raw
        WHERE project_id = $1
          AND account_scope_id = $2
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 400
      `,
      [scope.projectId, scope.accountScopeId]
    ),
    pool.query(
      `
        SELECT id, external_id, name
        FROM linear_projects_raw
        WHERE project_id = $1
          AND account_scope_id = $2
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 400
      `,
      [scope.projectId, scope.accountScopeId]
    ),
  ]);

  const suggestions = [];
  for (const contact of contactsResult.rows) {
    const contactName = String(contact.name || "").trim();
    const contactDomain = domainFromEmail(contact.email);
    for (const account of attioResult.rows) {
      const nameScore = similarityScore(contactName, account.name);
      const domainScore = contactDomain && account.domain && contactDomain === String(account.domain).toLowerCase() ? 1 : 0;
      const score = Math.max(nameScore, domainScore * 0.95);
      if (score < 0.72) continue;
      const reason = domainScore > 0 ? "matching_email_domain" : "matching_contact_account_name";
      suggestions.push({
        left_entity_type: "cw_contact",
        left_entity_id: contact.id,
        right_entity_type: "attio_account",
        right_entity_id: account.id,
        confidence: Number(score.toFixed(4)),
        reason,
        dedupe_key: dedupeKey("cw_contact", contact.id, "attio_account", account.id),
        evidence_refs: [contact.id, account.id],
        meta: {
          contact_name: contactName || null,
          account_name: account.name || null,
          contact_domain: contactDomain,
          account_domain: account.domain || null,
        },
      });
    }
  }

  for (const account of attioResult.rows) {
    for (const linearProject of linearProjectsResult.rows) {
      const score = similarityScore(account.name, linearProject.name);
      if (score < 0.65) continue;
      suggestions.push({
        left_entity_type: "attio_account",
        left_entity_id: account.id,
        right_entity_type: "linear_project",
        right_entity_id: linearProject.id,
        confidence: Number(score.toFixed(4)),
        reason: "matching_account_project_name",
        dedupe_key: dedupeKey("attio_account", account.id, "linear_project", linearProject.id),
        evidence_refs: [account.id, linearProject.id],
        meta: {
          account_name: account.name || null,
          linear_project_name: linearProject.name || null,
        },
      });
    }
  }

  suggestions.sort((a, b) => b.confidence - a.confidence);
  const unique = [];
  const seen = new Set();
  for (const suggestion of suggestions) {
    if (seen.has(suggestion.dedupe_key)) continue;
    seen.add(suggestion.dedupe_key);
    unique.push(suggestion);
    if (unique.length >= safeLimit) break;
  }

  const stored = await upsertSuggestions(pool, scope, unique);
  return {
    generated: unique.length,
    stored,
    suggestions: unique,
  };
}

export async function listIdentitySuggestions(pool, scope, options = {}) {
  const limitRaw = Number.parseInt(String(options.limit || "50"), 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 200)) : 50;
  const status = String(options.status || "proposed").trim();
  const { rows } = await pool.query(
    `
      SELECT
        id,
        left_entity_type,
        left_entity_id,
        right_entity_type,
        right_entity_id,
        confidence,
        reason,
        status,
        evidence_refs,
        meta,
        created_at,
        updated_at
      FROM identity_link_suggestions
      WHERE project_id = $1
        AND account_scope_id = $2
        AND ($3 = '' OR status = $3)
      ORDER BY confidence DESC, updated_at DESC
      LIMIT $4
    `,
    [scope.projectId, scope.accountScopeId, status === "all" ? "" : status, limit]
  );
  return rows;
}

export async function applyIdentitySuggestions(pool, scope, suggestionIds = [], actorUsername = null) {
  if (!Array.isArray(suggestionIds) || !suggestionIds.length) {
    return { applied: 0, links: [] };
  }

  const { rows } = await pool.query(
    `
      SELECT
        id,
        left_entity_type,
        left_entity_id,
        right_entity_type,
        right_entity_id,
        confidence,
        evidence_refs
      FROM identity_link_suggestions
      WHERE project_id = $1
        AND account_scope_id = $2
        AND id = ANY($3::uuid[])
        AND status = 'proposed'
    `,
    [scope.projectId, scope.accountScopeId, suggestionIds]
  );
  if (!rows.length) {
    return { applied: 0, links: [] };
  }

  const payload = rows.map((row) => ({
    project_id: scope.projectId,
    account_scope_id: scope.accountScopeId,
    left_entity_type: row.left_entity_type,
    left_entity_id: row.left_entity_id,
    right_entity_type: row.right_entity_type,
    right_entity_id: row.right_entity_id,
    status: "active",
    source: "suggestion",
    evidence_refs: row.evidence_refs || [],
    created_by: actorUsername,
  }));

  const inserted = await pool.query(
    `
      INSERT INTO identity_links(
        project_id,
        account_scope_id,
        left_entity_type,
        left_entity_id,
        right_entity_type,
        right_entity_id,
        status,
        source,
        evidence_refs,
        created_by
      )
      SELECT
        x.project_id,
        x.account_scope_id,
        x.left_entity_type,
        x.left_entity_id,
        x.right_entity_type,
        x.right_entity_id,
        x.status,
        x.source,
        x.evidence_refs,
        x.created_by
      FROM jsonb_to_recordset($1::jsonb) AS x(
        project_id uuid,
        account_scope_id uuid,
        left_entity_type text,
        left_entity_id text,
        right_entity_type text,
        right_entity_id text,
        status text,
        source text,
        evidence_refs jsonb,
        created_by text
      )
      ON CONFLICT (project_id, left_entity_type, left_entity_id, right_entity_type, right_entity_id)
      DO UPDATE SET
        status = 'active',
        source = EXCLUDED.source,
        evidence_refs = EXCLUDED.evidence_refs,
        created_by = EXCLUDED.created_by
      RETURNING id, left_entity_type, left_entity_id, right_entity_type, right_entity_id, status, source, evidence_refs, created_at
    `,
    [JSON.stringify(payload)]
  );

  await pool.query(
    `
      UPDATE identity_link_suggestions
      SET status = 'applied',
          updated_at = now()
      WHERE project_id = $1
        AND account_scope_id = $2
        AND id = ANY($3::uuid[])
    `,
    [scope.projectId, scope.accountScopeId, rows.map((row) => row.id)]
  );

  return {
    applied: inserted.rowCount || 0,
    links: inserted.rows,
  };
}

export async function listIdentityLinks(pool, scope, options = {}) {
  const limitRaw = Number.parseInt(String(options.limit || "100"), 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 400)) : 100;
  const status = String(options.status || "active").trim();
  const { rows } = await pool.query(
    `
      SELECT
        id,
        left_entity_type,
        left_entity_id,
        right_entity_type,
        right_entity_id,
        status,
        source,
        evidence_refs,
        created_by,
        created_at
      FROM identity_links
      WHERE project_id = $1
        AND account_scope_id = $2
        AND ($3 = '' OR status = $3)
      ORDER BY created_at DESC
      LIMIT $4
    `,
    [scope.projectId, scope.accountScopeId, status === "all" ? "" : status, limit]
  );
  return rows;
}
