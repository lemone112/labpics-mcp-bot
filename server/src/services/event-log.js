import crypto from "node:crypto";

function toDate(value, fallback = null) {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : fallback;
}

function toIso(value, fallback = null) {
  const date = toDate(value, fallback ? toDate(fallback) : null);
  return date ? date.toISOString() : null;
}

function clampInt(value, fallback, min = 1, max = 20000) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function asText(value, max = 4000) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, max);
}

function dedupeKey(parts) {
  return crypto
    .createHash("sha1")
    .update(parts.map((part) => String(part || "")).join("|"))
    .digest("hex");
}

function toActorFromSender(senderType) {
  const normalized = String(senderType || "").toLowerCase();
  if (normalized.includes("contact") || normalized.includes("customer")) return "client";
  if (normalized.includes("agent") || normalized.includes("user") || normalized.includes("team")) return "team";
  return "system";
}

function buildChatwootUrl(accountId, conversationId, messageId) {
  if (!accountId || !conversationId || !messageId) return null;
  return `chatwoot://accounts/${accountId}/conversations/${conversationId}/messages/${messageId}`;
}

function detectScopeChange(content) {
  const text = String(content || "").toLowerCase();
  if (!text) return false;
  return /(out of scope|outside scope|change request|вне скоупа|дополнительно|доработк)/i.test(text);
}

function detectApproval(content) {
  const text = String(content || "").toLowerCase();
  if (!text) return false;
  return /(approve|approval|апрув|подтверд|согласу(йте|ем))/i.test(text);
}

function buildMessagePayload(row) {
  return {
    conversation_global_id: row.conversation_global_id || null,
    message_global_id: row.id || null,
    sender_type: row.sender_type || null,
    private: Boolean(row.private),
    message_type: row.message_type || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    snippet: String(row.content || "").slice(0, 300),
  };
}

async function loadChatwootEventCandidates(pool, scope, sinceTs, untilTs, limit) {
  const { rows } = await pool.query(
    `
      SELECT
        id,
        account_id,
        message_id,
        conversation_id,
        conversation_global_id,
        sender_type,
        private,
        message_type,
        content,
        created_at,
        updated_at
      FROM cw_messages
      WHERE project_id = $1
        AND account_scope_id = $2
        AND COALESCE(updated_at, created_at) > $3::timestamptz
        AND COALESCE(updated_at, created_at) <= $4::timestamptz
      ORDER BY COALESCE(updated_at, created_at) ASC
      LIMIT $5
    `,
    [scope.projectId, scope.accountScopeId, sinceTs, untilTs, limit]
  );

  const events = [];
  for (const row of rows) {
    const occurredAt = toIso(row.created_at || row.updated_at, new Date());
    const actor = toActorFromSender(row.sender_type);
    const sourceRef = asText(row.id, 200) || asText(row.message_id, 200) || "unknown_message";
    const url = buildChatwootUrl(row.account_id, row.conversation_id, row.message_id);
    const payload = buildMessagePayload(row);

    events.push({
      event_type: "message_sent",
      occurred_at: occurredAt,
      actor,
      source: "chatwoot",
      source_ref: sourceRef,
      source_url: url,
      source_message_id: sourceRef,
      source_linear_issue_id: null,
      source_attio_record_id: null,
      payload_json: payload,
      dedupe_key: dedupeKey(["chatwoot", "message_sent", sourceRef, occurredAt]),
    });

    if (detectApproval(row.content)) {
      events.push({
        event_type: "approval_requested",
        occurred_at: occurredAt,
        actor,
        source: "chatwoot",
        source_ref: sourceRef,
        source_url: url,
        source_message_id: sourceRef,
        source_linear_issue_id: null,
        source_attio_record_id: null,
        payload_json: payload,
        dedupe_key: dedupeKey(["chatwoot", "approval_requested", sourceRef, occurredAt]),
      });
    }
    if (detectScopeChange(row.content)) {
      events.push({
        event_type: "scope_change_detected",
        occurred_at: occurredAt,
        actor,
        source: "chatwoot",
        source_ref: sourceRef,
        source_url: url,
        source_message_id: sourceRef,
        source_linear_issue_id: null,
        source_attio_record_id: null,
        payload_json: payload,
        dedupe_key: dedupeKey(["chatwoot", "scope_change_detected", sourceRef, occurredAt]),
      });
    }
  }
  return events;
}

