import crypto from "node:crypto";
import type { Pool, ProjectScope } from "../../types/index.js";

export function clampInt(
  value: unknown,
  fallback: number,
  min = 0,
  max = 1000
): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

export function nextBackoffSeconds(
  attempt: number,
  baseSeconds = 30,
  capSeconds = 6 * 60 * 60
): number {
  const power = Math.max(0, Math.min(10, attempt - 1));
  const seconds = baseSeconds * Math.pow(2, power);
  return Math.min(capSeconds, seconds);
}

interface DedupeKeyInput {
  connector: string;
  mode: string;
  operation: string;
  sourceRef?: string | null;
  errorKind?: string | null;
}

export function dedupeKeyForError({
  connector,
  mode,
  operation,
  sourceRef,
  errorKind,
}: DedupeKeyInput): string {
  return crypto
    .createHash("sha1")
    .update(`${connector}:${mode}:${operation}:${sourceRef || ""}:${errorKind || ""}`)
    .digest("hex");
}

export interface ConnectorSyncStateRow {
  project_id: string;
  account_scope_id: string;
  connector: string;
  mode: string;
  cursor_ts: string | null;
  cursor_id: string | null;
  page_cursor: string | null;
  last_success_at: string | null;
  last_attempt_at: string | null;
  status: string;
  retry_count: number;
  last_error: string | null;
  meta: Record<string, unknown> | null;
  updated_at: string;
}

interface SyncPatch {
  cursor_ts?: string | null;
  cursor_id?: string | null;
  page_cursor?: string | null;
  meta?: Record<string, unknown>;
}

interface RetryStateLike {
  retry_count?: unknown;
}

interface RegisterConnectorErrorOptions {
  connector?: unknown;
  mode?: unknown;
  operation?: unknown;
  source_ref?: unknown;
  error_kind?: unknown;
  error_message?: unknown;
  payload_json?: unknown;
  dedupe_key?: string;
}

interface ConnectorErrorRow {
  id: string;
  connector: string;
  mode: string;
  operation: string;
  source_ref: string | null;
  error_kind: string;
  error_message: string;
  payload_json: Record<string, unknown> | null;
  attempt: number;
  next_retry_at: string;
  status: string;
  dedupe_key: string;
  created_at: string;
  updated_at: string;
}

export async function getConnectorSyncState(
  pool: Pool,
  scope: ProjectScope,
  connector: string
): Promise<ConnectorSyncStateRow | null> {
  const { rows } = await pool.query<ConnectorSyncStateRow>(
    `
      SELECT
        project_id,
        account_scope_id,
        connector,
        mode,
        cursor_ts,
        cursor_id,
        page_cursor,
        last_success_at,
        last_attempt_at,
        status,
        retry_count,
        last_error,
        meta,
        updated_at
      FROM connector_sync_state
      WHERE project_id = $1
        AND account_scope_id = $2
        AND connector = $3
      LIMIT 1
    `,
    [scope.projectId, scope.accountScopeId, connector]
  );
  return rows[0] || null;
}

export async function markConnectorSyncRunning(
  pool: Pool,
  scope: ProjectScope,
  connector: string,
  mode: string,
  existingState: RetryStateLike | null = null
): Promise<void> {
  const retryCount = clampInt(existingState?.retry_count, 0);
  await pool.query(
    `
      INSERT INTO connector_sync_state(
        project_id,
        account_scope_id,
        connector,
        mode,
        status,
        retry_count,
        last_attempt_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, 'running', $5, now(), now())
      ON CONFLICT (project_id, connector)
      DO UPDATE SET
        mode = EXCLUDED.mode,
        status = 'running',
        retry_count = $5,
        last_attempt_at = now(),
        updated_at = now()
    `,
    [scope.projectId, scope.accountScopeId, connector, mode, retryCount]
  );
}

