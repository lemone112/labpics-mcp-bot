import { runAttioSync } from "./attio.js";
import { runChatwootSync } from "./chatwoot.js";
import { runLinearSync } from "./linear.js";
import { createComposioMcpRunner, createConnector } from "../../connectors/index.js";
import {
  getConnectorSyncState,
  listDueConnectorErrors,
  markConnectorSyncFailure,
  markConnectorSyncRunning,
  markConnectorSyncSuccess,
  registerConnectorError,
  resolveConnectorErrorById,
  resolveConnectorErrors,
} from "./connector-state.js";
import { syncConnectorEventLog } from "./event-log.js";
import {
  failProcessRun,
  finishProcessRun,
  startProcessRun,
  warnProcess,
} from "../core/process-log.js";
import { previewIdentitySuggestions } from "../identity/identity-graph.js";
import { runSyncReconciliation } from "./reconciliation.js";
import { withTransaction } from "../../infra/db.js";
import type { Pool, ProjectScope } from "../../types/index.js";

type LoggerLike = {
  info?: (obj: Record<string, unknown>, msg?: string) => void;
  warn?: (obj: Record<string, unknown>, msg?: string) => void;
  error?: (obj: Record<string, unknown>, msg?: string) => void;
};

type PublishFn = (
  event: string,
  payload: string
) => Promise<unknown> | unknown;

type HttpRunner = (
  pool: Pool,
  scope: ProjectScope,
  logger?: LoggerLike
) => Promise<unknown>;

type ConnectorPullResult = {
  mode?: unknown;
  since?: unknown;
  cursor_ts?: unknown;
  cursor_id?: unknown;
  coverage?: unknown;
  [key: string]: unknown;
};

type RunAllSyncOptions = {
  publishFn?: PublishFn;
};

type RetryConnectorErrorsOptions = {
  limit?: unknown;
  logger?: LoggerLike;
};

type ListConnectorErrorsOptions = {
  status?: unknown;
  limit?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function errorMessage(error: unknown, fallback = "connector_sync_failed"): string {
  return String((error as Error)?.message || error || fallback);
}

function asNullableText(value: unknown, max = 2000): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.slice(0, max);
}

export function normalizeInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function normalizeStatusFilter(status: unknown): string {
  return String(status || "").trim().toLowerCase();
}

export const CONNECTORS = ["chatwoot", "linear", "attio"] as const;

export function connectorMode(connector: string): string {
  const specific = String(
    process.env[`CONNECTOR_${connector.toUpperCase()}_MODE`] || ""
  )
    .trim()
    .toLowerCase();
  if (specific) return specific;
  const common = String(process.env.CONNECTOR_MODE || "")
    .trim()
    .toLowerCase();
  return common || "http";
}

export function getHttpRunner(connector: string): HttpRunner | null {
  if (connector === "chatwoot") return runChatwootSync as HttpRunner;
  if (connector === "linear") return runLinearSync as HttpRunner;
  if (connector === "attio") return runAttioSync as HttpRunner;
  return null;
}

async function runMcpConnector(payload: unknown): Promise<never> {
  const connector = String(asRecord(payload).connector || "connector");
  throw new Error(`${connector}_mcp_not_configured`);
}

