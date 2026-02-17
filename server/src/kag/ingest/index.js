import {
  buildGraphEdge,
  buildGraphEvent,
  buildGraphNode,
  insertGraphEvents,
  upsertGraphEdges,
  upsertGraphNodes,
} from "../graph/index.js";

function cleanText(value, max = 1000) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function makeNodeRef(nodeType, nodeKey) {
  return `${nodeType}:${nodeKey}`;
}

function parseDate(value) {
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
}

function sourceRefFromMessage(message, ragChunkIds = []) {
  return [
    {
      message_id: message.id,
      source_table: "cw_messages",
      source_pk: message.id,
    },
    ...ragChunkIds.map((chunkId) => ({
      rag_chunk_id: chunkId,
      source_table: "rag_chunks",
      source_pk: chunkId,
    })),
  ];
}

function sourceRefFromLinear(issue) {
  return [
    {
      linear_issue_id: issue.id || issue.external_id,
      source_table: "linear_issues_raw",
      source_pk: issue.id || issue.external_id,
    },
  ];
}

function sourceRefFromAttio(record) {
  return [
    {
      attio_record_id: record.id || record.external_id,
      source_table: "attio_opportunities_raw",
      source_pk: record.id || record.external_id,
    },
  ];
}

function fallbackEntityExtraction(messageText) {
  const text = String(messageText || "").toLowerCase();
  const entities = {
    agreements: [],
    decisions: [],
    risks: [],
    scope_change: false,
    need_detected: false,
  };
  if (!text) return entities;

  if (/(agreement|agreed|соглас|подтвердил|подтверждаем)/i.test(text)) {
    entities.agreements.push({ title: "Agreement from conversation", confidence: 0.6 });
  }
  if (/(decision|decided|решили|решение|утверждено)/i.test(text)) {
    entities.decisions.push({ title: "Decision from conversation", confidence: 0.6 });
  }
  if (/(risk|blocked|blocker|late|delay|риск|задерж)/i.test(text)) {
    entities.risks.push({ title: "Risk mention in conversation", confidence: 0.65 });
  }
  if (/(out of scope|outside scope|дополнительно|вне скоупа|доработк)/i.test(text)) {
    entities.scope_change = true;
  }
  if (/(upgrade|addon|add-on|expand|upsell|доп модул|новый модул)/i.test(text)) {
    entities.need_detected = true;
  }

  return entities;
}

async function extractMessageEntities(message, llmExtractEntities) {
  const content = cleanText(message.content || "", 8_000);
  if (!llmExtractEntities) return fallbackEntityExtraction(content);

  // LLM usage is intentionally constrained to structured extraction from messages.
  const extracted = await llmExtractEntities({
    message_id: message.id,
    conversation_global_id: message.conversation_global_id,
    text: content,
  });
  const safe = extracted && typeof extracted === "object" ? extracted : {};
  return {
    agreements: Array.isArray(safe.agreements) ? safe.agreements : [],
    decisions: Array.isArray(safe.decisions) ? safe.decisions : [],
    risks: Array.isArray(safe.risks) ? safe.risks : [],
    scope_change: Boolean(safe.scope_change),
    need_detected: Boolean(safe.need_detected),
  };
}

