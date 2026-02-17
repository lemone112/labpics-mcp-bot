import { fetchWithRetry } from "../lib/http.js";
import { chunkText, toIsoTime, toPositiveInt } from "../lib/chunking.js";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function conversationGlobalId(accountId, conversationId) {
  return `cw:${accountId}:${conversationId}`;
}

function messageGlobalId(accountId, messageId) {
  return `cwmsg:${accountId}:${messageId}`;
}

async function chatwootGet(baseUrl, token, path, logger) {
  const res = await fetchWithRetry(`${baseUrl}${path}`, {
    method: "GET",
    timeoutMs: 20_000,
    retries: 2,
    logger,
    headers: {
      api_access_token: token,
      "content-type": "application/json",
    },
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Chatwoot GET ${path} failed ${res.status}: ${text.slice(0, 500)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Chatwoot GET ${path} returned invalid JSON`);
  }
}

async function getWatermark(pool, source) {
  const { rows } = await pool.query(
    `
      SELECT source, cursor_ts, cursor_id, meta
      FROM sync_watermarks
      WHERE source = $1
      LIMIT 1
    `,
    [source]
  );
  return rows[0] || null;
}

async function upsertWatermark(pool, source, cursorTs, cursorId, meta) {
  await pool.query(
    `
      INSERT INTO sync_watermarks(source, cursor_ts, cursor_id, meta, updated_at)
      VALUES ($1, $2, $3, $4::jsonb, now())
      ON CONFLICT (source)
      DO UPDATE
      SET cursor_ts = EXCLUDED.cursor_ts,
          cursor_id = EXCLUDED.cursor_id,
          meta = EXCLUDED.meta,
          updated_at = now()
    `,
    [source, cursorTs, cursorId, JSON.stringify(meta || {})]
  );
}

export async function runChatwootSync(pool, logger = console) {
  const baseUrl = requiredEnv("CHATWOOT_BASE_URL").replace(/\/+$/, "");
  const apiToken = requiredEnv("CHATWOOT_API_TOKEN");
  const accountId = String(requiredEnv("CHATWOOT_ACCOUNT_ID"));
  const source = `chatwoot:${accountId}`;

  const maxConversations = toPositiveInt(process.env.CHATWOOT_CONVERSATIONS_LIMIT, 30, 1, 200);
  const maxMessagesPerConversation = toPositiveInt(process.env.CHATWOOT_MESSAGES_LIMIT, 300, 1, 1500);
  const lookbackDays = toPositiveInt(process.env.CHATWOOT_LOOKBACK_DAYS, 7, 1, 365);
  const chunkSize = toPositiveInt(process.env.CHUNK_SIZE, 1000, 200, 4000);
  const minChunkChars = toPositiveInt(process.env.MIN_EMBED_CHARS, 30, 1, 1000);
  const embeddingModel = process.env.EMBEDDING_MODEL || "text-embedding-3-small";

  const previousWatermark = await getWatermark(pool, source);
  const defaultSince = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
  const since = previousWatermark?.cursor_ts
    ? new Date(previousWatermark.cursor_ts).toISOString()
    : defaultSince;

  const convPayload = await chatwootGet(
    baseUrl,
    apiToken,
    `/api/v1/accounts/${accountId}/conversations?sort_by=last_activity_at&order_by=desc&page=1`,
    logger
  );
  const conversations = Array.isArray(convPayload?.data?.payload)
    ? convPayload.data.payload
    : Array.isArray(convPayload?.payload)
      ? convPayload.payload
      : [];

  let processedConversations = 0;
  let processedMessages = 0;
  let createdChunks = 0;
  let newestTs = previousWatermark?.cursor_ts ? new Date(previousWatermark.cursor_ts).toISOString() : since;
  let newestMsgId = previousWatermark?.cursor_id || null;

  for (const convo of conversations.slice(0, maxConversations)) {
    const conversationId = Number(convo?.id);
    if (!Number.isFinite(conversationId)) continue;

    const convoGlobalId = conversationGlobalId(accountId, conversationId);
    const convoUpdatedAt = toIsoTime(convo?.last_activity_at || convo?.updated_at || convo?.created_at);

    await pool.query(
      `
        INSERT INTO cw_conversations(id, account_id, conversation_id, data, updated_at)
        VALUES ($1, $2, $3, $4::jsonb, $5)
        ON CONFLICT (id)
        DO UPDATE SET
          account_id = EXCLUDED.account_id,
          conversation_id = EXCLUDED.conversation_id,
          data = EXCLUDED.data,
          updated_at = EXCLUDED.updated_at
      `,
      [convoGlobalId, Number(accountId), conversationId, JSON.stringify(convo), convoUpdatedAt]
    );
    processedConversations++;

    const msgPayload = await chatwootGet(
      baseUrl,
      apiToken,
      `/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
      logger
    );
    const messages = Array.isArray(msgPayload?.payload)
      ? msgPayload.payload
      : Array.isArray(msgPayload?.data?.payload)
        ? msgPayload.data.payload
        : [];

    for (const msg of messages.slice(-maxMessagesPerConversation)) {
      const messageId = Number(msg?.id);
      if (!Number.isFinite(messageId)) continue;

      const createdAt = toIsoTime(msg?.created_at || msg?.updated_at);
      if (createdAt && createdAt <= since) continue;

      const msgGlobalId = messageGlobalId(accountId, messageId);
      const content = String(msg?.content || "");
      const convIdRaw = Number(msg?.conversation_id || conversationId);
      const conversationRefId = Number.isFinite(convIdRaw) ? convIdRaw : conversationId;

      await pool.query(
        `
          INSERT INTO cw_messages(id, account_id, message_id, conversation_id, content, data, created_at)
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
          ON CONFLICT (id)
          DO UPDATE SET
            account_id = EXCLUDED.account_id,
            message_id = EXCLUDED.message_id,
            conversation_id = EXCLUDED.conversation_id,
            content = EXCLUDED.content,
            data = EXCLUDED.data,
            created_at = COALESCE(cw_messages.created_at, EXCLUDED.created_at)
        `,
        [
          msgGlobalId,
          Number(accountId),
          messageId,
          conversationRefId,
          content,
          JSON.stringify(msg),
          createdAt,
        ]
      );
      processedMessages++;

      if (!msg?.private) {
        const chunks = chunkText(content, chunkSize);
        if (content.trim().length >= minChunkChars && chunks.length) {
          for (let idx = 0; idx < chunks.length; idx++) {
            const chunk = chunks[idx];
            const res = await pool.query(
              `
                INSERT INTO rag_chunks(
                  conversation_global_id,
                  message_global_id,
                  chunk_index,
                  text,
                  embedding_status,
                  embedding_model
                )
                VALUES($1, $2, $3, $4, 'pending', $5)
                ON CONFLICT (message_global_id, chunk_index) DO NOTHING
              `,
              [convoGlobalId, msgGlobalId, idx, chunk, embeddingModel]
            );
            createdChunks += res.rowCount || 0;
          }
        }
      }

      if (!newestTs || (createdAt && createdAt > newestTs)) {
        newestTs = createdAt;
        newestMsgId = msgGlobalId;
      }
    }
  }

  await upsertWatermark(pool, source, newestTs, newestMsgId, {
    processed_conversations: processedConversations,
    processed_messages: processedMessages,
    created_chunks: createdChunks,
    since,
    synced_at: new Date().toISOString(),
  });

  return {
    source,
    since,
    processed_conversations: processedConversations,
    processed_messages: processedMessages,
    created_chunks: createdChunks,
    cursor_ts: newestTs,
    cursor_id: newestMsgId,
  };
}