export async function runConnectorSync(
  pool: Pool,
  scope: ProjectScope,
  connector: unknown,
  logger: LoggerLike = console
): Promise<Record<string, unknown>> {
  const normalizedConnector = String(connector || "").trim().toLowerCase();
  if (!CONNECTORS.includes(normalizedConnector as (typeof CONNECTORS)[number])) {
    throw new Error("unsupported_connector");
  }

  const mode = connectorMode(normalizedConnector);
  const state = await getConnectorSyncState(pool, scope, normalizedConnector);
  await markConnectorSyncRunning(pool, scope, normalizedConnector, mode, state);
  const run = await startProcessRun(pool, scope, `sync_${normalizedConnector}`, {
    source: normalizedConnector,
    payload: {
      connector: normalizedConnector,
      mode,
      cursor_ts_before: state?.cursor_ts || null,
      cursor_id_before: state?.cursor_id || null,
    },
  });

  const httpRunner = getHttpRunner(normalizedConnector);
  if (!httpRunner) {
    throw new Error("connector_runner_not_found");
  }
  const connectorRunner = createConnector({
    name: normalizedConnector,
    mode: mode as "http" | "mcp",
    httpRunner: async () => httpRunner(pool, scope, logger),
    mcpRunner: createComposioMcpRunner({
      connector: normalizedConnector,
      invoke: process.env.COMPOSIO_MCP_INVOKER ? runMcpConnector : undefined,
    }),
  });

  try {
    const result = (await connectorRunner.pull({
      pool,
      scope,
      logger,
    })) as ConnectorPullResult;
    if (String(result?.mode || "").toLowerCase() === "mock") {
      await warnProcess(
        pool,
        scope,
        `sync_${normalizedConnector}`,
        "Connector is running in mock mode",
        {
          payload: {
            connector: normalizedConnector,
            mode,
          },
        }
      );
    }
    const coverage = asRecord(result?.coverage);
    if (
      normalizedConnector === "attio" &&
      (Number(coverage.opportunities_without_account_ref || 0) > 0 ||
        Number(coverage.opportunities_unmapped_to_crm_account || 0) > 0)
    ) {
      await warnProcess(
        pool,
        scope,
        `sync_${normalizedConnector}`,
        "Attio sync completed with incomplete account mappings",
        {
          payload: {
            connector: normalizedConnector,
            mode,
            coverage: result.coverage,
          },
        }
      );
    }
    let eventSync: unknown = null;
    try {
      const stateCursorTs = asNullableText(state?.cursor_ts);
      const resultSince = asNullableText(result?.since);
      const resultCursorTs = asNullableText(result?.cursor_ts);
      eventSync = await syncConnectorEventLog(pool, scope, {
        connector: normalizedConnector,
        since_ts: stateCursorTs || resultSince || null,
        until_ts: resultCursorTs || new Date().toISOString(),
      });
    } catch (eventLogErr) {
      const eventLogMsg = errorMessage(eventLogErr, "event_log_sync_failed");
      logger.error?.(
        { connector: normalizedConnector, error: eventLogMsg },
        "event log sync failed (non-fatal)"
      );
      await warnProcess(
        pool,
        scope,
        `sync_${normalizedConnector}`,
        "Event log sync failed",
        {
          payload: { connector: normalizedConnector, error: eventLogMsg },
        }
      );
    }
    const resolvedErrors = await withTransaction(pool, async (client) => {
      const txClient = client as unknown as Pool;
      await markConnectorSyncSuccess(txClient, scope, normalizedConnector, mode, {
        cursor_ts: asNullableText(result?.cursor_ts),
        cursor_id: asNullableText(result?.cursor_id),
        page_cursor: null,
        meta: {
          ...result,
          event_log: eventSync,
        },
      });
      return resolveConnectorErrors(txClient, scope, normalizedConnector);
    });
    await finishProcessRun(pool, scope, run, {
      counters: {
        resolved_errors: resolvedErrors,
      },
      payload: {
        connector: normalizedConnector,
        mode,
        sync_result: result,
        event_sync: eventSync,
      },
    });
    return {
      connector: normalizedConnector,
      mode,
      result,
      event_log: eventSync,
      resolved_errors: resolvedErrors,
    };
  } catch (error) {
    const message = errorMessage(error);
    await registerConnectorError(pool, scope, {
      connector: normalizedConnector,
      mode,
      operation: "sync",
      source_ref: normalizedConnector,
      error_kind: "sync_failed",
      error_message: message,
      payload_json: {
        connector: normalizedConnector,
        mode,
      },
    });
    await markConnectorSyncFailure(
      pool,
      scope,
      normalizedConnector,
      mode,
      message,
      state
    );
    await failProcessRun(pool, scope, run, error, {
      payload: {
        connector: normalizedConnector,
        mode,
      },
    });
    throw error;
  }
}

export async function runAllConnectorsSync(
  pool: Pool,
  scope: ProjectScope,
  logger: LoggerLike = console,
  options: RunAllSyncOptions = {}
): Promise<Record<string, unknown>> {
  const run = await startProcessRun(pool, scope, "connectors_sync_cycle", {
    source: "system",
    payload: { connectors: CONNECTORS },
  });

  // Emit SSE progress event if publishFn is provided (44.5)
  const publishFn = options.publishFn || null;
  async function emitProgress(
    phase: string,
    detail: Record<string, unknown> = {}
  ) {
    if (typeof publishFn !== "function") return;
    try {
      await publishFn(
        "connector_sync_progress",
        JSON.stringify({
          project_id: scope.projectId,
          account_scope_id: scope.accountScopeId,
          phase,
          ...detail,
          at: new Date().toISOString(),
        })
      );
    } catch {
      // non-critical
    }
  }

  await emitProgress("started", { connectors: CONNECTORS });

  // Run all connectors in parallel using Promise.allSettled (44.1)
  const settled = await Promise.allSettled(
    CONNECTORS.map((connectorName) =>
      runConnectorSync(pool, scope, connectorName, logger).then((result) => ({
        connector: connectorName,
        status: "ok",
        ...result,
      }))
    )
  );

  const results: Array<Record<string, unknown>> = settled.map((outcome, idx) => {
    if (outcome.status === "fulfilled") {
      return outcome.value as Record<string, unknown>;
    }
    return {
      connector: CONNECTORS[idx],
      status: "failed",
      error: errorMessage(outcome.reason),
    };
  });

  await emitProgress("connectors_done", {
    ok: results.filter((r) => r.status === "ok").length,
    failed: results.filter((r) => r.status === "failed").length,
  });

  const summary = {
    total: CONNECTORS.length,
    ok: results.filter((row) => row.status === "ok").length,
    failed: results.filter((row) => row.status === "failed").length,
    results,
  };
  if (summary.failed > 0) {
    await warnProcess(
      pool,
      scope,
      "connectors_sync_cycle",
      "One or more connectors failed in cycle",
      {
        payload: summary,
      }
    );
  }

  await emitProgress("matview_refresh");
  try {
    await pool.query("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_portfolio_dashboard");
  } catch {
    // matview may not exist yet (pre-migration) — swallow
  }

  await emitProgress("identity_preview");
  try {
    await previewIdentitySuggestions(pool, scope, 50);
  } catch {
    // identity preview failure is non-critical
  }

  await emitProgress("reconciliation");
  let reconciliation: unknown = null;
  try {
    reconciliation = await runSyncReconciliation(pool, scope, {
      source: "sync_cycle",
    });
    const threshold = Number.parseFloat(
      process.env.CONNECTOR_RECONCILIATION_MIN_COMPLETENESS_PCT || "95"
    );
    const minCompleteness = Number.isFinite(threshold)
      ? Math.max(0, Math.min(threshold, 100))
      : 95;
    const reconciliationSummary = asRecord(
      asRecord(reconciliation).summary
    );
    const completeness = Number(reconciliationSummary.completeness_pct || 0);
    if (completeness < minCompleteness) {
      await warnProcess(
        pool,
        scope,
        "connectors_sync_cycle",
        "Reconciliation completeness is below threshold",
        {
          payload: {
            threshold: minCompleteness,
            completeness,
            summary: reconciliationSummary,
          },
        }
      );
    }
  } catch (error) {
    await warnProcess(
      pool,
      scope,
      "connectors_sync_cycle",
      "Reconciliation after sync cycle failed",
      {
        payload: {
          error: errorMessage(error),
        },
      }
    );
  }
  await finishProcessRun(pool, scope, run, {
    counters: {
      total: summary.total,
      ok: summary.ok,
      failed: summary.failed,
    },
    payload: {
      ...summary,
      reconciliation,
    },
  });

  await emitProgress("completed", {
    total: summary.total,
    ok: summary.ok,
    failed: summary.failed,
  });

  return {
    ...summary,
    reconciliation,
  };
}