export async function buildGraphArtifactsFromSources({
  projectNodeKey = "project",
  messages = [],
  linearIssues = [],
  attioDeals = [],
  ragChunkIdsByMessage = {},
  llmExtractEntities = null,
}) {
  const nodeByRef = new Map();
  const edgeCandidates = [];
  const eventCandidates = [];

  function upsertNodeCandidate(nodeType, nodeKey, node) {
    const ref = makeNodeRef(nodeType, nodeKey);
    const existing = nodeByRef.get(ref);
    if (!existing) {
      nodeByRef.set(ref, buildGraphNode({ ...node, node_type: nodeType, node_key: nodeKey }));
      return;
    }
    const merged = {
      ...existing,
      payload: { ...(existing.payload || {}), ...(node.payload || {}) },
      numeric_fields: { ...(existing.numeric_fields || {}), ...(node.numeric_fields || {}) },
      source_refs: [...(existing.source_refs || []), ...(node.source_refs || [])],
      rag_chunk_refs: [...(existing.rag_chunk_refs || []), ...(node.rag_chunk_refs || [])],
    };
    nodeByRef.set(ref, buildGraphNode(merged));
  }

  upsertNodeCandidate("project", projectNodeKey, {
    title: "Project",
    payload: {},
    source_refs: [],
  });

  for (const message of messages) {
    const messageId = cleanText(message.id, 200);
    if (!messageId) continue;
    const conversationId = cleanText(message.conversation_global_id || `conversation:${messageId}`, 200);
    const ragChunkIds = Array.isArray(ragChunkIdsByMessage?.[messageId]) ? ragChunkIdsByMessage[messageId] : [];
    const evidenceRefs = sourceRefFromMessage(message, ragChunkIds);
    const senderType = cleanText(message.sender_type || "client", 40).toLowerCase();

    upsertNodeCandidate("conversation", conversationId, {
      title: `Conversation ${conversationId}`,
      payload: {
        conversation_id: conversationId,
      },
      source_refs: evidenceRefs,
      rag_chunk_refs: ragChunkIds,
    });
    upsertNodeCandidate("message", messageId, {
      title: cleanText(message.content || "", 140) || `Message ${messageId}`,
      payload: {
        sender_type: senderType,
        created_at: parseDate(message.created_at),
        content: cleanText(message.content || "", 1200),
      },
      source_refs: evidenceRefs,
      rag_chunk_refs: ragChunkIds,
    });

    edgeCandidates.push(
      buildGraphEdge({
        from_node_ref: makeNodeRef("project", projectNodeKey),
        to_node_ref: makeNodeRef("conversation", conversationId),
        relation_type: "project_has_conversation",
        source_refs: evidenceRefs,
        rag_chunk_refs: ragChunkIds,
      }),
      buildGraphEdge({
        from_node_ref: makeNodeRef("conversation", conversationId),
        to_node_ref: makeNodeRef("message", messageId),
        relation_type: "conversation_has_message",
        source_refs: evidenceRefs,
        rag_chunk_refs: ragChunkIds,
      })
    );

    eventCandidates.push(
      buildGraphEvent({
        event_type: "message_sent",
        event_ts: parseDate(message.created_at),
        subject_node_ref: makeNodeRef("message", messageId),
        payload: {
          sender: senderType,
          conversation_id: conversationId,
          sentiment_score: message.sentiment_score,
        },
        source_refs: evidenceRefs,
        rag_chunk_refs: ragChunkIds,
      })
    );

    const extracted = await extractMessageEntities(message, llmExtractEntities);
    extracted.agreements.forEach((agreement, idx) => {
      const agreementKey = cleanText(agreement.id || `${messageId}:agreement:${idx}`, 200);
      upsertNodeCandidate("agreement", agreementKey, {
        title: cleanText(agreement.title || "Agreement", 300),
        status: cleanText(agreement.status || "active", 30).toLowerCase(),
        payload: {
          due_at: agreement.due_at ? parseDate(agreement.due_at) : null,
          amount: Number(agreement.amount || 0),
          confidence: Number(agreement.confidence || 0),
        },
        source_refs: evidenceRefs,
        rag_chunk_refs: ragChunkIds,
      });
      edgeCandidates.push(
        buildGraphEdge({
          from_node_ref: makeNodeRef("project", projectNodeKey),
          to_node_ref: makeNodeRef("agreement", agreementKey),
          relation_type: "project_has_agreement",
          source_refs: evidenceRefs,
          rag_chunk_refs: ragChunkIds,
        })
      );
      eventCandidates.push(
        buildGraphEvent({
          event_type: "agreement_created",
          event_ts: parseDate(message.created_at),
          subject_node_ref: makeNodeRef("agreement", agreementKey),
          payload: {
            agreement_id: agreementKey,
            due_at: agreement.due_at || null,
            confidence: Number(agreement.confidence || 0),
          },
          source_refs: evidenceRefs,
          rag_chunk_refs: ragChunkIds,
        })
      );
    });

    extracted.decisions.forEach((decision, idx) => {
      const decisionKey = cleanText(decision.id || `${messageId}:decision:${idx}`, 200);
      upsertNodeCandidate("decision", decisionKey, {
        title: cleanText(decision.title || "Decision", 300),
        payload: {
          confidence: Number(decision.confidence || 0),
        },
        source_refs: evidenceRefs,
        rag_chunk_refs: ragChunkIds,
      });
      edgeCandidates.push(
        buildGraphEdge({
          from_node_ref: makeNodeRef("project", projectNodeKey),
          to_node_ref: makeNodeRef("decision", decisionKey),
          relation_type: "project_has_decision",
          source_refs: evidenceRefs,
          rag_chunk_refs: ragChunkIds,
        })
      );
      eventCandidates.push(
        buildGraphEvent({
          event_type: "decision_made",
          event_ts: parseDate(message.created_at),
          subject_node_ref: makeNodeRef("decision", decisionKey),
          payload: {
            decision_id: decisionKey,
            confidence: Number(decision.confidence || 0),
          },
          source_refs: evidenceRefs,
          rag_chunk_refs: ragChunkIds,
        })
      );
    });

    extracted.risks.forEach((risk, idx) => {
      const riskKey = cleanText(risk.id || `${messageId}:risk:${idx}`, 200);
      upsertNodeCandidate("risk", riskKey, {
        title: cleanText(risk.title || "Risk", 300),
        status: cleanText(risk.status || "active", 30).toLowerCase(),
        payload: {
          severity: Number(risk.severity || 3),
          confidence: Number(risk.confidence || 0),
        },
        source_refs: evidenceRefs,
        rag_chunk_refs: ragChunkIds,
      });
      edgeCandidates.push(
        buildGraphEdge({
          from_node_ref: makeNodeRef("project", projectNodeKey),
          to_node_ref: makeNodeRef("risk", riskKey),
          relation_type: "project_has_risk",
          source_refs: evidenceRefs,
          rag_chunk_refs: ragChunkIds,
        })
      );
      eventCandidates.push(
        buildGraphEvent({
          event_type: "risk_detected",
          event_ts: parseDate(message.created_at),
          subject_node_ref: makeNodeRef("risk", riskKey),
          payload: {
            risk_id: riskKey,
            severity: Number(risk.severity || 3),
            confidence: Number(risk.confidence || 0),
          },
          source_refs: evidenceRefs,
          rag_chunk_refs: ragChunkIds,
        })
      );
    });

    if (extracted.scope_change) {
      eventCandidates.push(
        buildGraphEvent({
          event_type: "scope_change_requested",
          event_ts: parseDate(message.created_at),
          subject_node_ref: makeNodeRef("message", messageId),
          payload: {
            request_from: "conversation",
            message_id: messageId,
          },
          source_refs: evidenceRefs,
          rag_chunk_refs: ragChunkIds,
        })
      );
    }

    if (extracted.need_detected) {
      eventCandidates.push(
        buildGraphEvent({
          event_type: "need_detected",
          event_ts: parseDate(message.created_at),
          subject_node_ref: makeNodeRef("message", messageId),
          payload: {
            source: "conversation",
            message_id: messageId,
          },
          source_refs: evidenceRefs,
          rag_chunk_refs: ragChunkIds,
        })
      );
    }
  }

  for (const issue of linearIssues) {
    const issueId = cleanText(issue.id || issue.external_id, 200);
    if (!issueId) continue;
    const evidenceRefs = sourceRefFromLinear(issue);
    const isBlocked = String(issue.state || "").toLowerCase().includes("blocked") || Boolean(issue.is_blocked);
    const taskKey = issueId;
    upsertNodeCandidate("task", taskKey, {
      title: cleanText(issue.title || `Task ${taskKey}`, 400),
      status: issue.completed_at ? "inactive" : "active",
      payload: {
        due_date: issue.due_date || null,
        completed_at: issue.completed_at || null,
        state: issue.state || null,
      },
      source_refs: evidenceRefs,
    });
    edgeCandidates.push(
      buildGraphEdge({
        from_node_ref: makeNodeRef("project", projectNodeKey),
        to_node_ref: makeNodeRef("task", taskKey),
        relation_type: "project_has_task",
        source_refs: evidenceRefs,
      })
    );
    if (isBlocked) {
      const blockerKey = cleanText(`blocker:${taskKey}`, 200);
      upsertNodeCandidate("blocker", blockerKey, {
        title: `Blocker for ${taskKey}`,
        payload: { linear_issue_id: issueId },
        source_refs: evidenceRefs,
      });
      edgeCandidates.push(
        buildGraphEdge({
          from_node_ref: makeNodeRef("task", taskKey),
          to_node_ref: makeNodeRef("blocker", blockerKey),
          relation_type: "task_blocked_by_blocker",
          source_refs: evidenceRefs,
        })
      );
      eventCandidates.push(
        buildGraphEvent({
          event_type: "task_blocked",
          event_ts: parseDate(issue.updated_at || issue.created_at || new Date()),
          subject_node_ref: makeNodeRef("blocker", blockerKey),
          payload: {
            blocker_id: blockerKey,
            task_id: taskKey,
          },
          source_refs: evidenceRefs,
        })
      );
    }
  }

  for (const deal of attioDeals) {
    const dealId = cleanText(deal.id || deal.external_id, 200);
    if (!dealId) continue;
    const evidenceRefs = sourceRefFromAttio(deal);
    upsertNodeCandidate("deal", dealId, {
      title: cleanText(deal.title || `Deal ${dealId}`, 400),
      status: cleanText(deal.stage || "active", 30).toLowerCase(),
      payload: {
        stage: deal.stage || null,
        amount: Number(deal.amount || 0),
        probability: Number(deal.probability || 0),
      },
      numeric_fields: {
        amount: Number(deal.amount || 0),
        probability: Number(deal.probability || 0),
      },
      source_refs: evidenceRefs,
    });
    edgeCandidates.push(
      buildGraphEdge({
        from_node_ref: makeNodeRef("project", projectNodeKey),
        to_node_ref: makeNodeRef("deal", dealId),
        relation_type: "project_has_deal",
        source_refs: evidenceRefs,
      })
    );
    eventCandidates.push(
      buildGraphEvent({
        event_type: "deal_updated",
        event_ts: parseDate(deal.updated_at || deal.created_at || new Date()),
        subject_node_ref: makeNodeRef("deal", dealId),
        payload: {
          deal_id: dealId,
          stage: deal.stage || null,
          amount: Number(deal.amount || 0),
          probability: Number(deal.probability || 0),
        },
        source_refs: evidenceRefs,
      })
    );

    if (Number(deal.amount || 0) > 0) {
      const financeKey = cleanText(`finance:${dealId}`, 200);
      upsertNodeCandidate("finance_entry", financeKey, {
        title: `Finance entry for ${dealId}`,
        payload: {
          entry_type: "revenue",
          amount: Number(deal.amount || 0),
        },
        numeric_fields: {
          amount: Number(deal.amount || 0),
        },
        source_refs: evidenceRefs,
      });
      edgeCandidates.push(
        buildGraphEdge({
          from_node_ref: makeNodeRef("project", projectNodeKey),
          to_node_ref: makeNodeRef("finance_entry", financeKey),
          relation_type: "project_has_finance_entry",
          source_refs: evidenceRefs,
        })
      );
      eventCandidates.push(
        buildGraphEvent({
          event_type: "finance_entry_created",
          event_ts: parseDate(deal.updated_at || deal.created_at || new Date()),
          subject_node_ref: makeNodeRef("finance_entry", financeKey),
          payload: {
            entry_type: "revenue",
            amount: Number(deal.amount || 0),
          },
          source_refs: evidenceRefs,
        })
      );
    }
  }

  return {
    nodes: [...nodeByRef.values()],
    edges: edgeCandidates,
    events: eventCandidates,
  };
}