async function loadClientSilentCandidates(pool, scope, untilTs, limit) {
  const { rows } = await pool.query(
    `
      WITH convo_stats AS (
        SELECT
          conversation_global_id,
          max(created_at) FILTER (
            WHERE lower(COALESCE(sender_type, '')) LIKE '%contact%'
               OR lower(COALESCE(sender_type, '')) LIKE '%customer%'
          ) AS last_client_at,
          max(created_at) FILTER (
            WHERE lower(COALESCE(sender_type, '')) NOT LIKE '%contact%'
              AND lower(COALESCE(sender_type, '')) NOT LIKE '%customer%'
          ) AS last_team_at
        FROM cw_messages
        WHERE project_id = $1
          AND account_scope_id = $2
          AND private = false
        GROUP BY conversation_global_id
      )
      SELECT
        conversation_global_id,
        last_client_at,
        last_team_at
      FROM convo_stats
      WHERE last_team_at IS NOT NULL
        AND (last_client_at IS NULL OR last_team_at > last_client_at)
        AND $3::timestamptz - last_team_at >= interval '4 days'
      ORDER BY last_team_at DESC
      LIMIT $4
    `,
    [scope.projectId, scope.accountScopeId, untilTs, limit]
  );

  return rows.map((row) => ({
    event_type: "client_silent_started",
    occurred_at: toIso(row.last_team_at, new Date()),
    actor: "system",
    source: "chatwoot",
    source_ref: asText(row.conversation_global_id, 200) || "unknown_conversation",
    source_url: null,
    source_message_id: null,
    source_linear_issue_id: null,
    source_attio_record_id: null,
    payload_json: {
      conversation_global_id: row.conversation_global_id,
      last_team_message_at: row.last_team_at,
      last_client_message_at: row.last_client_at,
    },
    dedupe_key: dedupeKey(["chatwoot", "client_silent_started", row.conversation_global_id, String(row.last_team_at || "")]),
  }));
}

async function loadLinearEventCandidates(pool, scope, sinceTs, untilTs, limit) {
  const { rows } = await pool.query(
    `
      SELECT
        id,
        external_id,
        title,
        state,
        blocked,
        blocked_by_count,
        due_date,
        completed_at,
        updated_at,
        data
      FROM linear_issues_raw
      WHERE project_id = $1
        AND account_scope_id = $2
        AND COALESCE(updated_at, created_at) > $3::timestamptz
        AND COALESCE(updated_at, created_at) <= $4::timestamptz
      ORDER BY COALESCE(updated_at, created_at) ASC
      LIMIT $5
    `,
    [scope.projectId, scope.accountScopeId, sinceTs, untilTs, limit]
  );

  const events = [];
  for (const row of rows) {
    const sourceRef = asText(row.external_id || row.id, 200) || "unknown_issue";
    const occurredAt = toIso(row.updated_at, new Date());
    const payload = {
      issue_id: sourceRef,
      title: row.title,
      state: row.state,
      blocked: Boolean(row.blocked),
      blocked_by_count: Number(row.blocked_by_count || 0),
      due_date: row.due_date || null,
      completed_at: row.completed_at || null,
    };

    events.push({
      event_type: "issue_created",
      occurred_at: occurredAt,
      actor: "system",
      source: "linear",
      source_ref: sourceRef,
      source_url: `linear://issues/${sourceRef}`,
      source_message_id: null,
      source_linear_issue_id: sourceRef,
      source_attio_record_id: null,
      payload_json: payload,
      dedupe_key: dedupeKey(["linear", "issue_created", sourceRef, occurredAt]),
    });

    events.push({
      event_type: row.blocked ? "issue_blocked" : "issue_unblocked",
      occurred_at: occurredAt,
      actor: "system",
      source: "linear",
      source_ref: sourceRef,
      source_url: `linear://issues/${sourceRef}`,
      source_message_id: null,
      source_linear_issue_id: sourceRef,
      source_attio_record_id: null,
      payload_json: payload,
      dedupe_key: dedupeKey(["linear", row.blocked ? "issue_blocked" : "issue_unblocked", sourceRef, occurredAt]),
    });
  }

  return events;
}