export async function listConnectorSyncState(
  pool: Pool,
  scope: ProjectScope
): Promise<Array<Record<string, unknown>>> {
  const { rows } = await pool.query<Record<string, unknown>>(
    `
      SELECT
        connector,
        mode,
        status,
        cursor_ts,
        cursor_id,
        page_cursor,
        last_success_at,
        last_attempt_at,
        retry_count,
        last_error,
        meta,
        updated_at
      FROM connector_sync_state
      WHERE project_id = $1
        AND account_scope_id = $2
      ORDER BY connector ASC
    `,
    [scope.projectId, scope.accountScopeId]
  );
  return rows;
}

export async function listConnectorErrors(
  pool: Pool,
  scope: ProjectScope,
  options: ListConnectorErrorsOptions = {}
): Promise<Array<Record<string, unknown>>> {
  const status = normalizeStatusFilter(options.status);
  const limit = normalizeInt(options.limit, 100, 1, 500);
  const { rows } = await pool.query<Record<string, unknown>>(
    `
      SELECT
        id,
        connector,
        mode,
        operation,
        source_ref,
        error_kind,
        error_message,
        attempt,
        next_retry_at,
        status,
        payload_json,
        created_at,
        updated_at,
        resolved_at
      FROM connector_errors
      WHERE project_id = $1
        AND account_scope_id = $2
        AND ($3 = '' OR status = $3)
      ORDER BY updated_at DESC
      LIMIT $4
    `,
    [scope.projectId, scope.accountScopeId, status, limit]
  );
  return rows;
}

export async function retryConnectorErrors(
  pool: Pool,
  scope: ProjectScope,
  options: RetryConnectorErrorsOptions = {}
): Promise<Record<string, unknown>> {
  const limit = normalizeInt(options.limit, 20, 1, 200);
  const logger = options.logger || console;
  const run = await startProcessRun(pool, scope, "connector_errors_retry", {
    source: "system",
    payload: { limit },
  });
  const dueErrors = await listDueConnectorErrors(pool, scope, limit);
  const retried: Array<Record<string, unknown>> = [];
  let succeeded = 0;
  let failed = 0;

  for (const errorRow of dueErrors) {
    const connector = String(errorRow.connector || "").toLowerCase();
    try {
      const result = await runConnectorSync(pool, scope, connector, logger);
      await resolveConnectorErrorById(pool, scope, errorRow.id);
      succeeded += 1;
      retried.push({
        id: errorRow.id,
        connector,
        status: "resolved",
        result: asRecord(result).result || result,
      });
    } catch (error) {
      failed += 1;
      retried.push({
        id: errorRow.id,
        connector,
        status: "failed",
        error: errorMessage(error),
      });
    }
  }

  const summary = {
    due: dueErrors.length,
    succeeded,
    failed,
    retried,
  };
  if (failed > 0) {
    await warnProcess(
      pool,
      scope,
      "connector_errors_retry",
      "Connector retry cycle has failures",
      {
        payload: summary,
      }
    );
  }
  await finishProcessRun(pool, scope, run, {
    counters: {
      due: summary.due,
      succeeded,
      failed,
    },
    payload: summary,
  });
  return summary;
}