function resolveNodeId(nodeRows, nodeRef) {
  const [nodeType, ...keyParts] = String(nodeRef || "").split(":");
  const nodeKey = keyParts.join(":");
  if (!nodeType || !nodeKey) return null;
  const found = nodeRows.find((row) => row.node_type === nodeType && row.node_key === nodeKey);
  return found?.id || null;
}

export async function ingestGraphArtifacts(pool, scope, artifacts = {}) {
  const nodes = Array.isArray(artifacts.nodes) ? artifacts.nodes : [];
  const edges = Array.isArray(artifacts.edges) ? artifacts.edges : [];
  const events = Array.isArray(artifacts.events) ? artifacts.events : [];

  const nodeRows = await upsertGraphNodes(pool, scope, nodes);

  const resolvedEdges = edges
    .map((edge) => ({
      ...edge,
      from_node_id: resolveNodeId(nodeRows, edge.from_node_ref),
      to_node_id: resolveNodeId(nodeRows, edge.to_node_ref),
    }))
    .filter((edge) => edge.from_node_id && edge.to_node_id);
  const edgeRows = await upsertGraphEdges(pool, scope, resolvedEdges);

  const resolvedEvents = events
    .map((event) => ({
      ...event,
      actor_node_id: resolveNodeId(nodeRows, event.actor_node_ref),
      subject_node_id: resolveNodeId(nodeRows, event.subject_node_ref),
    }))
    .filter((event) => event.event_type);
  const eventRows = await insertGraphEvents(pool, scope, resolvedEvents);

  return {
    nodes_upserted: nodeRows.length,
    edges_upserted: edgeRows.length,
    events_inserted: eventRows.length,
  };
}
