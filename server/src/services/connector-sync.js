import { runAttioSync } from "./attio.js";
import { runChatwootSync } from "./chatwoot.js";
import { runLinearSync } from "./linear.js";
import { createComposioMcpRunner, createConnector } from "../connectors/index.js";
import {
  getConnectorSyncState,
  markConnectorSyncFailure,
  markConnectorSyncRunning,
  markConnectorSyncSuccess,
  registerConnectorError,
  resolveConnectorErrors,
} from "./connector-state.js";
import { syncConnectorEventLog } from "./event-log.js";

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
    throw error;
  }
}

export async function runAllConnectorsSync(pool, scope, logger = console) {
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
  return {
    total: CONNECTORS.length,
    ok: results.filter((row) => row.status === "ok").length,
    failed: results.filter((row) => row.status === "failed").length,
    results,
  };
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
