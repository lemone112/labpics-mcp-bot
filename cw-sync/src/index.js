function jh(extra) {
  return Object.assign({ "content-type": "application/json" }, extra || {});
}

function requireBearer(request, env) {
  const got = request.headers.get("authorization") || "";
  const expected = `Bearer ${env.SYNC_TOKEN}`;
  if (got !== expected) throw new Response("Unauthorized", { status: 401 });
}

function pid(env) {
  return (env.PROJECT_ID && env.PROJECT_ID.trim()) || `cw:${env.CHATWOOT_ACCOUNT_ID}`;
}

async function sb(env, method, path, body, extraHeaders) {
  const res = await fetch(env.SUPABASE_URL + path, {
    method,
    headers: Object.assign(
      jh(),
      {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      extraHeaders || {}
    ),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${method} ${path} failed: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function cw(env, path) {
  const res = await fetch(env.CHATWOOT_BASE_URL + path, {
    headers: Object.assign(jh(), { api_access_token: env.CHATWOOT_API_TOKEN }),
  });
  if (!res.ok) throw new Error(`Chatwoot GET ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function convG(accountId, conversationId) {
  return `cw:${accountId}:${conversationId}`;
}
function msgG(accountId, messageId) {
  return `cwmsg:${accountId}:${messageId}`;
}

function chunkText(text, chunkChars) {
  const s = (text || "").trim();
  if (!s) return [];
  const out = [];
  for (let i = 0; i < s.length; i += chunkChars) out.push(s.slice(i, i + chunkChars));
  return out;
}

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function openaiEmb(env, inputs) {
  const model = env.EMBEDDING_MODEL || "text-embedding-3-small";
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: Object.assign(jh(), { authorization: `Bearer ${env.OPENAI_API_KEY}` }),
    body: JSON.stringify({ model, input: inputs }),
  });
  if (!res.ok) throw new Error(`OpenAI embeddings failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return { model, vectors: data.data.map((d) => d.embedding) };
}

async function getWatermark(env) {
  const table = env.SYNC_TABLE || "rag_chatwoot_sync_state";
  const qs =
    `?project_id=eq.${encodeURIComponent(pid(env))}` +
    `&source=eq.chatwoot` +
    `&account_id=eq.${encodeURIComponent(env.CHATWOOT_ACCOUNT_ID)}` +
    `&select=project_id,source,account_id,last_processed_at,last_processed_message_id,status,error,meta` +
    `&limit=1`;
  const rows = await sb(env, "GET", `/rest/v1/${table}${qs}`);
  return rows && rows[0] ? rows[0] : null;
}

async function upsertWatermark(env, patch) {
  const table = env.SYNC_TABLE || "rag_chatwoot_sync_state";
  const row = Object.assign(
    {
      project_id: pid(env),
      source: "chatwoot",
      account_id: String(env.CHATWOOT_ACCOUNT_ID),
      status: "ok",
      error: null,
      meta: {},
    },
    patch || {}
  );

  await sb(env, "POST", `/rest/v1/${table}?on_conflict=project_id,source,account_id`, row, {
    prefer: "resolution=merge-duplicates,return=minimal",
  });
}

async function upsertConversation(env, convo) {
  const row = {
    project_id: pid(env),
    conversation_global_id: convG(String(env.CHATWOOT_ACCOUNT_ID), convo.id),
    account_id: String(convo.account_id || env.CHATWOOT_ACCOUNT_ID),
    conversation_id: String(convo.id),
    inbox_id: convo.inbox_id != null ? String(convo.inbox_id) : null,
    status: convo.status != null ? String(convo.status) : null,
    subject: convo.subject != null ? String(convo.subject) : null,
    metadata: convo,
  };
  await sb(env, "POST", `/rest/v1/cw_conversations?on_conflict=project_id,conversation_global_id`, row, {
    prefer: "resolution=merge-duplicates,return=minimal",
  });
}

async function upsertMessage(env, conversationGlobalId, msg) {
  const row = {
    project_id: pid(env),
    conversation_global_id: conversationGlobalId,
    message_global_id: msgG(String(env.CHATWOOT_ACCOUNT_ID), msg.id),
    account_id: String(msg.account_id || env.CHATWOOT_ACCOUNT_ID),
    conversation_id: msg.conversation_id != null ? String(msg.conversation_id) : null,
    message_id: String(msg.id),
    sender_type: msg.sender_type != null ? String(msg.sender_type) : null,
    sender_id: msg.sender_id != null ? String(msg.sender_id) : null,
    sender_name:
      msg.sender && msg.sender.name
        ? String(msg.sender.name)
        : msg.sender_name
          ? String(msg.sender_name)
          : null,
    content: msg.content != null ? String(msg.content) : "",
    content_type: msg.content_type != null ? String(msg.content_type) : null,
    private: !!msg.private,
    attachments: msg.attachments || [],
    metadata: msg,
  };

  await sb(env, "POST", `/rest/v1/cw_messages?on_conflict=project_id,message_global_id`, row, {
    prefer: "resolution=merge-duplicates,return=minimal",
  });

  return row.message_global_id;
}

async function createPendingChunks(env, conversationGlobalId, messageGlobalId, content, sourceUpdatedAtISO) {
  const ragTable = env.RAG_TABLE || "rag_chunks";
  const chunkChars = parseInt(env.CHUNK_CHARS || "1200", 10);
  const model = env.EMBEDDING_MODEL || "text-embedding-3-small";
  const chunks = chunkText(content, chunkChars);
  if (!chunks.length) return 0;

  const rows = [];
  for (let i = 0; i < chunks.length; i++) {
    const material = `${pid(env)}|chatwoot|${messageGlobalId}|${i}|${model}|${chunks[i]}`;
    const chunkHash = await sha256Hex(material);
    rows.push({
      project_id: pid(env),
      source: "chatwoot",
      conversation_global_id: conversationGlobalId,
      message_global_id: messageGlobalId,
      chunk_index: i,
      chunk_hash: chunkHash,
      content_kind: "message",
      text: chunks[i],
      embedding: null,
      embedding_model: model,
      embedding_status: "pending",
      source_updated_at: sourceUpdatedAtISO || null,
      metadata: { kind: "message_chunk" },
    });
  }

  await sb(env, "POST", `/rest/v1/${ragTable}?on_conflict=project_id,source,chunk_hash`, rows, {
    prefer: "resolution=merge-duplicates,return=minimal",
  });

  return rows.length;
}

async function processPendingEmbeddings(env) {
  const ragTable = env.RAG_TABLE || "rag_chunks";
  const batchSize = parseInt(env.EMBED_BATCH || "64", 10);
  const maxBatches = Math.max(1, parseInt(env.EMBED_MAX_BATCHES_PER_RUN || "1", 10));

  let total = 0;
  let batches = 0;

  for (let b = 0; b < maxBatches; b++) {
    const rows = await sb(
      env,
      "GET",
      `/rest/v1/${ragTable}` +
        `?select=chunk_id,text` +
        `&project_id=eq.${encodeURIComponent(pid(env))}` +
        `&source=eq.chatwoot` +
        `&embedding_status=eq.pending` +
        `&limit=${batchSize}` +
        `&order=created_at.asc`
    );

    if (!rows || !rows.length) break;

    const { model, vectors } = await openaiEmb(env, rows.map((r) => r.text));

    for (let i = 0; i < rows.length; i++) {
      await sb(
        env,
        "PATCH",
        `/rest/v1/${ragTable}?chunk_id=eq.${encodeURIComponent(rows[i].chunk_id)}`,
        { embedding: vectors[i], embedding_model: model, embedding_status: "ready" },
        { prefer: "return=minimal" }
      );
    }

    total += rows.length;
    batches++;
  }

  return { embedded: total, batches };
}

async function runSync(env) {
  await upsertWatermark(env, {
    status: "running",
    error: null,
    last_run_at: new Date().toISOString(),
    meta: { run_started_at: new Date().toISOString() },
  });

  const wm = await getWatermark(env);
  const since = wm && wm.last_processed_at ? String(wm.last_processed_at) : null;

  const maxConvos = parseInt(env.MAX_CONVERSATIONS_PER_RUN || "50", 10);
  const maxMsgs = parseInt(env.MAX_MESSAGES_PER_CONVERSATION || "200", 10);
  const minLen = parseInt(env.MIN_EMBED_CHARS || "30", 10);

  const convosResp = await cw(
    env,
    `/api/v1/accounts/${env.CHATWOOT_ACCOUNT_ID}/conversations?sort_by=last_activity_at&order_by=desc&page=1`
  );

  const convos = convosResp?.data?.payload || [];
  const picked = convos.slice(0, maxConvos);

  let newestSeen = since;
  let newestMsgGlobalId = wm && wm.last_processed_message_id ? String(wm.last_processed_message_id) : null;

  let processedConvos = 0;
  let processedMsgs = 0;
  let pendingChunks = 0;

  for (const convo of picked) {
    const lastActivityISO = convo?.last_activity_at ? new Date(convo.last_activity_at).toISOString() : null;
    if (since && lastActivityISO && lastActivityISO <= since) continue;

    await upsertConversation(env, convo);
    processedConvos++;

    const conversationGlobalId = convG(String(env.CHATWOOT_ACCOUNT_ID), convo.id);

    const msgsResp = await cw(env, `/api/v1/accounts/${env.CHATWOOT_ACCOUNT_ID}/conversations/${convo.id}/messages`);
    const msgs = Array.isArray(msgsResp?.payload) ? msgsResp.payload : [];
    const tail = msgs.slice(-maxMsgs);

    for (const msg of tail) {
      const createdISO = msg?.created_at ? new Date(msg.created_at).toISOString() : null;
      if (since && createdISO && createdISO <= since) continue;

      const messageGlobalId = await upsertMessage(env, conversationGlobalId, msg);
      processedMsgs++;

      if (!msg.private) {
        const text = String(msg.content || "").trim();
        if (text.length >= minLen) {
          pendingChunks += await createPendingChunks(env, conversationGlobalId, messageGlobalId, text, createdISO);
        }
      }

      if (!newestSeen || (createdISO && createdISO > newestSeen)) {
        newestSeen = createdISO;
        newestMsgGlobalId = messageGlobalId;
      }
    }
  }

  await upsertWatermark(env, {
    status: "ok",
    error: null,
    last_processed_at: newestSeen,
    last_processed_message_id: newestMsgGlobalId,
    last_success_at: new Date().toISOString(),
    meta: {
      run_finished_at: new Date().toISOString(),
      processed_conversations: processedConvos,
      processed_messages: processedMsgs,
      pending_chunks_created: pendingChunks,
    },
  });

  return { ok: true, processedConvos, processedMsgs, pendingChunks };
}

function shouldRunDailySyncNowUTC() {
  const now = new Date();
  return now.getUTCHours() === 0 && now.getUTCMinutes() < 10;
}

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);

      if (url.pathname === "/sync" && request.method === "GET") {
        requireBearer(request, env);
        const out = await runSync(env);
        return new Response(JSON.stringify(out, null, 2), { status: 200, headers: jh() });
      }

      if (url.pathname === "/embed" && request.method === "GET") {
        requireBearer(request, env);
        const out = await processPendingEmbeddings(env);
        return new Response(JSON.stringify(out, null, 2), { status: 200, headers: jh() });
      }

      if (url.pathname === "/health") {
        return new Response(JSON.stringify({ ok: true }, null, 2), { status: 200, headers: jh() });
      }

      return new Response("OK", { status: 200 });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e && e.message ? e.message : e) }, null, 2), {
        status: 500,
        headers: jh(),
      });
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        // Always embed a little every 10 minutes
        await processPendingEmbeddings(env);

        // Sync only once per day (first 10 minutes after 00:00 UTC)
        if (shouldRunDailySyncNowUTC()) {
          await runSync(env);
          await processPendingEmbeddings(env);
        }
      })()
    );
  },
};
