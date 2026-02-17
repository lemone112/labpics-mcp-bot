export function createConnector({ name, mode = "http", httpRunner, mcpRunner }) {
  const connectorName = String(name || "").trim().toLowerCase();
  const connectorMode = String(mode || "http").trim().toLowerCase();
  if (!connectorName) throw new Error("connector_name_required");
  if (!["http", "mcp"].includes(connectorMode)) throw new Error("connector_mode_invalid");

  return {
    name: connectorName,
    mode: connectorMode,
    async pull(context) {
      if (connectorMode === "mcp") {
        const runner = typeof mcpRunner === "function" ? mcpRunner : null;
        if (!runner) throw new Error(`${connectorName}_mcp_not_configured`);
        return runner(context);
      }
      const runner = typeof httpRunner === "function" ? httpRunner : null;
      if (!runner) throw new Error(`${connectorName}_http_not_configured`);
      return runner(context);
    },
  };
}

export function createComposioMcpRunner({ connector, invoke }) {
  if (typeof invoke !== "function") {
    return async () => {
      throw new Error(`${connector}_mcp_not_configured`);
    };
  }
  return async (context) => {
    // Contract for composio/MCP bridge:
    // invoke({ connector, operation: "sync", context })
    return invoke({
      connector,
      operation: "sync",
      context,
    });
  };
}