async function loadAttioEventCandidates(pool, scope, sinceTs, untilTs, limit) {
  const [deals, activities] = await Promise.all([
    pool.query(
      `
        SELECT
          id,
          external_id,
          stage,
          amount,
          probability,
          expected_close_date,
          updated_at
        FROM attio_opportunities_raw
        WHERE project_id = $1
          AND account_scope_id = $2
          AND COALESCE(updated_at, created_at) > $3::timestamptz
          AND COALESCE(updated_at, created_at) <= $4::timestamptz
        ORDER BY COALESCE(updated_at, created_at) ASC
        LIMIT $5
      `,
      [scope.projectId, scope.accountScopeId, sinceTs, untilTs, limit]
    ),
    pool.query(
      `
        SELECT
          id,
          external_id,
          record_external_id,
          activity_type,
          note,
          actor_name,
          occurred_at,
          updated_at
        FROM attio_activities_raw
        WHERE project_id = $1
          AND account_scope_id = $2
          AND COALESCE(updated_at, created_at) > $3::timestamptz
          AND COALESCE(updated_at, created_at) <= $4::timestamptz
        ORDER BY COALESCE(updated_at, created_at) ASC
        LIMIT $5
      `,
      [scope.projectId, scope.accountScopeId, sinceTs, untilTs, limit]
    ),
  ]);

  const events = [];
  for (const row of deals.rows) {
    const sourceRef = asText(row.external_id || row.id, 200) || "unknown_deal";
    const occurredAt = toIso(row.updated_at, new Date());
    events.push({
      event_type: "deal_stage_changed",
      occurred_at: occurredAt,
      actor: "system",
      source: "attio",
      source_ref: sourceRef,
      source_url: `attio://deals/${sourceRef}`,
      source_message_id: null,
      source_linear_issue_id: null,
      source_attio_record_id: sourceRef,
      payload_json: {
        deal_id: sourceRef,
        stage: row.stage,
        amount: Number(row.amount || 0),
        probability: Number(row.probability || 0),
        expected_close_date: row.expected_close_date || null,
      },
      dedupe_key: dedupeKey(["attio", "deal_stage_changed", sourceRef, occurredAt]),
    });
  }

  for (const row of activities.rows) {
    const sourceRef = asText(row.external_id || row.id, 200) || "unknown_activity";
    const activityType = String(row.activity_type || "").toLowerCase();
    const occurredAt = toIso(row.occurred_at || row.updated_at, new Date());
    let eventType = "activity_logged";
    if (activityType.includes("note")) eventType = "note_logged";
    if (activityType.includes("invoice_sent")) eventType = "invoice_sent";
    if (activityType.includes("invoice_paid")) eventType = "invoice_paid";
    events.push({
      event_type: eventType,
      occurred_at: occurredAt,
      actor: "team",
      source: "attio",
      source_ref: sourceRef,
      source_url: `attio://activities/${sourceRef}`,
      source_message_id: null,
      source_linear_issue_id: null,
      source_attio_record_id: asText(row.record_external_id || sourceRef, 200),
      payload_json: {
        activity_type: row.activity_type,
        note: row.note,
        actor_name: row.actor_name,
        record_external_id: row.record_external_id,
      },
      dedupe_key: dedupeKey(["attio", eventType, sourceRef, occurredAt]),
    });
  }

  return events;
}

