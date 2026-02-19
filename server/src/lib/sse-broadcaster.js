/**
 * Manages connected SSE clients, grouped by project ID.
 * Broadcasts events to all clients subscribed to a specific project.
 */
export function createSseBroadcaster(logger = console) {
  // Map<projectId, Set<{ reply, sessionId }>>
  const clients = new Map();
  let totalConnections = 0;

  /**
   * Register a new SSE client.
   * @param {string} projectId
   * @param {import("fastify").FastifyReply} reply
   * @param {string|null} sessionId
   * @returns {() => void} cleanup function
   */
  function addClient(projectId, reply, sessionId) {
    if (!clients.has(projectId)) {
      clients.set(projectId, new Set());
    }
    const entry = { reply, sessionId };
    clients.get(projectId).add(entry);
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

  /**
   * Send an SSE event to all clients for a given project.
   * @param {string} projectId
   * @param {string} eventType
   * @param {object} data
   * @returns {number} number of clients reached
   */
  function broadcast(projectId, eventType, data) {
    const projectClients = clients.get(projectId);
    if (!projectClients || projectClients.size === 0) return 0;

    const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    let sent = 0;
    for (const { reply } of projectClients) {
      try {
        reply.raw.write(payload);
        sent++;
      } catch {
        // Client disconnected; will be cleaned up by the close handler
      }
    }
    return sent;
  }

  /**
   * Broadcast to ALL connected clients regardless of project.
   * Useful for system-wide events.
   */
  function broadcastAll(eventType, data) {
    let sent = 0;
    for (const projectId of clients.keys()) {
      sent += broadcast(projectId, eventType, data);
    }
    return sent;
  }

  function reapDeadClients() {
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

  const reaperInterval = setInterval(reapDeadClients, 60_000);
  reaperInterval.unref();

  function getStats() {
    return {
      total_connections: totalConnections,
      projects: clients.size,
    };
  }

  function shutdown() {
    clearInterval(reaperInterval);
  }

  return { addClient, broadcast, broadcastAll, getStats, reapDeadClients, shutdown };
}
