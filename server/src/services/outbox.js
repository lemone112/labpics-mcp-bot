import crypto from "node:crypto";

import { fail } from "../lib/api-contract.js";
import { normalizeEvidenceRefs, writeAuditEvent } from "./audit.js";
import { toPositiveInt } from '../lib/utils.js';

function nowTs() {
  return new Date().toISOString();
}

function buildDedupeKey(projectId, channel, recipientRef, payload) {
  const material = JSON.stringify({
    projectId,
    channel,
    recipientRef,
    payload: payload && typeof payload === "object" ? payload : {},
  });
  return crypto.createHash("sha256").update(material).digest("hex");
}

async function touchChannelPolicy(pool, scope, policyPatch) {
  const contactGlobalId = String(policyPatch.contactGlobalId || "").trim();
  const channel = String(policyPatch.channel || "").trim().toLowerCase();
  if (!contactGlobalId || !channel) return null;

  const { rows } = await pool.query(
    `
      INSERT INTO contact_channel_policies(
        project_id,
        account_scope_id,
        contact_global_id,
        channel,
        frequency_window_hours,
        frequency_cap
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (project_id, contact_global_id, channel)
      DO UPDATE SET updated_at = now()
      RETURNING
        id,
        opted_out,
        stop_on_reply,
        frequency_window_hours,
        frequency_cap,
        sent_in_window,
        window_started_at,
        last_inbound_at
    `,
    [
      scope.projectId,
      scope.accountScopeId,
      contactGlobalId,
      channel,
      toPositiveInt(policyPatch.frequencyWindowHours, 24, 1, 720),
      toPositiveInt(policyPatch.frequencyCap, 3, 1, 200),
    ]
  );
  return rows[0] || null;
}

function shouldResetFrequencyWindow(policy, now) {
  if (!policy?.window_started_at) return true;
  const started = new Date(policy.window_started_at).getTime();
  if (!Number.isFinite(started)) return true;
  const windowMs = Number(policy.frequency_window_hours || 24) * 60 * 60 * 1000;
  return now.getTime() - started > windowMs;
}

async function enforcePolicyForSend(pool, scope, outbound, actorUsername, requestId) {
  const contactGlobalId = String(outbound.recipient_ref || "");
  const policy = await touchChannelPolicy(pool, scope, {
    contactGlobalId,
    channel: outbound.channel,
  });
  if (!policy) return;

  const now = new Date();
  if (policy.opted_out) {
    await pool.query(
      `
        UPDATE outbound_messages
        SET status = 'blocked_opt_out',
            updated_at = now(),
            last_error = 'recipient_opted_out'
        WHERE id = $1
      `,
      [outbound.id]
    );
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername,
      action: "outbound.opt_out_block",
      entityType: "outbound_message",
      entityId: outbound.id,
      status: "blocked",
      requestId,
      payload: { reason: "recipient_opted_out" },
      evidenceRefs: outbound.evidence_refs,
    });
    fail(409, "outbound_blocked_opt_out", "Recipient opted out");
  }

  if (policy.stop_on_reply && policy.last_inbound_at) {
    const inboundAt = new Date(policy.last_inbound_at).getTime();
    const approvedAt = outbound.approved_at ? new Date(outbound.approved_at).getTime() : 0;
    if (Number.isFinite(inboundAt) && inboundAt > approvedAt) {
      await pool.query(
        `
          UPDATE outbound_messages
          SET status = 'cancelled',
              updated_at = now(),
              last_error = 'stop_on_reply'
          WHERE id = $1
        `,
        [outbound.id]
      );
      fail(409, "outbound_blocked_stop_on_reply", "Outbound blocked due to inbound reply");
    }
  }

  const frequencyCap = Number(policy.frequency_cap || 0);
  const sentInWindow = Number(policy.sent_in_window || 0);
  if (frequencyCap > 0 && sentInWindow >= frequencyCap) {
    await pool.query(
      `
        UPDATE outbound_messages
        SET status = 'failed',
            updated_at = now(),
            next_attempt_at = now() + interval '1 hour',
            last_error = 'frequency_cap_reached'
        WHERE id = $1
      `,
      [outbound.id]
    );
    fail(429, "frequency_cap_reached", "Frequency cap reached");
  }

  const resetWindow = shouldResetFrequencyWindow(policy, now);
  await pool.query(
    `
      UPDATE contact_channel_policies
      SET
        sent_in_window = CASE WHEN $5 THEN 1 ELSE sent_in_window + 1 END,
        window_started_at = CASE WHEN $5 THEN $4 ELSE COALESCE(window_started_at, $4) END,
        last_outbound_at = $4,
        updated_at = now()
      WHERE id = $1
        AND project_id = $2
        AND account_scope_id = $3
    `,
    [policy.id, scope.projectId, scope.accountScopeId, now.toISOString(), resetWindow]
  );
}