async function insertEvents(pool, scope, events) {
  if (!events.length) return 0;
  const payload = events.map((item) => ({
    event_type: item.event_type,
    occurred_at: item.occurred_at,
    actor: item.actor,
    source: item.source,
    source_ref: item.source_ref,
    source_url: item.source_url,
    source_message_id: item.source_message_id,
    source_linear_issue_id: item.source_linear_issue_id,
    source_attio_record_id: item.source_attio_record_id,
    payload_json: item.payload_json || {},
    dedupe_key: item.dedupe_key,
  }));
  const result = await pool.query(
    `
      INSERT INTO kag_event_log(
        project_id,
        account_scope_id,
        event_type,
        occurred_at,
        actor,
        source,
        source_ref,
        source_url,
        source_message_id,
        source_linear_issue_id,
        source_attio_record_id,
        payload_json,
        dedupe_key
      )
      SELECT
        $1::uuid,
        $2::uuid,
        x.event_type,
        x.occurred_at::timestamptz,
        x.actor,
        x.source,
        x.source_ref,
        x.source_url,
        x.source_message_id,
        x.source_linear_issue_id,
        x.source_attio_record_id,
        x.payload_json,
        x.dedupe_key
      FROM jsonb_to_recordset($3::jsonb) AS x(
        event_type text,
        occurred_at text,
        actor text,
        source text,
        source_ref text,
        source_url text,
        source_message_id text,
        source_linear_issue_id text,
        source_attio_record_id text,
        payload_json jsonb,
        dedupe_key text
      )
      ON CONFLICT (project_id, dedupe_key)
      DO NOTHING
    `,
    [scope.projectId, scope.accountScopeId, JSON.stringify(payload)]
  );
  return result.rowCount || 0;
}

export async function syncConnectorEventLog(pool, scope, options = {}) {
  const connector = String(options.connector || "").trim().toLowerCase();
  const now = new Date();
  const sinceTs =
    toIso(options.since_ts) ||
    toIso(new Date(now.getTime() - clampInt(process.env.KAG_EVENT_LOG_LOOKBACK_DAYS, 14, 1, 90) * 24 * 60 * 60 * 1000));
  const untilTs = toIso(options.until_ts) || now.toISOString();
  const limit = clampInt(options.limit, 3000, 10, 50000);

  let events = [];
  if (connector === "chatwoot") {
    const [messageEvents, silentEvents] = await Promise.all([
      loadChatwootEventCandidates(pool, scope, sinceTs, untilTs, limit),
      loadClientSilentCandidates(pool, scope, untilTs, Math.min(1000, limit)),
    ]);
    events = [...messageEvents, ...silentEvents];
  } else if (connector === "linear") {
    events = await loadLinearEventCandidates(pool, scope, sinceTs, untilTs, limit);
  } else if (connector === "attio") {
    events = await loadAttioEventCandidates(pool, scope, sinceTs, untilTs, limit);
  } else {
    return { connector, inserted: 0, since_ts: sinceTs, until_ts: untilTs };
  }

  const inserted = await insertEvents(pool, scope, events);
  return {
    connector,
    generated: events.length,
    inserted,
    since_ts: sinceTs,
    until_ts: untilTs,
  };
}

export async function listProjectEvents(pool, scope, options = {}) {
  const type = String(options.type || "").trim().toLowerCase();
  const source = String(options.source || "").trim().toLowerCase();
  const limitRaw = Number.parseInt(String(options.limit || "200"), 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 2000)) : 200;
  const { rows } = await pool.query(
    `
      SELECT
        id,
        event_type,
        occurred_at,
        actor,
        source,
        source_ref,
        source_url,
        source_message_id,
        source_linear_issue_id,
        source_attio_record_id,
        payload_json,
        created_at
      FROM kag_event_log
      WHERE project_id = $1
        AND account_scope_id = $2
        AND ($3 = '' OR event_type = $3)
        AND ($4 = '' OR source = $4)
      ORDER BY occurred_at DESC, id DESC
      LIMIT $5
    `,
    [scope.projectId, scope.accountScopeId, type, source, limit]
  );
  return rows;
}
