import crypto from "node:crypto";
import type { Pool } from "../../types/index.js";

type Scope = {
  projectId: string;
  accountScopeId: string;
};

type ProcessEventRow = {
  event_type: string;
  occurred_at: string;
  source?: string;
  source_ref: string;
  payload_json?: Record<string, unknown>;
  dedupe_key: string;
};

type ProcessRun = {
  process: string;
  run_id: string;
  started_at: string;
  source: string;
  source_ref: string;
};

function toIso(value: unknown, fallback = new Date()) {
  const date = value instanceof Date ? value : new Date(String(value || fallback));
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function buildDedupeKey(parts: unknown[] = []) {
  return crypto
    .createHash("sha1")
    .update(parts.map((item) => String(item || "")).join("|"))
    .digest("hex");
}

function buildSourceRef(processName: string, runId: string) {
  return `process:${processName}:${runId}`;
}

async function insertProcessEvent(pool: Pool, scope: Scope, row: ProcessEventRow) {
  await pool.query(
    `
      INSERT INTO connector_events(
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
      VALUES(
        $1,
        $2,
        $3,
        $4::timestamptz,
        'system',
        $5,
        $6,
        NULL,
        NULL,
        NULL,
        NULL,
        $7::jsonb,
        $8
      )
      ON CONFLICT (project_id, dedupe_key)
      DO NOTHING
    `,
    [
      scope.projectId,
      scope.accountScopeId,
      row.event_type,
      row.occurred_at,
      row.source || "system",
      row.source_ref,
      JSON.stringify(row.payload_json || {}),
      row.dedupe_key,
    ]
  );
}

export async function startProcessRun(
  pool: Pool,
  scope: Scope,
  processName: string,
  options: {
    run_id?: string;
    started_at?: unknown;
    source?: string;
    payload?: Record<string, unknown>;
  } = {}
): Promise<ProcessRun> {
  const runId = options.run_id || crypto.randomUUID();
  const startedAt = toIso(options.started_at);
  const source = String(options.source || "system").trim().toLowerCase() || "system";
  const sourceRef = buildSourceRef(processName, runId);
  const payload = {
    process: processName,
    phase: "start",
    run_id: runId,
    started_at: startedAt,
    ...(options.payload || {}),
  };
  await insertProcessEvent(pool, scope, {
    event_type: "process_started",
    occurred_at: startedAt,
    source,
    source_ref: sourceRef,
    payload_json: payload,
    dedupe_key: buildDedupeKey([scope.projectId, "process_started", processName, runId]),
  });
  return {
    process: processName,
    run_id: runId,
    started_at: startedAt,
    source,
    source_ref: sourceRef,
  };
}

export async function finishProcessRun(
  pool: Pool,
  scope: Scope,
  run: ProcessRun | null,
  options: {
    finished_at?: unknown;
    counters?: Record<string, unknown>;
    payload?: Record<string, unknown>;
  } = {}
) {
  if (!run) return;
  const finishedAt = toIso(options.finished_at);
  const startedAt = new Date(run.started_at);
  const durationMs = Number.isFinite(startedAt.getTime())
    ? Math.max(0, new Date(finishedAt).getTime() - startedAt.getTime())
    : null;
  const payload = {
    process: run.process,
    phase: "finish",
    run_id: run.run_id,
    started_at: run.started_at,
    finished_at: finishedAt,
    duration_ms: durationMs,
    counters: options.counters || {},
    ...(options.payload || {}),
  };
  await insertProcessEvent(pool, scope, {
    event_type: "process_finished",
    occurred_at: finishedAt,
    source: run.source || "system",
    source_ref: run.source_ref,
    payload_json: payload,
    dedupe_key: buildDedupeKey([scope.projectId, "process_finished", run.process, run.run_id]),
  });
}

export async function failProcessRun(
  pool: Pool,
  scope: Scope,
  run: ProcessRun | null,
  error: unknown,
  options: {
    failed_at?: unknown;
    counters?: Record<string, unknown>;
    payload?: Record<string, unknown>;
  } = {}
) {
  if (!run) return;
  const failedAt = toIso(options.failed_at);
  const startedAt = new Date(run.started_at);
  const durationMs = Number.isFinite(startedAt.getTime())
    ? Math.max(0, new Date(failedAt).getTime() - startedAt.getTime())
    : null;
  const payload = {
    process: run.process,
    phase: "fail",
    run_id: run.run_id,
    started_at: run.started_at,
    failed_at: failedAt,
    duration_ms: durationMs,
    error_message: String((error as Error)?.message || error || "process_failed").slice(0, 4000),
    counters: options.counters || {},
    ...(options.payload || {}),
  };
  await insertProcessEvent(pool, scope, {
    event_type: "process_failed",
    occurred_at: failedAt,
    source: run.source || "system",
    source_ref: run.source_ref,
    payload_json: payload,
    dedupe_key: buildDedupeKey([scope.projectId, "process_failed", run.process, run.run_id]),
  });
}

export async function warnProcess(
  pool: Pool,
  scope: Scope,
  processName: string,
  warningMessage: unknown,
  options: {
    occurred_at?: unknown;
    source?: string;
    source_ref?: string;
    payload?: Record<string, unknown>;
  } = {}
) {
  const occurredAt = toIso(options.occurred_at);
  const source = String(options.source || "system").trim().toLowerCase() || "system";
  const sourceRef = String(options.source_ref || `process:${processName}`).slice(0, 500);
  const payload = {
    process: processName,
    phase: "warning",
    warning_message: String(warningMessage || "warning").slice(0, 4000),
    ...(options.payload || {}),
  };
  await insertProcessEvent(pool, scope, {
    event_type: "process_warning",
    occurred_at: occurredAt,
    source,
    source_ref: sourceRef,
    payload_json: payload,
    dedupe_key: buildDedupeKey([
      scope.projectId,
      "process_warning",
      processName,
      sourceRef,
      occurredAt,
      payload.warning_message,
    ]),
  });
}
