import { runAttioSync } from "./attio.js";
import { runChatwootSync } from "./chatwoot.js";
import { runLinearSync } from "./linear.js";
import { createComposioMcpRunner, createConnector } from "../connectors/index.js";
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
import { failProcessRun, finishProcessRun, startProcessRun, warnProcess } from "./kag-process-log.js";

const CONNECTORS = ["chatwoot", "linear", "attio"];

function connectorMode(connector) {
  const specific = String(process.env[`CONNECTOR_${connector.toUpperCase()}_MODE`] || "").trim().toLowerCase();
  if (specific) return specific;
  const common = String(process.env.CONNECTOR_MODE || "").trim().toLowerCase();
  return common || "http";
}

function getHttpRunner(connector) {
  if (connector === "chatwoot") return runChatwootSync;
  if (connector === "linear") return runLinearSync;
  if (connector === "attio") return runAttioSync;
  return null;
}

async function runMcpConnector(payload) {
  const connector = String(payload?.connector || "connector");
  throw new Error(`${connector}_mcp_not_configured`);
}

export async function runConnectorSync(pool, scope, connector, logger = console) {
  const normalizedConnector = String(connector || "").trim().toLowerCase();
  if (!CONNECTORS.includes(normalizedConnector)) {
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
    mode,
    httpRunner: async () => httpRunner(pool, scope, logger),
    mcpRunner: createComposioMcpRunner({
      connector: normalizedConnector,
      invoke: process.env.COMPOSIO_MCP_INVOKER ? runMcpConnector : null,
    }),
  });

  try {
    const result = await connectorRunner.pull({ pool, scope, logger });
    if (String(result?.mode || "").toLowerCase() === "mock") {
      await warnProcess(pool, scope, `sync_${normalizedConnector}`, "Connector is running in mock mode", {
        payload: {
          connector: normalizedConnector,
          mode,
        },
      });
    }
    if (
      normalizedConnector === "attio" &&
      result?.coverage &&
      (Number(result.coverage.opportunities_without_account_ref || 0) > 0 ||
        Number(result.coverage.opportunities_unmapped_to_crm_account || 0) > 0)
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
    const eventSync = await syncConnectorEventLog(pool, scope, {
      connector: normalizedConnector,
      since_ts: state?.cursor_ts || result?.since || null,
      until_ts: result?.cursor_ts || new Date().toISOString(),
    });
    await markConnectorSyncSuccess(pool, scope, normalizedConnector, mode, {
      cursor_ts: result?.cursor_ts || null,
      cursor_id: result?.cursor_id || null,
      page_cursor: null,
      meta: {
        ...result,
        event_log: eventSync,
      },
    });
    const resolvedErrors = await resolveConnectorErrors(pool, scope, normalizedConnector);
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
    const message = String(error?.message || error || "connector_sync_failed");
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
    await markConnectorSyncFailure(pool, scope, normalizedConnector, mode, message, state);
    await failProcessRun(pool, scope, run, error, {
      payload: {
        connector: normalizedConnector,
        mode,
      },
    });
    throw error;
  }
}

export async function runAllConnectorsSync(pool, scope, logger = console) {
  const run = await startProcessRun(pool, scope, "connectors_sync_cycle", {
    source: "system",
    payload: { connectors: CONNECTORS },
  });
  const results = [];
  for (const connector of CONNECTORS) {
    try {
      const result = await runConnectorSync(pool, scope, connector, logger);
      results.push({ connector, status: "ok", ...result });
    } catch (error) {
      results.push({
        connector,
        status: "failed",
        error: String(error?.message || error),
      });
    }
  }
  const summary = {
    total: CONNECTORS.length,
    ok: results.filter((row) => row.status === "ok").length,
    failed: results.filter((row) => row.status === "failed").length,
    results,
  };
  if (summary.failed > 0) {
    await warnProcess(pool, scope, "connectors_sync_cycle", "One or more connectors failed in cycle", {
      payload: summary,
    });
  }
  await finishProcessRun(pool, scope, run, {
    counters: {
      total: summary.total,
      ok: summary.ok,
      failed: summary.failed,
    },
    payload: summary,
  });
  return summary;
}

export async function listConnectorSyncState(pool, scope) {
  const { rows } = await pool.query(
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

export async function listConnectorErrors(pool, scope, options = {}) {
  const status = String(options.status || "").trim().toLowerCase();
  const limitRaw = Number.parseInt(String(options.limit || "100"), 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 500)) : 100;
  const { rows } = await pool.query(
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

export async function retryConnectorErrors(pool, scope, options = {}) {
  const limitRaw = Number.parseInt(String(options.limit || "20"), 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 200)) : 20;
  const run = await startProcessRun(pool, scope, "connector_errors_retry", {
    source: "system",
    payload: { limit },
  });
  const dueErrors = await listDueConnectorErrors(pool, scope, limit);
  const retried = [];
  let succeeded = 0;
  let failed = 0;

  for (const errorRow of dueErrors) {
    const connector = String(errorRow.connector || "").toLowerCase();
    try {
      const result = await runConnectorSync(pool, scope, connector, options.logger || console);
      await resolveConnectorErrorById(pool, scope, errorRow.id);
      succeeded += 1;
      retried.push({
        id: errorRow.id,
        connector,
        status: "resolved",
        result: result.result || result,
      });
    } catch (error) {
      failed += 1;
      retried.push({
        id: errorRow.id,
        connector,
        status: "failed",
        error: String(error?.message || error),
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
    await warnProcess(pool, scope, "connector_errors_retry", "Connector retry cycle has failures", {
      payload: summary,
    });
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
