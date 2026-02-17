import crypto from "node:crypto";

function dedupeKey(projectId, sourceRef, title) {
  return crypto.createHash("sha1").update(`${projectId}:${sourceRef}:${title}`).digest("hex");
}

function toScore(value, fallback = 0.5) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function detectFromMessage(row) {
  const text = String(row.content || "").toLowerCase();
  if (!text) return null;
  if (!/(upgrade|add-on|addon|expand|cross[- ]?sell|upsell|bundle|new module)/i.test(text)) {
    return null;
  }
  return {
    source_ref: row.id,
    account_external_id: null,
    title: "Potential expansion request from conversation",
    rationale: "Client language indicates upsell/cross-sell intent",
    score: 0.72,
    evidence_refs: [row.id, row.conversation_global_id].filter(Boolean),
    suggested_offer_payload: {
      template: "expansion_offer_v1",
      discount_recommendation_pct: 5,
    },
    suggested_outbound_payload: {
      channel: "chatwoot",
      message: "We can extend scope with an add-on package. Want a short options breakdown?",
    },
  };
}

function detectFromOpportunity(row) {
  if (!row || !row.title) return null;
  const stage = String(row.stage || "").toLowerCase();
  if (!["qualified", "proposal", "negotiation"].includes(stage)) return null;
  const amount = Number(row.amount || 0);
  const score = amount > 50000 ? 0.8 : amount > 20000 ? 0.7 : 0.62;
  return {
    source_ref: row.id,
    account_external_id: row.account_external_id || null,
    title: `Expansion path for ${row.title}`,
    rationale: "Opportunity stage and amount indicate expansion room",
    score,
    evidence_refs: [row.id].filter(Boolean),
    suggested_offer_payload: {
      template: "attio_expansion_track",
      anchor_opportunity_id: row.id,
    },
    suggested_outbound_payload: {
      channel: "email",
      message: "Prepared expansion options aligned with your current roadmap milestone.",
    },
  };
}

async function upsertUpsellRows(pool, scope, rows) {
  if (!rows.length) return 0;
  const payload = rows.map((row) => ({
    project_id: scope.projectId,
    account_scope_id: scope.accountScopeId,
    account_external_id: row.account_external_id || null,
    source_ref: row.source_ref,
    title: row.title,
    rationale: row.rationale,
    score: toScore(row.score, 0.5),
    status: "proposed",
    suggested_offer_payload: row.suggested_offer_payload || {},
    suggested_outbound_payload: row.suggested_outbound_payload || {},
    evidence_refs: row.evidence_refs || [],
    dedupe_key: dedupeKey(scope.projectId, row.source_ref, row.title),
  }));

  const result = await pool.query(
    `
      INSERT INTO upsell_opportunities(
        project_id,
        account_scope_id,
        account_external_id,
        source_ref,
        title,
        rationale,
        score,
        status,
        suggested_offer_payload,
        suggested_outbound_payload,
        evidence_refs,
        dedupe_key,
        updated_at
      )
      SELECT
        x.project_id,
        x.account_scope_id,
        x.account_external_id,
        x.source_ref,
        x.title,
        x.rationale,
        x.score,
        x.status,
        x.suggested_offer_payload,
        x.suggested_outbound_payload,
        x.evidence_refs,
        x.dedupe_key,
        now()
      FROM jsonb_to_recordset($1::jsonb) AS x(
        project_id uuid,
        account_scope_id uuid,
        account_external_id text,
        source_ref text,
        title text,
        rationale text,
        score numeric,
        status text,
        suggested_offer_payload jsonb,
        suggested_outbound_payload jsonb,
        evidence_refs jsonb,
        dedupe_key text
      )
      ON CONFLICT (project_id, dedupe_key)
      DO UPDATE SET
        score = GREATEST(upsell_opportunities.score, EXCLUDED.score),
        rationale = EXCLUDED.rationale,
        suggested_offer_payload = EXCLUDED.suggested_offer_payload,
        suggested_outbound_payload = EXCLUDED.suggested_outbound_payload,
        evidence_refs = EXCLUDED.evidence_refs,
        updated_at = now()
      WHERE upsell_opportunities.status IN ('proposed', 'accepted')
    `,
    [JSON.stringify(payload)]
  );
  return result.rowCount || 0;
}

export async function refreshUpsellRadar(pool, scope) {
  const [messages, opportunities] = await Promise.all([
    pool.query(
      `
        SELECT id, conversation_global_id, left(content, 1200) AS content
        FROM cw_messages
        WHERE project_id = $1
          AND account_scope_id = $2
          AND private = false
          AND created_at > now() - interval '21 days'
        ORDER BY created_at DESC NULLS LAST
        LIMIT 500
      `,
      [scope.projectId, scope.accountScopeId]
    ),
    pool.query(
      `
        SELECT id, account_external_id, title, stage, amount
        FROM attio_opportunities_raw
        WHERE project_id = $1
          AND account_scope_id = $2
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 300
      `,
      [scope.projectId, scope.accountScopeId]
    ),
  ]);

  const candidates = [];
  for (const row of messages.rows) {
    const candidate = detectFromMessage(row);
    if (candidate) candidates.push(candidate);
  }
  for (const row of opportunities.rows) {
    const candidate = detectFromOpportunity(row);
    if (candidate) candidates.push(candidate);
  }

  const touched = await upsertUpsellRows(pool, scope, candidates);
  return {
    generated_candidates: candidates.length,
    touched,
  };
}

export async function listUpsellRadar(pool, scope, options = {}) {
  const limitRaw = Number.parseInt(String(options.limit || "100"), 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 400)) : 100;
  const status = String(options.status || "").trim();
  const { rows } = await pool.query(
    `
      SELECT
        id,
        account_external_id,
        source_ref,
        title,
        rationale,
        score,
        status,
        suggested_offer_payload,
        suggested_outbound_payload,
        evidence_refs,
        created_at,
        updated_at
      FROM upsell_opportunities
      WHERE project_id = $1
        AND account_scope_id = $2
        AND ($3 = '' OR status = $3)
      ORDER BY score DESC, updated_at DESC
      LIMIT $4
    `,
    [scope.projectId, scope.accountScopeId, status, limit]
  );
  return rows;
}

export async function updateUpsellStatus(pool, scope, id, status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (!["proposed", "accepted", "dismissed", "converted"].includes(normalized)) {
    throw new Error("invalid_upsell_status");
  }
  const { rows } = await pool.query(
    `
      UPDATE upsell_opportunities
      SET status = $4,
          updated_at = now()
      WHERE id = $1
        AND project_id = $2
        AND account_scope_id = $3
      RETURNING
        id,
        account_external_id,
        source_ref,
        title,
        rationale,
        score,
        status,
        suggested_offer_payload,
        suggested_outbound_payload,
        evidence_refs,
        created_at,
        updated_at
    `,
    [id, scope.projectId, scope.accountScopeId, normalized]
  );
  return rows[0] || null;
}
