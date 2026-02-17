import crypto from "node:crypto";

import { approveOutbound, createOutboundDraft, sendOutbound } from "./outbox.js";

export const RECOMMENDATION_ACTION_TYPES = {
  CREATE_OR_UPDATE_TASK: "create_or_update_task",
  SEND_MESSAGE: "send_message",
  SET_REMINDER: "set_reminder",
};

function clampInt(value, fallback, min = 0, max = 1_000_000) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function asText(value, maxLen = 2000) {
  const text = String(value || "").trim();
  if (!text) return null;
  return text.slice(0, maxLen);
}

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

function addDaysIso(base, days) {
  const date = base instanceof Date ? base : new Date(base);
  if (!Number.isFinite(date.getTime())) return new Date().toISOString();
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function buildActionDedupeKey(recommendationId, actionType, payload = {}) {
  const normalizedPayload = payload && typeof payload === "object" ? payload : {};
  return crypto
    .createHash("sha1")
    .update(`${recommendationId}:${actionType}:${JSON.stringify(normalizedPayload)}`)
    .digest("hex");
}

function recommendationScope(recommendation) {
  return {
    projectId: recommendation.project_id,
    accountScopeId: recommendation.account_scope_id,
  };
}

async function fetchRecommendation(pool, scope, recommendationId, allProjects = false) {
  const { rows } = await pool.query(
    allProjects
      ? `
        SELECT *
        FROM recommendations_v2
        WHERE id = $1
          AND account_scope_id = $2
        LIMIT 1
      `
      : `
        SELECT *
        FROM recommendations_v2
        WHERE id = $1
          AND project_id = $2
          AND account_scope_id = $3
        LIMIT 1
      `,
    allProjects
      ? [recommendationId, scope.accountScopeId]
      : [recommendationId, scope.projectId, scope.accountScopeId]
  );
  return rows[0] || null;
}

async function fetchActionRun(pool, scope, actionRunId, allProjects = false) {
  const { rows } = await pool.query(
    allProjects
      ? `
        SELECT *
        FROM recommendation_action_runs
        WHERE id = $1
          AND account_scope_id = $2
        LIMIT 1
      `
      : `
        SELECT *
        FROM recommendation_action_runs
        WHERE id = $1
          AND project_id = $2
          AND account_scope_id = $3
        LIMIT 1
      `,
    allProjects
      ? [actionRunId, scope.accountScopeId]
      : [actionRunId, scope.projectId, scope.accountScopeId]
  );
  return rows[0] || null;
}

async function upsertActionRun(pool, recommendation, actionType, actionPayload = {}, actorUsername = null) {
  const payload = actionPayload && typeof actionPayload === "object" ? actionPayload : {};
  const dedupeKey =
    asText(payload.dedupe_key, 200) || buildActionDedupeKey(recommendation.id, actionType, payload);
  const maxRetries = clampInt(payload.max_retries, 3, 0, 10);
  const { rows } = await pool.query(
    `
      INSERT INTO recommendation_action_runs(
        project_id,
        account_scope_id,
        recommendation_id,
        action_type,
        status,
        action_payload,
        result_payload,
        attempts,
        max_retries,
        dedupe_key,
        created_by,
        updated_at
      )
      VALUES ($1, $2, $3, $4, 'pending', $5::jsonb, '{}'::jsonb, 0, $6, $7, $8, now())
      ON CONFLICT (project_id, dedupe_key)
      DO UPDATE SET
        updated_at = now()
      RETURNING *
    `,
    [
      recommendation.project_id,
      recommendation.account_scope_id,
      recommendation.id,
      actionType,
      JSON.stringify(payload),
      maxRetries,
      dedupeKey,
      actorUsername,
    ]
  );
  return rows[0] || null;
}

async function setActionRunRunning(pool, run) {
  const { rows } = await pool.query(
    `
      UPDATE recommendation_action_runs
      SET
        status = 'running',
        attempts = attempts + 1,
        error_message = NULL,
        updated_at = now()
      WHERE id = $1
      RETURNING *
    `,
    [run.id]
  );
  return rows[0] || null;
}

async function setActionRunSucceeded(pool, runId, resultPayload = {}) {
  const { rows } = await pool.query(
    `
      UPDATE recommendation_action_runs
      SET
        status = 'succeeded',
        result_payload = $2::jsonb,
        error_message = NULL,
        next_retry_at = NULL,
        finished_at = now(),
        updated_at = now()
      WHERE id = $1
      RETURNING *
    `,
    [runId, JSON.stringify(resultPayload || {})]
  );
  return rows[0] || null;
}

async function setActionRunFailed(pool, run, error) {
  const message = asText(error?.message || error, 4000) || "recommendation_action_failed";
  const nextRetryInMinutes = Math.min(120, Math.max(1, 2 ** Math.min(7, Number(run.attempts || 1))));
  const canRetry = Number(run.attempts || 0) < Number(run.max_retries || 0);
  const { rows } = await pool.query(
    `
      UPDATE recommendation_action_runs
      SET
        status = 'failed',
        error_message = $2,
        next_retry_at = CASE WHEN $3 THEN now() + ($4::text || ' minutes')::interval ELSE NULL END,
        finished_at = now(),
        updated_at = now()
      WHERE id = $1
      RETURNING *
    `,
    [run.id, message, canRetry, nextRetryInMinutes]
  );
  return rows[0] || null;
}

async function setRecommendationAcknowledged(pool, recommendation) {
  await pool.query(
    `
      UPDATE recommendations_v2
      SET
        status = CASE WHEN status = 'new' THEN 'acknowledged' ELSE status END,
        acknowledged_at = CASE WHEN status = 'new' THEN now() ELSE acknowledged_at END,
        updated_at = now()
      WHERE id = $1
        AND project_id = $2
        AND account_scope_id = $3
    `,
    [recommendation.id, recommendation.project_id, recommendation.account_scope_id]
  );
}

async function createOrUpdateTaskAction(pool, recommendation, actionPayload = {}) {
  const externalId = asText(actionPayload.external_id, 200) || `rec-${recommendation.id}`;
  const issueId = `linissue:manual:${recommendation.project_id}:${externalId}`;
  const dueDate = asText(actionPayload.due_date, 20) || recommendation.due_date || null;
  const title = asText(actionPayload.title, 500) || `[REC] ${asText(recommendation.title, 460) || "Recommendation task"}`;
  const { rows } = await pool.query(
    `
      INSERT INTO linear_issues_raw(
        id,
        project_id,
        account_scope_id,
        workspace_id,
        external_id,
        linear_project_external_id,
        title,
        state,
        state_external_id,
        state_type,
        cycle_external_id,
        cycle_name,
        labels,
        blocked,
        blocked_by_count,
        priority,
        assignee_name,
        due_date,
        completed_at,
        data,
        updated_at
      )
      VALUES (
        $1, $2, $3, 'manual', $4, NULL, $5, 'Todo', 'manual_todo', 'unstarted', NULL, NULL,
        ARRAY['kag', 'recommendation'], false, 0, $6, $7, $8::date, NULL, $9::jsonb, now()
      )
      ON CONFLICT (id)
      DO UPDATE SET
        title = EXCLUDED.title,
        state = EXCLUDED.state,
        state_external_id = EXCLUDED.state_external_id,
        state_type = EXCLUDED.state_type,
        labels = EXCLUDED.labels,
        blocked = EXCLUDED.blocked,
        blocked_by_count = EXCLUDED.blocked_by_count,
        priority = EXCLUDED.priority,
        assignee_name = EXCLUDED.assignee_name,
        due_date = EXCLUDED.due_date,
        data = EXCLUDED.data,
        updated_at = now()
      RETURNING id, external_id, title, state, due_date, assignee_name, updated_at
    `,
    [
      issueId,
      recommendation.project_id,
      recommendation.account_scope_id,
      externalId,
      title,
      clampInt(actionPayload.priority, clampInt(recommendation.priority, 3, 1, 5), 1, 5),
      asText(actionPayload.assignee_name, 200),
      dueDate,
      JSON.stringify({
        source: "recommendation_action",
        recommendation_id: recommendation.id,
        category: recommendation.category,
        owner_role: recommendation.owner_role,
      }),
    ]
  );
  return {
    task: rows[0] || null,
  };
}

async function resolveRecipientRef(pool, recommendation, actionPayload = {}) {
  const explicit = asText(actionPayload.recipient_ref, 300);
  if (explicit) return explicit;

  const evidenceRefs = Array.isArray(recommendation.evidence_refs) ? recommendation.evidence_refs : [];
  const messageIds = evidenceRefs
    .map((ref) => asText(ref?.message_id, 300))
    .filter(Boolean)
    .slice(0, 30);
  if (messageIds.length) {
    const byMessages = await pool.query(
      `
        SELECT contact_global_id
        FROM cw_messages
        WHERE project_id = $1
          AND account_scope_id = $2
          AND contact_global_id IS NOT NULL
          AND (id = ANY($3::text[]) OR message_id::text = ANY($3::text[]))
        ORDER BY created_at DESC NULLS LAST
        LIMIT 1
      `,
      [recommendation.project_id, recommendation.account_scope_id, messageIds]
    );
    const fromEvidence = asText(byMessages.rows[0]?.contact_global_id, 300);
    if (fromEvidence) return fromEvidence;
  }

  const fallback = await pool.query(
    `
      SELECT id
      FROM cw_contacts
      WHERE project_id = $1
        AND account_scope_id = $2
      ORDER BY updated_at DESC NULLS LAST, created_at DESC
      LIMIT 1
    `,
    [recommendation.project_id, recommendation.account_scope_id]
  );
  return asText(fallback.rows[0]?.id, 300);
}

async function sendMessageAction(pool, recommendation, run, actionPayload = {}, actorUsername = null, requestId = null) {
  const recipientRef = await resolveRecipientRef(pool, recommendation, actionPayload);
  if (!recipientRef) {
    throw new Error("recommendation_action_recipient_not_found");
  }
  const channel = asText(actionPayload.channel, 30) || "chatwoot";
  const messageBody =
    asText(actionPayload.message, 12_000) ||
    asText(recommendation.suggested_template, 12_000) ||
    asText(recommendation.title, 500) ||
    "Follow-up";
  const scope = recommendationScope(recommendation);

  const outboundDraft = await createOutboundDraft(
    pool,
    scope,
    {
      channel,
      recipient_ref: recipientRef,
      payload: {
        text: messageBody,
        recommendation_id: recommendation.id,
        category: recommendation.category,
      },
      evidence_refs: recommendation.evidence_refs || [],
      idempotency_key: `rec_action_send:${run.id}`,
      dedupe_key: `rec_action_send:${recommendation.id}`,
      max_retries: clampInt(actionPayload.max_retries, 3, 0, 10),
    },
    actorUsername,
    requestId
  );
  await approveOutbound(pool, scope, outboundDraft.id, actorUsername, requestId, recommendation.evidence_refs || []);
  const outboundSent = await sendOutbound(pool, scope, outboundDraft.id, actorUsername, requestId);
  return {
    outbound: {
      id: outboundSent.id,
      status: outboundSent.status,
      channel: outboundSent.channel,
      recipient_ref: outboundSent.recipient_ref,
      sent_at: outboundSent.sent_at,
    },
  };
}

async function setReminderAction(pool, recommendation, actionPayload = {}) {
  const reminderAt =
    toIso(actionPayload.remind_at) ||
    (recommendation.due_date ? toIso(`${recommendation.due_date}T09:00:00.000Z`) : null) ||
    addDaysIso(new Date(), 1);
  const cadenceSeconds = clampInt(actionPayload.cadence_seconds, 3600, 300, 604800);
  const note =
    asText(actionPayload.note, 1000) ||
    `Напоминание по рекомендации: ${asText(recommendation.title, 500) || recommendation.id}`;
  const { rows } = await pool.query(
    `
      INSERT INTO scheduled_jobs(
        project_id,
        account_scope_id,
        job_type,
        status,
        payload,
        cadence_seconds,
        next_run_at,
        updated_at
      )
      VALUES ($1, $2, $3, 'active', $4::jsonb, $5, $6::timestamptz, now())
      ON CONFLICT (project_id, job_type)
      DO UPDATE SET
        status = 'active',
        payload = EXCLUDED.payload,
        cadence_seconds = EXCLUDED.cadence_seconds,
        next_run_at = EXCLUDED.next_run_at,
        updated_at = now()
      RETURNING id, job_type, status, cadence_seconds, next_run_at
    `,
    [
      recommendation.project_id,
      recommendation.account_scope_id,
      `recommendation_reminder:${recommendation.id}`,
      JSON.stringify({
        source: "recommendation_action",
        recommendation_id: recommendation.id,
        category: recommendation.category,
        note,
      }),
      cadenceSeconds,
      reminderAt,
    ]
  );
  return {
    reminder_job: rows[0] || null,
  };
}

async function executeAction(pool, recommendation, run, actionPayload = {}, actorUsername = null, requestId = null) {
  if (run.action_type === RECOMMENDATION_ACTION_TYPES.CREATE_OR_UPDATE_TASK) {
    return createOrUpdateTaskAction(pool, recommendation, actionPayload);
  }
  if (run.action_type === RECOMMENDATION_ACTION_TYPES.SEND_MESSAGE) {
    return sendMessageAction(pool, recommendation, run, actionPayload, actorUsername, requestId);
  }
  if (run.action_type === RECOMMENDATION_ACTION_TYPES.SET_REMINDER) {
    return setReminderAction(pool, recommendation, actionPayload);
  }
  throw new Error("unsupported_recommendation_action_type");
}

export async function runRecommendationAction(
  pool,
  scope,
  recommendationId,
  actionType,
  actionPayload = {},
  options = {}
) {
  const allProjects = String(options.all_projects || "").trim().toLowerCase() === "true";
  const recommendation = await fetchRecommendation(pool, scope, recommendationId, allProjects);
  if (!recommendation) {
    throw new Error("recommendation_not_found");
  }
  if (String(recommendation.evidence_gate_status || "") !== "visible") {
    throw new Error("recommendation_evidence_gate_blocked");
  }

  const normalizedActionType = String(actionType || "").trim().toLowerCase();
  if (!Object.values(RECOMMENDATION_ACTION_TYPES).includes(normalizedActionType)) {
    throw new Error("invalid_recommendation_action_type");
  }

  const initialRun = await upsertActionRun(
    pool,
    recommendation,
    normalizedActionType,
    actionPayload,
    options.actorUsername || null
  );
  if (!initialRun) {
    throw new Error("recommendation_action_run_upsert_failed");
  }

  if (initialRun.status === "succeeded") {
    return { run: initialRun, recommendation, idempotent: true };
  }
  if (initialRun.status === "failed" && Number(initialRun.attempts || 0) >= Number(initialRun.max_retries || 0)) {
    throw new Error("recommendation_action_retry_exhausted");
  }

  const running = await setActionRunRunning(pool, initialRun);
  if (!running) {
    throw new Error("recommendation_action_run_not_found");
  }
  try {
    const resultPayload = await executeAction(
      pool,
      recommendation,
      running,
      running.action_payload || {},
      options.actorUsername || null,
      options.requestId || null
    );
    const run = await setActionRunSucceeded(pool, running.id, resultPayload);
    await setRecommendationAcknowledged(pool, recommendation);
    return { run, recommendation, idempotent: false };
  } catch (error) {
    const failed = await setActionRunFailed(pool, running, error);
    return { run: failed, recommendation, error };
  }
}

export async function retryRecommendationActionRun(pool, scope, actionRunId, options = {}) {
  const allProjects = String(options.all_projects || "").trim().toLowerCase() === "true";
  const existingRun = await fetchActionRun(pool, scope, actionRunId, allProjects);
  if (!existingRun) {
    throw new Error("recommendation_action_run_not_found");
  }
  if (existingRun.status !== "failed") {
    throw new Error("recommendation_action_retry_invalid_state");
  }
  if (Number(existingRun.attempts || 0) >= Number(existingRun.max_retries || 0)) {
    throw new Error("recommendation_action_retry_exhausted");
  }
  const recommendation = await fetchRecommendation(pool, scope, existingRun.recommendation_id, true);
  if (!recommendation) {
    throw new Error("recommendation_not_found");
  }

  const running = await setActionRunRunning(pool, existingRun);
  if (!running) {
    throw new Error("recommendation_action_run_not_found");
  }
  try {
    const resultPayload = await executeAction(
      pool,
      recommendation,
      running,
      running.action_payload || {},
      options.actorUsername || null,
      options.requestId || null
    );
    const run = await setActionRunSucceeded(pool, running.id, resultPayload);
    await setRecommendationAcknowledged(pool, recommendation);
    return { run, recommendation };
  } catch (error) {
    const failed = await setActionRunFailed(pool, running, error);
    return { run: failed, recommendation, error };
  }
}

export async function listRecommendationActionRuns(pool, scope, recommendationId, options = {}) {
  const allProjects = String(options.all_projects || "").trim().toLowerCase() === "true";
  const limit = clampInt(options.limit, 50, 1, 500);
  const { rows } = await pool.query(
    allProjects
      ? `
        SELECT *
        FROM recommendation_action_runs
        WHERE account_scope_id = $1
          AND recommendation_id = $2
        ORDER BY created_at DESC
        LIMIT $3
      `
      : `
        SELECT *
        FROM recommendation_action_runs
        WHERE project_id = $1
          AND account_scope_id = $2
          AND recommendation_id = $3
        ORDER BY created_at DESC
        LIMIT $4
      `,
    allProjects
      ? [scope.accountScopeId, recommendationId, limit]
      : [scope.projectId, scope.accountScopeId, recommendationId, limit]
  );
  return rows;
}
