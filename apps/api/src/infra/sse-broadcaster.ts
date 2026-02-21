import type { FastifyReply } from "fastify";
import type { Logger } from "../types/index.js";

interface SseClient {
  reply: FastifyReply;
  sessionId: string | null;
}

export interface SseBroadcaster {
  addClient(projectId: string, reply: FastifyReply, sessionId: string | null): () => void;
  broadcast(projectId: string, eventType: string, data: unknown): number;
  broadcastAll(eventType: string, data: unknown): number;
  getStats(): { total_connections: number; projects: number };
  reapDeadClients(): number;
  shutdown(): void;
}

const MAX_CONNECTIONS_PER_PROJECT = 20;
const MAX_CONNECTIONS_GLOBAL = 500;

export function createSseBroadcaster(logger: Logger | Console = console): SseBroadcaster {
  const clients = new Map<string, Set<SseClient>>();
  let totalConnections = 0;

  function addClient(projectId: string, reply: FastifyReply, sessionId: string | null): () => void {
    const projectClients = clients.get(projectId);
    const projectCount = projectClients ? projectClients.size : 0;

    if (projectCount >= MAX_CONNECTIONS_PER_PROJECT) {
      logger.warn(
        { project_id: projectId, count: projectCount, max: MAX_CONNECTIONS_PER_PROJECT },
        "sse connection limit reached for project"
      );
      throw Object.assign(new Error("sse_project_limit_reached"), { code: "sse_project_limit_reached" });
    }

    if (totalConnections >= MAX_CONNECTIONS_GLOBAL) {
      logger.warn(
        { total: totalConnections, max: MAX_CONNECTIONS_GLOBAL },
        "sse global connection limit reached"
      );
      throw Object.assign(new Error("sse_global_limit_reached"), { code: "sse_global_limit_reached" });
    }

    if (!clients.has(projectId)) {
      clients.set(projectId, new Set());
    }
    const entry: SseClient = { reply, sessionId };
    clients.get(projectId)!.add(entry);
    totalConnections++;

    logger.info(
      { project_id: projectId, total: totalConnections },
      "sse client connected"
    );

    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      clients.get(projectId)?.delete(entry);
      totalConnections = Math.max(0, totalConnections - 1);
      if (clients.get(projectId)?.size === 0) {
        clients.delete(projectId);
      }
      logger.info(
        { project_id: projectId, total: totalConnections },
        "sse client disconnected"
      );
    };
  }

  function broadcast(projectId: string, eventType: string, data: unknown): number {
    const projectClients = clients.get(projectId);
    if (!projectClients || projectClients.size === 0) return 0;

    const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    let sent = 0;
    const dead: SseClient[] = [];
    for (const entry of projectClients) {
      try {
        if (entry.reply.raw.destroyed === true || entry.reply.raw.writable === false) {
          dead.push(entry);
          continue;
        }
        entry.reply.raw.write(payload);
        sent++;
      } catch {
        dead.push(entry);
      }
    }
    for (const entry of dead) {
      projectClients.delete(entry);
      totalConnections = Math.max(0, totalConnections - 1);
    }
    if (projectClients.size === 0) {
      clients.delete(projectId);
    }
    return sent;
  }

  function broadcastAll(eventType: string, data: unknown): number {
    let sent = 0;
    for (const projectId of clients.keys()) {
      sent += broadcast(projectId, eventType, data);
    }
    return sent;
  }

  function reapDeadClients(): number {
    let reaped = 0;
    for (const [projectId, projectClients] of clients) {
      for (const entry of projectClients) {
        if (entry.reply.raw.destroyed) {
          projectClients.delete(entry);
          totalConnections = Math.max(0, totalConnections - 1);
          reaped++;
        }
      }
      if (projectClients.size === 0) {
        clients.delete(projectId);
      }
    }
    if (reaped > 0) {
      logger.info({ reaped, total: totalConnections }, "sse reaper cleaned dead clients");
    }
    return reaped;
  }

  const reaperInterval = setInterval(reapDeadClients, 30_000);
  reaperInterval.unref();

  // Send SSE comment heartbeats to keep connections alive and detect dead clients early
  const heartbeatInterval = setInterval(() => {
    for (const [, projectClients] of clients) {
      for (const entry of projectClients) {
        try {
          if (!entry.reply.raw.destroyed && entry.reply.raw.writable) {
            entry.reply.raw.write(": heartbeat\n\n");
          }
        } catch {
          // will be cleaned up by reaper
        }
      }
    }
  }, 25_000);
  heartbeatInterval.unref();

  function getStats() {
    return {
      total_connections: totalConnections,
      projects: clients.size,
    };
  }

  function shutdown(): void {
    clearInterval(reaperInterval);
    clearInterval(heartbeatInterval);
  }

  return { addClient, broadcast, broadcastAll, getStats, reapDeadClients, shutdown };
}