async function markAttempt(pool, scope, outbound, status, patch = {}) {
  const attemptNo = Number(outbound.retry_count || 0) + 1;
  await pool.query(
    `
      INSERT INTO outbound_attempts(
        outbound_id,
        project_id,
        account_scope_id,
        attempt_no,
        status,
        provider_message_id,
        error
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      outbound.id,
      scope.projectId,
      scope.accountScopeId,
      attemptNo,
      status,
      patch.providerMessageId || null,
      patch.error || null,
    ]
  );

  const isSent = status === "sent";
  const retryCount = attemptNo;
  const exhausted = retryCount >= Number(outbound.max_retries || 0);
  await pool.query(
    `
      UPDATE outbound_messages
      SET
        retry_count = $2,
        status = $3,
        sent_at = CASE WHEN $3 = 'sent' THEN now() ELSE sent_at END,
        next_attempt_at = CASE
          WHEN $3 = 'sent' THEN NULL
          WHEN $4 THEN NULL
          ELSE now() + (($2::int * 2)::text || ' minutes')::interval
        END,
        last_error = $5,
        updated_at = now()
      WHERE id = $1
    `,
    [
      outbound.id,
      retryCount,
      isSent ? "sent" : exhausted ? "failed" : "approved",
      exhausted,
      patch.error || null,
    ]
  );
}

export async function createOutboundDraft(pool, scope, input, actorUsername, requestId) {
  const channel = String(input?.channel || "").trim().toLowerCase();
  const recipientRef = String(input?.recipient_ref || "").trim();
  if (!["email", "chatwoot", "telegram"].includes(channel)) {
    fail(400, "invalid_channel", "channel must be one of: email, chatwoot, telegram");
  }
  if (!recipientRef) {
    fail(400, "invalid_recipient_ref", "recipient_ref is required");
  }

  const payload = input?.payload && typeof input.payload === "object" ? input.payload : {};
  const idempotencyKey = String(input?.idempotency_key || "").trim();
  if (!idempotencyKey) {
    fail(400, "idempotency_key_required", "idempotency_key is required");
  }
  const dedupeKey = String(input?.dedupe_key || "").trim() || buildDedupeKey(scope.projectId, channel, recipientRef, payload);
  const evidenceRefs = normalizeEvidenceRefs(input?.evidence_refs);

  const { rows } = await pool.query(
    `
      INSERT INTO outbound_messages(
        project_id,
        account_scope_id,
        channel,
        recipient_ref,
        payload,
        evidence_refs,
        status,
        idempotency_key,
        dedupe_key,
        max_retries,
        next_attempt_at
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, 'draft', $7, $8, $9, now())
      ON CONFLICT (project_id, idempotency_key)
      DO UPDATE SET
        payload = EXCLUDED.payload,
        evidence_refs = EXCLUDED.evidence_refs,
        dedupe_key = EXCLUDED.dedupe_key,
        updated_at = now()
      RETURNING *
    `,
    [
      scope.projectId,
      scope.accountScopeId,
      channel,
      recipientRef,
      JSON.stringify(payload),
      JSON.stringify(evidenceRefs),
      idempotencyKey,
      dedupeKey,
      toPositiveInt(input?.max_retries, 5, 0, 20),
    ]
  );
  const outbound = rows[0];

  await writeAuditEvent(pool, {
    projectId: scope.projectId,
    accountScopeId: scope.accountScopeId,
    actorUsername,
    action: "outbound.draft",
    entityType: "outbound_message",
    entityId: outbound.id,
    status: "ok",
    requestId,
    idempotencyKey,
    payload: {
      channel,
      recipient_ref: recipientRef,
    },
    evidenceRefs,
  });

  return outbound;
}

export async function approveOutbound(pool, scope, outboundId, actorUsername, requestId, evidenceRefsInput = []) {
  const evidenceRefs = normalizeEvidenceRefs(evidenceRefsInput);
  const { rows } = await pool.query(
    `
      UPDATE outbound_messages
      SET
        status = CASE
          WHEN status = 'draft' THEN 'approved'
          ELSE status
        END,
        approved_by = $4,
        approved_at = CASE WHEN status = 'draft' THEN now() ELSE approved_at END,
        evidence_refs = CASE
          WHEN jsonb_array_length($5::jsonb) > 0 THEN $5::jsonb
          ELSE evidence_refs
        END,
        updated_at = now()
      WHERE id = $1
        AND project_id = $2
        AND account_scope_id = $3
      RETURNING *
    `,
    [outboundId, scope.projectId, scope.accountScopeId, actorUsername || null, JSON.stringify(evidenceRefs)]
  );
  const outbound = rows[0];
  if (!outbound) {
    fail(404, "outbound_not_found", "Outbound message not found");
  }
  if (outbound.status !== "approved" && outbound.status !== "sent") {
    fail(409, "outbound_invalid_state", `Cannot approve from state: ${outbound.status}`);
  }

  await writeAuditEvent(pool, {
    projectId: scope.projectId,
    accountScopeId: scope.accountScopeId,
    actorUsername,
    action: "outbound.approve",
    entityType: "outbound_message",
    entityId: outbound.id,
    status: "ok",
    requestId,
    payload: { previous_status: outbound.status },
    evidenceRefs: evidenceRefs.length ? evidenceRefs : outbound.evidence_refs,
  });
  return outbound;
}

export async function sendOutbound(pool, scope, outboundId, actorUsername, requestId) {
  const { rows } = await pool.query(
    `
      SELECT *
      FROM outbound_messages
      WHERE id = $1
        AND project_id = $2
        AND account_scope_id = $3
      LIMIT 1
    `,
    [outboundId, scope.projectId, scope.accountScopeId]
  );
  const outbound = rows[0];
  if (!outbound) fail(404, "outbound_not_found", "Outbound message not found");
  if (outbound.status !== "approved" && outbound.status !== "failed") {
    fail(409, "outbound_invalid_state", `Cannot send from state: ${outbound.status}`);
  }

  await enforcePolicyForSend(pool, scope, outbound, actorUsername, requestId);
  const forceFail = Boolean(outbound?.payload?.force_fail);
  if (forceFail) {
    await markAttempt(pool, scope, outbound, "failed", { error: "simulated_provider_failure" });
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername,
      action: "outbound.send",
      entityType: "outbound_message",
      entityId: outbound.id,
      status: "failed",
      requestId,
      payload: { reason: "simulated_provider_failure" },
      evidenceRefs: outbound.evidence_refs,
    });
    fail(502, "outbound_send_failed", "Outbound send failed");
  }

  const providerMessageId = `sim:${Date.now()}:${crypto.randomBytes(4).toString("hex")}`;
  await markAttempt(pool, scope, outbound, "sent", { providerMessageId });
  await writeAuditEvent(pool, {
    projectId: scope.projectId,
    accountScopeId: scope.accountScopeId,
    actorUsername,
    action: "outbound.send",
    entityType: "outbound_message",
    entityId: outbound.id,
    status: "ok",
    requestId,
    payload: { provider_message_id: providerMessageId },
    evidenceRefs: outbound.evidence_refs,
  });

  const result = await pool.query(
    `
      SELECT *
      FROM outbound_messages
      WHERE id = $1
        AND project_id = $2
        AND account_scope_id = $3
      LIMIT 1
    `,
    [outbound.id, scope.projectId, scope.accountScopeId]
  );
  return result.rows[0];
}

export async function setOptOut(pool, scope, input, actorUsername, requestId) {
  const contactGlobalId = String(input?.contact_global_id || "").trim();
  const channel = String(input?.channel || "").trim().toLowerCase();
  if (!contactGlobalId || !channel) {
    fail(400, "invalid_opt_out_payload", "contact_global_id and channel are required");
  }
  if (!["email", "chatwoot", "telegram"].includes(channel)) {
    fail(400, "invalid_channel", "channel must be one of: email, chatwoot, telegram");
  }

  await touchChannelPolicy(pool, scope, {
    contactGlobalId,
    channel,
    frequencyWindowHours: input?.frequency_window_hours,
    frequencyCap: input?.frequency_cap,
  });

  const { rows } = await pool.query(
    `
      UPDATE contact_channel_policies
      SET
        opted_out = $5,
        stop_on_reply = COALESCE($6, stop_on_reply),
        frequency_window_hours = COALESCE($7, frequency_window_hours),
        frequency_cap = COALESCE($8, frequency_cap),
        last_inbound_at = CASE WHEN $9 THEN now() ELSE last_inbound_at END,
        updated_at = now()
      WHERE project_id = $1
        AND account_scope_id = $2
        AND contact_global_id = $3
        AND channel = $4
      RETURNING *
    `,
    [
      scope.projectId,
      scope.accountScopeId,
      contactGlobalId,
      channel,
      Boolean(input?.opted_out),
      input?.stop_on_reply == null ? null : Boolean(input.stop_on_reply),
      input?.frequency_window_hours == null ? null : toPositiveInt(input.frequency_window_hours, 24, 1, 720),
      input?.frequency_cap == null ? null : toPositiveInt(input.frequency_cap, 3, 1, 200),
      Boolean(input?.mark_inbound),
    ]
  );
  const policy = rows[0];

  await writeAuditEvent(pool, {
    projectId: scope.projectId,
    accountScopeId: scope.accountScopeId,
    actorUsername,
    action: "outbound.opt_out",
    entityType: "contact_channel_policy",
    entityId: policy?.id || `${contactGlobalId}:${channel}`,
    status: "ok",
    requestId,
    payload: {
      channel,
      contact_global_id: contactGlobalId,
      opted_out: Boolean(input?.opted_out),
      mark_replied: Boolean(input?.mark_replied),
    },
    evidenceRefs: input?.evidence_refs || [],
  });

  return policy;
}

export async function listOutbound(pool, scope, options = {}) {
  const limit = toPositiveInt(options.limit, 50, 1, 200);
  const offset = toPositiveInt(options.offset, 0, 0, 10_000);
  const status = String(options.status || "").trim();
  const query = status
    ? `
      SELECT *
      FROM outbound_messages
      WHERE project_id = $1
        AND account_scope_id = $2
        AND status = $3
      ORDER BY created_at DESC
      LIMIT $4
      OFFSET $5
    `
    : `
      SELECT *
      FROM outbound_messages
      WHERE project_id = $1
        AND account_scope_id = $2
      ORDER BY created_at DESC
      LIMIT $3
      OFFSET $4
    `;
  const values = status
    ? [scope.projectId, scope.accountScopeId, status, limit, offset]
    : [scope.projectId, scope.accountScopeId, limit, offset];

  const { rows } = await pool.query(query, values);
  return rows;
}

export async function processDueOutbounds(pool, scope, actorUsername = "scheduler", requestId = null, limit = 20) {
  const safeLimit = toPositiveInt(limit, 20, 1, 200);
  const { rows } = await pool.query(
    `
      SELECT *
      FROM outbound_messages
      WHERE project_id = $1
        AND account_scope_id = $2
        AND status IN ('approved', 'failed')
        AND COALESCE(next_attempt_at, now()) <= now()
        AND retry_count < max_retries
      ORDER BY created_at ASC
      LIMIT $3
    `,
    [scope.projectId, scope.accountScopeId, safeLimit]
  );

  let sent = 0;
  let failed = 0;
  for (const outbound of rows) {
    try {
      await sendOutbound(pool, scope, outbound.id, actorUsername, requestId || `scheduler_${nowTs()}`);
      sent++;
    } catch {
      failed++;
    }
  }
  return {
    processed: rows.length,
    sent,
    failed,
  };
}