export async function markConnectorSyncSuccess(
  pool: Pool,
  scope: ProjectScope,
  connector: string,
  mode: string,
  patch: SyncPatch = {}
): Promise<void> {
  await pool.query(
    `
      INSERT INTO connector_sync_state(
        project_id,
        account_scope_id,
        connector,
        mode,
        cursor_ts,
        cursor_id,
        page_cursor,
        last_success_at,
        last_attempt_at,
        status,
        retry_count,
        last_error,
        meta,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now(), 'ok', 0, NULL, $8::jsonb, now())
      ON CONFLICT (project_id, connector)
      DO UPDATE SET
        mode = EXCLUDED.mode,
        cursor_ts = EXCLUDED.cursor_ts,
        cursor_id = EXCLUDED.cursor_id,
        page_cursor = EXCLUDED.page_cursor,
        last_success_at = now(),
        last_attempt_at = now(),
        status = 'ok',
        retry_count = 0,
        last_error = NULL,
        meta = EXCLUDED.meta,
        updated_at = now()
    `,
    [
      scope.projectId,
      scope.accountScopeId,
      connector,
      mode,
      patch.cursor_ts || null,
      patch.cursor_id || null,
      patch.page_cursor || null,
      JSON.stringify(patch.meta || {}),
    ]
  );
}

export async function markConnectorSyncFailure(
  pool: Pool,
  scope: ProjectScope,
  connector: string,
  mode: string,
  errorMessage: unknown,
  existingState: RetryStateLike | null = null
): Promise<void> {
  const retryCount = clampInt(existingState?.retry_count, 0) + 1;
  await pool.query(
    `
      INSERT INTO connector_sync_state(
        project_id,
        account_scope_id,
        connector,
        mode,
        status,
        retry_count,
        last_error,
        last_attempt_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, 'failed', $5, $6, now(), now())
      ON CONFLICT (project_id, connector)
      DO UPDATE SET
        mode = EXCLUDED.mode,
        status = 'failed',
        retry_count = $5,
        last_error = $6,
        last_attempt_at = now(),
        updated_at = now()
    `,
    [
      scope.projectId,
      scope.accountScopeId,
      connector,
      mode,
      retryCount,
      String(errorMessage || "").slice(0, 2000),
    ]
  );
}

export async function registerConnectorError(
  pool: Pool,
  scope: ProjectScope,
  options: RegisterConnectorErrorOptions = {}
): Promise<{
  id: string | null;
  attempt: number;
  status: string;
  next_retry_at: string;
}> {
  const connector = String(options.connector || "").trim().toLowerCase();
  const mode = String(options.mode || "http").trim().toLowerCase();
  const operation = String(options.operation || "sync").trim().slice(0, 200);
  const sourceRef = String(options.source_ref || "").trim().slice(0, 500) || null;
  const errorKind = String(options.error_kind || "connector_error")
    .trim()
    .slice(0, 200);
  const errorMessage = String(options.error_message || "connector error")
    .trim()
    .slice(0, 4000);
  const payloadJson =
    options.payload_json && typeof options.payload_json === "object"
      ? (options.payload_json as Record<string, unknown>)
      : {};
  const maxAttempts = clampInt(process.env.CONNECTOR_MAX_RETRIES, 5, 1, 20);
  const dedupeKey =
    options.dedupe_key ||
    dedupeKeyForError({ connector, mode, operation, sourceRef, errorKind });

  const existing = await pool.query<{ id: string; attempt: number }>(
    `
      SELECT id, attempt
      FROM connector_errors
      WHERE project_id = $1
        AND account_scope_id = $2
        AND connector = $3
        AND dedupe_key = $4
        AND status IN ('pending', 'retrying')
      ORDER BY id DESC
      LIMIT 1
    `,
    [scope.projectId, scope.accountScopeId, connector, dedupeKey]
  );

  const attempt = existing.rows[0]
    ? clampInt(existing.rows[0].attempt, 1) + 1
    : 1;
  const now = new Date();
  const retryAfterSeconds = nextBackoffSeconds(
    attempt,
    clampInt(process.env.CONNECTOR_RETRY_BASE_SECONDS, 30, 5, 300)
  );
  const nextRetryAt = addSeconds(now, retryAfterSeconds);
  const status =
    attempt >= maxAttempts ? "dead_letter" : attempt > 1 ? "retrying" : "pending";

  if (existing.rows[0]) {
    await pool.query(
      `
        UPDATE connector_errors
        SET mode = $5,
            operation = $6,
            source_ref = $7,
            error_kind = $8,
            error_message = $9,
            payload_json = $10::jsonb,
            attempt = $11,
            next_retry_at = $12,
            status = $13,
            updated_at = now()
        WHERE id = $1
          AND project_id = $2
          AND account_scope_id = $3
          AND connector = $4
      `,
      [
        existing.rows[0].id,
        scope.projectId,
        scope.accountScopeId,
        connector,
        mode,
        operation,
        sourceRef,
        errorKind,
        errorMessage,
        JSON.stringify(payloadJson),
        attempt,
        nextRetryAt.toISOString(),
        status,
      ]
    );
    return {
      id: existing.rows[0].id,
      attempt,
      status,
      next_retry_at: nextRetryAt.toISOString(),
    };
  }

  const inserted = await pool.query<{ id: string }>(
    `
      INSERT INTO connector_errors(
        project_id,
        account_scope_id,
        connector,
        mode,
        operation,
        source_ref,
        error_kind,
        error_message,
        payload_json,
        attempt,
        next_retry_at,
        status,
        dedupe_key,
        updated_at
      )
      VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, now())
      RETURNING id
    `,
    [
      scope.projectId,
      scope.accountScopeId,
      connector,
      mode,
      operation,
      sourceRef,
      errorKind,
      errorMessage,
      JSON.stringify(payloadJson),
      attempt,
      nextRetryAt.toISOString(),
      status,
      dedupeKey,
    ]
  );
  return {
    id: inserted.rows[0]?.id || null,
    attempt,
    status,
    next_retry_at: nextRetryAt.toISOString(),
  };
}

