interface ConnectorOptions {
  name: string;
  mode?: "http" | "mcp";
  httpRunner?: (context: unknown) => Promise<unknown>;
  mcpRunner?: (context: unknown) => Promise<unknown>;
}

interface Connector {
  name: string;
  mode: string;
  pull(context: unknown): Promise<unknown>;
}

export function createConnector({ name, mode = "http", httpRunner, mcpRunner }: ConnectorOptions): Connector {
  const connectorName = String(name || "").trim().toLowerCase();
  const connectorMode = String(mode || "http").trim().toLowerCase();
  if (!connectorName) throw new Error("connector_name_required");
  if (!["http", "mcp"].includes(connectorMode)) throw new Error("connector_mode_invalid");

  return {
    name: connectorName,
    mode: connectorMode,
    async pull(context: unknown) {
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

interface ComposioMcpRunnerOptions {
  connector: string;
  invoke?: (params: { connector: string; operation: string; context: unknown }) => Promise<unknown>;
}

export function createComposioMcpRunner({ connector, invoke }: ComposioMcpRunnerOptions) {
  if (typeof invoke !== "function") {
    return async () => {
      throw new Error(`${connector}_mcp_not_configured`);
    };
  }
  return async (context: unknown) => {
    return invoke({
      connector,
      operation: "sync",
      context,
    });
  };
}