export async function resolveConnectorErrors(
  pool: Pool,
  scope: ProjectScope,
  connector: string
): Promise<number> {
  const result = await pool.query(
    `
      UPDATE connector_errors
      SET status = 'resolved',
          resolved_at = now(),
          updated_at = now()
      WHERE project_id = $1
        AND account_scope_id = $2
        AND connector = $3
        AND status IN ('pending', 'retrying')
    `,
    [scope.projectId, scope.accountScopeId, connector]
  );
  return result.rowCount || 0;
}

export async function listDueConnectorErrors(
  pool: Pool,
  scope: ProjectScope,
  limit = 20
): Promise<ConnectorErrorRow[]> {
  const safeLimit = clampInt(limit, 20, 1, 500);
  const { rows } = await pool.query<ConnectorErrorRow>(
    `
      SELECT
        id,
        connector,
        mode,
        operation,
        source_ref,
        error_kind,
        error_message,
        payload_json,
        attempt,
        next_retry_at,
        status,
        dedupe_key,
        created_at,
        updated_at
      FROM connector_errors
      WHERE project_id = $1
        AND account_scope_id = $2
        AND status IN ('pending', 'retrying')
        AND next_retry_at <= now()
      ORDER BY next_retry_at ASC, id ASC
      LIMIT $3
    `,
    [scope.projectId, scope.accountScopeId, safeLimit]
  );
  return rows;
}

export async function listDeadLetterErrors(
  pool: Pool,
  scope: ProjectScope,
  limit = 50
): Promise<ConnectorErrorRow[]> {
  const safeLimit = clampInt(limit, 50, 1, 500);
  const { rows } = await pool.query<ConnectorErrorRow>(
    `
      SELECT
        id, connector, mode, operation, source_ref,
        error_kind, error_message, payload_json,
        attempt, next_retry_at, status, dedupe_key,
        created_at, updated_at
      FROM connector_errors
      WHERE project_id = $1
        AND account_scope_id = $2
        AND status = 'dead_letter'
      ORDER BY updated_at DESC, id ASC
      LIMIT $3
    `,
    [scope.projectId, scope.accountScopeId, safeLimit]
  );
  return rows;
}

export async function retryDeadLetterError(
  pool: Pool,
  scope: ProjectScope,
  errorId: string
): Promise<ConnectorErrorRow | null> {
  const result = await pool.query<ConnectorErrorRow>(
    `
      UPDATE connector_errors
      SET status = 'pending',
          attempt = 0,
          next_retry_at = now(),
          updated_at = now()
      WHERE id = $1
        AND project_id = $2
        AND account_scope_id = $3
        AND status = 'dead_letter'
      RETURNING *
    `,
    [errorId, scope.projectId, scope.accountScopeId]
  );
  return result.rows[0] || null;
}

export async function resolveConnectorErrorById(
  pool: Pool,
  scope: ProjectScope,
  errorId: string
): Promise<string | null> {
  const result = await pool.query<{ id: string }>(
    `
      UPDATE connector_errors
      SET status = 'resolved',
          resolved_at = now(),
          updated_at = now()
      WHERE id = $1
        AND project_id = $2
        AND account_scope_id = $3
      RETURNING id
    `,
    [errorId, scope.projectId, scope.accountScopeId]
  );
  return result.rows[0]?.id || null;
}
