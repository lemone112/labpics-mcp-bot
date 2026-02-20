import crypto from "node:crypto";

import { fetchWithRetry } from "../lib/http.js";
import { chunkText, toIsoTime, toPositiveInt } from "../lib/chunking.js";
import { resolveProjectSourceBinding } from "./sources.js";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function conversationGlobalId(projectId, accountId, conversationId) {
  return `cw:${projectId}:${accountId}:${conversationId}`;
}

function messageGlobalId(projectId, accountId, messageId) {
  return `cwmsg:${projectId}:${accountId}:${messageId}`;
}

function contactGlobalId(projectId, accountId, contactId) {
  return `cwc:${projectId}:${accountId}:${contactId}`;
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function estimateTokens(text) {
  const clean = String(text || "").trim();
  if (!clean) return 0;
  return Math.max(1, Math.ceil(clean.length / 4));
}

function toBigIntOrNull(value) {
  if (value == null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

function asTextOrNull(value, maxLen = 2000) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, maxLen);
}

function readConversations(payload) {
  if (Array.isArray(payload?.data?.payload)) return payload.data.payload;
  if (Array.isArray(payload?.payload)) return payload.payload;
  return [];
}

function readMessages(payload) {
  if (Array.isArray(payload?.payload)) return payload.payload;
  if (Array.isArray(payload?.data?.payload)) return payload.data.payload;
  return [];
}

function readInboxes(payload) {
  if (Array.isArray(payload?.payload)) return payload.payload;
  if (Array.isArray(payload?.data?.payload)) return payload.data.payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function getCursorMessageNumericId(cursorId) {
  const parts = String(cursorId || "").split(":");
  const tail = Number(parts[parts.length - 1]);
  return Number.isFinite(tail) ? tail : null;
}

function shouldSkipMessage(createdAt, since, messageId, watermarkMessageId) {
  if (!createdAt) {
    if (!Number.isFinite(watermarkMessageId)) return false;
    return messageId <= watermarkMessageId;
  }
  if (createdAt < since) return true;
  if (createdAt > since) return false;
  if (!Number.isFinite(watermarkMessageId)) return false;
  return messageId <= watermarkMessageId;
}

function extractContact(sender, projectId, accountId, fallbackUpdatedAt, fallbackId = null) {
  if (!sender || typeof sender !== "object") return null;
  const rawId = sender.id ?? fallbackId;
  const contactId = toBigIntOrNull(rawId);
  if (!Number.isFinite(contactId)) return null;

  const name = asTextOrNull(sender.name, 500);
  const email = asTextOrNull(sender.email, 500);
  const phone = asTextOrNull(sender.phone_number || sender.phoneNumber, 100);
  const identifier = asTextOrNull(sender.identifier, 500);
  const updatedAt = toIsoTime(sender.updated_at || sender.last_activity_at) || fallbackUpdatedAt;
  const customAttributes =
    sender.custom_attributes && typeof sender.custom_attributes === "object"
      ? sender.custom_attributes
      : sender.additional_attributes && typeof sender.additional_attributes === "object"
        ? sender.additional_attributes
        : {};

  return {
    id: contactGlobalId(projectId, accountId, contactId),
    account_id: Number(accountId),
    contact_id: contactId,
    name,
    email,
    phone_number: phone,
    identifier,
    custom_attributes: customAttributes,
    data: sender,
    updated_at: updatedAt,
  };
}

function extractConversationContact(conversation, projectId, accountId, fallbackUpdatedAt) {
  const sender = conversation?.meta?.sender || conversation?.contact || conversation?.sender || null;
  const senderType = String(sender?.type || sender?.role || "").toLowerCase();
  if (senderType && !senderType.includes("contact") && !senderType.includes("customer")) return null;
  return extractContact(sender, projectId, accountId, fallbackUpdatedAt);
}

function extractMessageContact(message, projectId, accountId, fallbackUpdatedAt) {
  const senderType = String(message?.sender_type || "").toLowerCase();
  const senderObjectType = String(message?.sender?.type || "").toLowerCase();
  const sender = message?.sender || null;
  const senderId = message?.sender_id;

  if (senderType.includes("contact")) {
    return extractContact(sender, projectId, accountId, fallbackUpdatedAt, senderId);
  }

  if (!senderType && (!senderObjectType || senderObjectType.includes("contact"))) {
    return extractContact(sender, projectId, accountId, fallbackUpdatedAt, senderId);
  }
  return null;
}

async function chatwootGet(baseUrl, token, endpoint, logger) {
  const res = await fetchWithRetry(`${baseUrl}${endpoint}`, {
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
  if (!res.ok) {
    throw new Error(`Chatwoot GET ${endpoint} failed (${res.status})`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Chatwoot GET ${endpoint} returned invalid JSON`);
  }
}

async function listConversations(baseUrl, token, accountId, maxConversations, logger) {
  const perPage = toPositiveInt(process.env.CHATWOOT_CONVERSATIONS_PER_PAGE, 25, 1, 100);
  const maxPages = toPositiveInt(process.env.CHATWOOT_PAGES_LIMIT, 20, 1, 200);
  const out = [];
  const seen = new Set();

  for (let page = 1; page <= maxPages && out.length < maxConversations; page++) {
    const payload = await chatwootGet(
      baseUrl,
      token,
      `/api/v1/accounts/${accountId}/conversations?sort_by=last_activity_at&order_by=desc&page=${page}&per_page=${perPage}`,
      logger
    );
    const conversations = readConversations(payload);
    if (!conversations.length) break;

    let addedThisPage = 0;
    for (const convo of conversations) {
      const conversationId = toBigIntOrNull(convo?.id);
      if (!Number.isFinite(conversationId)) continue;
      const key = String(conversationId);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(convo);
      addedThisPage++;
      if (out.length >= maxConversations) break;
    }

    if (addedThisPage === 0) break;
    if (conversations.length < perPage) break;
  }

  return out.slice(0, maxConversations);
}

async function listInboxes(baseUrl, token, accountId, logger) {
  const payload = await chatwootGet(baseUrl, token, `/api/v1/accounts/${accountId}/inboxes`, logger);
  return readInboxes(payload);
}

async function getWatermark(pool, scope, source) {
  const { rows } = await pool.query(
    `
      SELECT source, cursor_ts, cursor_id, meta
      FROM sync_watermarks
      WHERE project_id = $1
        AND account_scope_id = $2
        AND source = $3
      LIMIT 1
    `,
    [scope.projectId, scope.accountScopeId, source]
  );
  return rows[0] || null;
}

async function upsertWatermark(pool, scope, source, cursorTs, cursorId, meta) {
  await pool.query(
    `
      INSERT INTO sync_watermarks(project_id, account_scope_id, source, cursor_ts, cursor_id, meta, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, now())
      ON CONFLICT (project_id, source)
      DO UPDATE
      SET account_scope_id = EXCLUDED.account_scope_id,
          cursor_ts = EXCLUDED.cursor_ts,
          cursor_id = EXCLUDED.cursor_id,
          meta = EXCLUDED.meta,
          updated_at = now()
    `,
    [scope.projectId, scope.accountScopeId, source, cursorTs, cursorId, JSON.stringify(meta || {})]
  );
}

async function upsertConversation(pool, scope, row) {
  await pool.query(
    `
      INSERT INTO cw_conversations(
        id,
        project_id,
        account_scope_id,
        account_id,
        conversation_id,
        contact_global_id,
        inbox_id,
        status,
        assignee_id,
        data,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
      ON CONFLICT (id)
      DO UPDATE SET
        project_id = EXCLUDED.project_id,
        account_scope_id = EXCLUDED.account_scope_id,
        account_id = EXCLUDED.account_id,
        conversation_id = EXCLUDED.conversation_id,
        contact_global_id = EXCLUDED.contact_global_id,
        inbox_id = EXCLUDED.inbox_id,
        status = EXCLUDED.status,
        assignee_id = EXCLUDED.assignee_id,
        data = EXCLUDED.data,
        updated_at = EXCLUDED.updated_at
      WHERE
        cw_conversations.data IS DISTINCT FROM EXCLUDED.data
        OR cw_conversations.updated_at IS DISTINCT FROM EXCLUDED.updated_at
        OR cw_conversations.contact_global_id IS DISTINCT FROM EXCLUDED.contact_global_id
        OR cw_conversations.inbox_id IS DISTINCT FROM EXCLUDED.inbox_id
        OR cw_conversations.status IS DISTINCT FROM EXCLUDED.status
        OR cw_conversations.assignee_id IS DISTINCT FROM EXCLUDED.assignee_id
    `,
    [
      row.id,
      scope.projectId,
      scope.accountScopeId,
      row.account_id,
      row.conversation_id,
      row.contact_global_id,
      row.inbox_id,
      row.status,
      row.assignee_id,
      JSON.stringify(row.data),
      row.updated_at,
    ]
  );
}

async function upsertMessagesBatch(pool, scope, rows) {
  if (!rows.length) return 0;

  const payload = rows.map((row) => ({
    id: row.id,
    project_id: scope.projectId,
    account_scope_id: scope.accountScopeId,
    account_id: row.account_id,
    message_id: row.message_id,
    conversation_id: row.conversation_id,
    conversation_global_id: row.conversation_global_id,
    contact_global_id: row.contact_global_id,
    sender_type: row.sender_type,
    sender_id: row.sender_id,
    private: row.private,
    message_type: row.message_type,
    content: row.content,
    data: row.data,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  const { rowCount } = await pool.query(
    `
      INSERT INTO cw_messages(
        id,
        project_id,
        account_scope_id,
        account_id,
        message_id,
        conversation_id,
        conversation_global_id,
        contact_global_id,
        sender_type,
        sender_id,
        private,
        message_type,
        content,
        data,
        created_at,
        updated_at
      )
      SELECT
        x.id,
        x.project_id,
        x.account_scope_id,
        x.account_id,
        x.message_id,
        x.conversation_id,
        x.conversation_global_id,
        x.contact_global_id,
        x.sender_type,
        x.sender_id,
        x.private,
        x.message_type,
        x.content,
        x.data,
        x.created_at,
        x.updated_at
      FROM jsonb_to_recordset($1::jsonb) AS x(
        id text,
        project_id uuid,
        account_scope_id uuid,
        account_id bigint,
        message_id bigint,
        conversation_id bigint,
        conversation_global_id text,
        contact_global_id text,
        sender_type text,
        sender_id bigint,
        private boolean,
        message_type text,
        content text,
        data jsonb,
        created_at timestamptz,
        updated_at timestamptz
      )
      ON CONFLICT (id)
      DO UPDATE SET
        project_id = EXCLUDED.project_id,
        account_scope_id = EXCLUDED.account_scope_id,
        account_id = EXCLUDED.account_id,
        message_id = EXCLUDED.message_id,
        conversation_id = EXCLUDED.conversation_id,
        conversation_global_id = EXCLUDED.conversation_global_id,
        contact_global_id = EXCLUDED.contact_global_id,
        sender_type = EXCLUDED.sender_type,
        sender_id = EXCLUDED.sender_id,
        private = EXCLUDED.private,
        message_type = EXCLUDED.message_type,
        content = EXCLUDED.content,
        data = EXCLUDED.data,
        created_at = COALESCE(cw_messages.created_at, EXCLUDED.created_at),
        updated_at = EXCLUDED.updated_at
      WHERE
        cw_messages.data IS DISTINCT FROM EXCLUDED.data
        OR cw_messages.content IS DISTINCT FROM EXCLUDED.content
        OR cw_messages.updated_at IS DISTINCT FROM EXCLUDED.updated_at
        OR cw_messages.contact_global_id IS DISTINCT FROM EXCLUDED.contact_global_id
        OR cw_messages.sender_type IS DISTINCT FROM EXCLUDED.sender_type
        OR cw_messages.sender_id IS DISTINCT FROM EXCLUDED.sender_id
        OR cw_messages.private IS DISTINCT FROM EXCLUDED.private
        OR cw_messages.message_type IS DISTINCT FROM EXCLUDED.message_type
    `,
    [JSON.stringify(payload)]
  );
  return rowCount || 0;
}

async function upsertContactsBatch(pool, scope, contacts) {
  if (!contacts.length) return 0;

  const payload = contacts.map((row) => ({
    id: row.id,
    project_id: scope.projectId,
    account_scope_id: scope.accountScopeId,
    account_id: row.account_id,
    contact_id: row.contact_id,
    name: row.name,
    email: row.email,
    phone_number: row.phone_number,
    identifier: row.identifier,
    custom_attributes: row.custom_attributes || {},
    data: row.data || {},
    updated_at: row.updated_at || null,
  }));

  const { rowCount } = await pool.query(
    `
      INSERT INTO cw_contacts(
        id,
        project_id,
        account_scope_id,
        account_id,
        contact_id,
        name,
        email,
        phone_number,
        identifier,
        custom_attributes,
        data,
        updated_at
      )
      SELECT
        x.id,
        x.project_id,
        x.account_scope_id,
        x.account_id,
        x.contact_id,
        x.name,
        x.email,
        x.phone_number,
        x.identifier,
        x.custom_attributes,
        x.data,
        x.updated_at
      FROM jsonb_to_recordset($1::jsonb) AS x(
        id text,
        project_id uuid,
        account_scope_id uuid,
        account_id bigint,
        contact_id bigint,
        name text,
        email text,
        phone_number text,
        identifier text,
        custom_attributes jsonb,
        data jsonb,
        updated_at timestamptz
      )
      ON CONFLICT (id)
      DO UPDATE SET
        project_id = EXCLUDED.project_id,
        account_scope_id = EXCLUDED.account_scope_id,
        account_id = EXCLUDED.account_id,
        contact_id = EXCLUDED.contact_id,
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        phone_number = EXCLUDED.phone_number,
        identifier = EXCLUDED.identifier,
        custom_attributes = EXCLUDED.custom_attributes,
        data = EXCLUDED.data,
        updated_at = EXCLUDED.updated_at
      WHERE
        cw_contacts.data IS DISTINCT FROM EXCLUDED.data
        OR cw_contacts.updated_at IS DISTINCT FROM EXCLUDED.updated_at
        OR cw_contacts.name IS DISTINCT FROM EXCLUDED.name
        OR cw_contacts.email IS DISTINCT FROM EXCLUDED.email
        OR cw_contacts.phone_number IS DISTINCT FROM EXCLUDED.phone_number
        OR cw_contacts.identifier IS DISTINCT FROM EXCLUDED.identifier
    `,
    [JSON.stringify(payload)]
  );

  return rowCount || 0;
}

async function upsertInboxesBatch(pool, scope, rows) {
  if (!rows.length) return 0;
  const payload = rows.map((row) => ({
    id: row.id,
    project_id: scope.projectId,
    account_scope_id: scope.accountScopeId,
    account_id: row.account_id,
    inbox_id: row.inbox_id,
    name: row.name,
    channel_type: row.channel_type,
    data: row.data || {},
    updated_at: row.updated_at || null,
  }));

  const { rowCount } = await pool.query(
    `
      INSERT INTO cw_inboxes_raw(
        id,
        project_id,
        account_scope_id,
        account_id,
        inbox_id,
        name,
        channel_type,
        data,
        updated_at
      )
      SELECT
        x.id,
        x.project_id,
        x.account_scope_id,
        x.account_id,
        x.inbox_id,
        x.name,
        x.channel_type,
        x.data,
        x.updated_at
      FROM jsonb_to_recordset($1::jsonb) AS x(
        id text,
        project_id uuid,
        account_scope_id uuid,
        account_id bigint,
        inbox_id bigint,
        name text,
        channel_type text,
        data jsonb,
        updated_at timestamptz
      )
      ON CONFLICT (id)
      DO UPDATE SET
        project_id = EXCLUDED.project_id,
        account_scope_id = EXCLUDED.account_scope_id,
        account_id = EXCLUDED.account_id,
        inbox_id = EXCLUDED.inbox_id,
        name = EXCLUDED.name,
        channel_type = EXCLUDED.channel_type,
        data = EXCLUDED.data,
        updated_at = EXCLUDED.updated_at
      WHERE
        cw_inboxes_raw.data IS DISTINCT FROM EXCLUDED.data
        OR cw_inboxes_raw.updated_at IS DISTINCT FROM EXCLUDED.updated_at
        OR cw_inboxes_raw.name IS DISTINCT FROM EXCLUDED.name
        OR cw_inboxes_raw.channel_type IS DISTINCT FROM EXCLUDED.channel_type
    `,
    [JSON.stringify(payload)]
  );

  return rowCount || 0;
}

async function upsertAttachmentsBatch(pool, scope, rows) {
  if (!rows.length) return 0;
  const payload = rows.map((row) => ({
    id: row.id,
    project_id: scope.projectId,
    account_scope_id: scope.accountScopeId,
    account_id: row.account_id,
    message_global_id: row.message_global_id,
    conversation_global_id: row.conversation_global_id,
    content_type: row.content_type,
    file_size: row.file_size,
    file_url: row.file_url,
    thumb_url: row.thumb_url,
    payload: row.payload || {},
    updated_at: row.updated_at || null,
  }));

  const { rowCount } = await pool.query(
    `
      INSERT INTO cw_attachments_raw(
        id,
        project_id,
        account_scope_id,
        account_id,
        message_global_id,
        conversation_global_id,
        content_type,
        file_size,
        file_url,
        thumb_url,
        payload,
        updated_at
      )
      SELECT
        x.id,
        x.project_id,
        x.account_scope_id,
        x.account_id,
        x.message_global_id,
        x.conversation_global_id,
        x.content_type,
        x.file_size,
        x.file_url,
        x.thumb_url,
        x.payload,
        x.updated_at
      FROM jsonb_to_recordset($1::jsonb) AS x(
        id text,
        project_id uuid,
        account_scope_id uuid,
        account_id bigint,
        message_global_id text,
        conversation_global_id text,
        content_type text,
        file_size bigint,
        file_url text,
        thumb_url text,
        payload jsonb,
        updated_at timestamptz
      )
      ON CONFLICT (id)
      DO UPDATE SET
        project_id = EXCLUDED.project_id,
        account_scope_id = EXCLUDED.account_scope_id,
        account_id = EXCLUDED.account_id,
        message_global_id = EXCLUDED.message_global_id,
        conversation_global_id = EXCLUDED.conversation_global_id,
        content_type = EXCLUDED.content_type,
        file_size = EXCLUDED.file_size,
        file_url = EXCLUDED.file_url,
        thumb_url = EXCLUDED.thumb_url,
        payload = EXCLUDED.payload,
        updated_at = EXCLUDED.updated_at
      WHERE
        cw_attachments_raw.payload IS DISTINCT FROM EXCLUDED.payload
        OR cw_attachments_raw.updated_at IS DISTINCT FROM EXCLUDED.updated_at
        OR cw_attachments_raw.content_type IS DISTINCT FROM EXCLUDED.content_type
        OR cw_attachments_raw.file_size IS DISTINCT FROM EXCLUDED.file_size
        OR cw_attachments_raw.file_url IS DISTINCT FROM EXCLUDED.file_url
        OR cw_attachments_raw.thumb_url IS DISTINCT FROM EXCLUDED.thumb_url
    `,
    [JSON.stringify(payload)]
  );

  return rowCount || 0;
}

async function insertChunkRows(pool, scope, chunkRows) {
  if (!chunkRows.length) return { inserted: 0, reset_pending: 0 };

  const payload = chunkRows.map((row) => ({
    project_id: scope.projectId,
    account_scope_id: scope.accountScopeId,
    conversation_global_id: row.conversation_global_id,
    message_global_id: row.message_global_id,
    chunk_index: row.chunk_index,
    text: row.text,
    text_hash: row.text_hash,
    content_tokens: row.content_tokens,
    embedding_model: row.embedding_model,
  }));

  const inserted = await pool.query(
    `
      INSERT INTO rag_chunks(
        project_id,
        account_scope_id,
        conversation_global_id,
        message_global_id,
        chunk_index,
        text,
        text_hash,
        content_tokens,
        embedding_status,
        embedding_model,
        updated_at
      )
      SELECT
        x.project_id,
        x.account_scope_id,
        x.conversation_global_id,
        x.message_global_id,
        x.chunk_index,
        x.text,
        x.text_hash,
        x.content_tokens,
        'pending',
        x.embedding_model,
        now()
      FROM jsonb_to_recordset($1::jsonb) AS x(
        project_id uuid,
        account_scope_id uuid,
        conversation_global_id text,
        message_global_id text,
        chunk_index int,
        text text,
        text_hash text,
        content_tokens int,
        embedding_model text
      )
      ON CONFLICT (message_global_id, chunk_index)
      DO NOTHING
    `,
    [JSON.stringify(payload)]
  );

  const resetPending = await pool.query(
    `
      UPDATE rag_chunks AS rc
      SET
        conversation_global_id = x.conversation_global_id,
        text = x.text,
        text_hash = x.text_hash,
        content_tokens = x.content_tokens,
        embedding_status = 'pending',
        embedding_model = x.embedding_model,
        embedding = NULL,
        embedding_error = NULL,
        updated_at = now()
      FROM jsonb_to_recordset($1::jsonb) AS x(
        project_id uuid,
        account_scope_id uuid,
        conversation_global_id text,
        message_global_id text,
        chunk_index int,
        text text,
        text_hash text,
        content_tokens int,
        embedding_model text
      )
      WHERE
        rc.project_id = x.project_id
        AND rc.account_scope_id = x.account_scope_id
        AND rc.message_global_id = x.message_global_id
        AND rc.chunk_index = x.chunk_index
        AND rc.text_hash IS DISTINCT FROM x.text_hash
    `,
    [JSON.stringify(payload)]
  );

  return {
    inserted: inserted.rowCount || 0,
    reset_pending: resetPending.rowCount || 0,
  };
}

function buildChunkRows({ conversationGlobalId: cgid, messageGlobalId: mgid, content, chunkSize, embeddingModel, minChunkChars }) {
  if (String(content || "").trim().length < minChunkChars) return [];

  const chunks = chunkText(content, chunkSize);
  if (!chunks.length) return [];

  const rows = [];
  for (let index = 0; index < chunks.length; index++) {
    const text = chunks[index];
    rows.push({
      conversation_global_id: cgid,
      message_global_id: mgid,
      chunk_index: index,
      text,
      text_hash: sha256Hex(text),
      content_tokens: estimateTokens(text),
      embedding_model: embeddingModel,
    });
  }
  return rows;
}

async function getStorageSummary(pool, scope, budgetGb) {
  const [dbSize, tableSizes, scopedRowStats] = await Promise.all([
    pool.query("SELECT pg_database_size(current_database())::bigint AS bytes"),
    pool.query(
      `
        SELECT
          relname,
          pg_total_relation_size(c.oid)::bigint AS bytes
        FROM pg_class AS c
        JOIN pg_namespace AS n ON n.oid = c.relnamespace
        WHERE relname = ANY($1::text[])
          AND n.nspname = 'public'
          AND c.relkind IN ('r', 'p')
      `,
      [["cw_contacts", "cw_conversations", "cw_messages", "rag_chunks"]]
    ),
    pool.query(
      `
        SELECT (
          COALESCE((SELECT sum(pg_column_size(c.*)) FROM cw_contacts AS c WHERE c.project_id = $1), 0)
          + COALESCE((SELECT sum(pg_column_size(cn.*)) FROM cw_conversations AS cn WHERE cn.project_id = $1), 0)
          + COALESCE((SELECT sum(pg_column_size(m.*)) FROM cw_messages AS m WHERE m.project_id = $1), 0)
          + COALESCE((SELECT sum(pg_column_size(r.*)) FROM rag_chunks AS r WHERE r.project_id = $1), 0)
        )::bigint AS bytes
      `,
      [scope.projectId]
    ),
  ]);

  const perTable = {};
  for (const row of tableSizes.rows) {
    perTable[row.relname] = Number(row.bytes || 0);
  }

  const dbBytes = Number(dbSize.rows?.[0]?.bytes || 0);
  const scopedLogicalBytes = Number(scopedRowStats.rows?.[0]?.bytes || 0);
  const budgetBytes = Math.max(1, budgetGb) * 1024 * 1024 * 1024;
  const usagePercent = Number(((dbBytes / budgetBytes) * 100).toFixed(2));

  return {
    database_bytes: dbBytes,
    scoped_logical_bytes: scopedLogicalBytes,
    budget_bytes: budgetBytes,
    usage_percent: usagePercent,
    tables: perTable,
  };
}

export async function runChatwootSync(pool, scope, logger = console) {
  const baseUrl = requiredEnv("CHATWOOT_BASE_URL").replace(/\/+$/, "");
  const apiToken = requiredEnv("CHATWOOT_API_TOKEN");
  const accountId = await resolveProjectSourceBinding(
    pool,
    scope,
    "chatwoot_account",
    process.env.CHATWOOT_ACCOUNT_ID || "",
    { source: "env_bootstrap" }
  );
  const source = `chatwoot:${accountId}`;

  const maxConversations = toPositiveInt(process.env.CHATWOOT_CONVERSATIONS_LIMIT, 60, 1, 1000);
  const maxMessagesPerConversation = toPositiveInt(process.env.CHATWOOT_MESSAGES_LIMIT, 300, 1, 3000);
  const lookbackDays = toPositiveInt(process.env.CHATWOOT_LOOKBACK_DAYS, 7, 1, 365);
  const chunkSize = toPositiveInt(process.env.CHUNK_SIZE, 1000, 200, 4000);
  const minChunkChars = toPositiveInt(process.env.MIN_EMBED_CHARS, 30, 1, 2000);
  const embeddingModel = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
  const storageBudgetGb = toPositiveInt(process.env.STORAGE_BUDGET_GB, 20, 1, 5000);
  const storageAlertThresholdPct = Math.max(
    1,
    Math.min(100, Number.parseFloat(process.env.STORAGE_ALERT_THRESHOLD_PCT || "85"))
  );

  const previousWatermark = await getWatermark(pool, scope, source);
  const defaultSince = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
  const since = toIsoTime(previousWatermark?.cursor_ts) || defaultSince;
  const watermarkMessageNumeric = getCursorMessageNumericId(previousWatermark?.cursor_id);

  const conversations = await listConversations(baseUrl, apiToken, accountId, maxConversations, logger);

  let processedConversations = 0;
  let processedMessages = 0;
  let insertedChunks = 0;
  let reembeddedChunks = 0;
  let touchedInboxes = 0;
  let touchedAttachments = 0;
  let newestTs = toIsoTime(previousWatermark?.cursor_ts) || since;
  let newestMsgId = previousWatermark?.cursor_id || null;

  const inboxRows = [];
  const inboxes = await listInboxes(baseUrl, apiToken, accountId, logger);
  for (const inbox of inboxes) {
    const inboxId = toBigIntOrNull(inbox?.id);
    if (!Number.isFinite(inboxId)) continue;
    inboxRows.push({
      id: `cwinbox:${scope.projectId}:${accountId}:${inboxId}`,
      account_id: Number(accountId),
      inbox_id: inboxId,
      name: asTextOrNull(inbox?.name, 300),
      channel_type: asTextOrNull(inbox?.channel_type || inbox?.channel, 100),
      data: inbox,
      updated_at: toIsoTime(inbox?.updated_at || inbox?.created_at),
    });
  }

  // Collect all per-conversation data from API before writing to DB.
  const contactsById = new Map();
  const allConvoRows = [];
  const allMessageRows = [];
  const allChunkRows = [];
  const allAttachmentRows = [];

  for (const conversation of conversations) {
    const conversationId = toBigIntOrNull(conversation?.id);
    if (!Number.isFinite(conversationId)) continue;

    const convoGlobalId = conversationGlobalId(scope.projectId, accountId, conversationId);
    const convoUpdatedAt = toIsoTime(conversation?.last_activity_at || conversation?.updated_at || conversation?.created_at);
    const convoContact = extractConversationContact(conversation, scope.projectId, accountId, convoUpdatedAt);
    if (convoContact) contactsById.set(convoContact.id, convoContact);

    allConvoRows.push({
      id: convoGlobalId,
      account_id: Number(accountId),
      conversation_id: conversationId,
      contact_global_id: convoContact?.id || null,
      inbox_id: toBigIntOrNull(conversation?.inbox_id),
      status: asTextOrNull(conversation?.status, 100),
      assignee_id: toBigIntOrNull(conversation?.assignee_id),
      data: conversation,
      updated_at: convoUpdatedAt,
    });
    processedConversations++;

    const msgPayload = await chatwootGet(
      baseUrl,
      apiToken,
      `/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
      logger
    );
    const messages = readMessages(msgPayload).slice(-maxMessagesPerConversation);

    for (const message of messages) {
      const messageId = toBigIntOrNull(message?.id);
      if (!Number.isFinite(messageId)) continue;

      const createdAt = toIsoTime(message?.created_at || message?.updated_at);
      if (shouldSkipMessage(createdAt, since, messageId, watermarkMessageNumeric)) continue;

      const updatedAt = toIsoTime(message?.updated_at || message?.created_at) || createdAt;
      const msgGlobalId = messageGlobalId(scope.projectId, accountId, messageId);
      const content = String(message?.content || "");
      const messageContact = extractMessageContact(message, scope.projectId, accountId, updatedAt);
      if (messageContact) contactsById.set(messageContact.id, messageContact);

      const convIdRaw = toBigIntOrNull(message?.conversation_id) ?? conversationId;

      allMessageRows.push({
        id: msgGlobalId,
        account_id: Number(accountId),
        message_id: messageId,
        conversation_id: convIdRaw,
        conversation_global_id: convoGlobalId,
        contact_global_id: messageContact?.id || convoContact?.id || null,
        sender_type: asTextOrNull(message?.sender_type || message?.sender?.type, 100),
        sender_id: toBigIntOrNull(message?.sender_id || message?.sender?.id),
        private: Boolean(message?.private),
        message_type: asTextOrNull(message?.message_type, 100),
        content,
        data: message,
        created_at: createdAt,
        updated_at: updatedAt,
      });
      processedMessages++;

      if (!message?.private) {
        allChunkRows.push(
          ...buildChunkRows({
            conversationGlobalId: convoGlobalId,
            messageGlobalId: msgGlobalId,
            content,
            chunkSize,
            embeddingModel,
            minChunkChars,
          })
        );
      }

      const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
      for (let idx = 0; idx < attachments.length; idx++) {
        const attachment = attachments[idx];
        const attachmentId = asTextOrNull(attachment?.id || attachment?.file_id || `${messageId}:${idx}`, 200);
        if (!attachmentId) continue;
        allAttachmentRows.push({
          id: `cwa:${scope.projectId}:${accountId}:${attachmentId}`,
          account_id: Number(accountId),
          message_global_id: msgGlobalId,
          conversation_global_id: convoGlobalId,
          content_type: asTextOrNull(attachment?.file_type || attachment?.content_type || attachment?.type, 120),
          file_size: toBigIntOrNull(attachment?.file_size || attachment?.size),
          file_url: asTextOrNull(
            attachment?.data_url || attachment?.file_url || attachment?.url || attachment?.download_url,
            2000
          ),
          thumb_url: asTextOrNull(attachment?.thumb_url || attachment?.thumbnail || attachment?.thumb, 2000),
          payload: attachment,
          updated_at: toIsoTime(attachment?.updated_at || attachment?.created_at || updatedAt),
        });
      }

      if (!newestTs || (createdAt && createdAt > newestTs)) {
        newestTs = createdAt;
        newestMsgId = msgGlobalId;
      }
    }
  }

  // Wrap all DB writes + watermark in a single transaction so the
  // watermark only advances when every upsert has been committed.
  const client = await pool.connect();
  let touchedContacts = 0;
  try {
    await client.query("BEGIN");

    if (inboxRows.length) {
      touchedInboxes = await upsertInboxesBatch(client, scope, inboxRows);
    }

    for (const convoRow of allConvoRows) {
      await upsertConversation(client, scope, convoRow);
    }

    if (allMessageRows.length) {
      await upsertMessagesBatch(client, scope, allMessageRows);
    }

    if (allAttachmentRows.length) {
      touchedAttachments = await upsertAttachmentsBatch(client, scope, allAttachmentRows);
    }

    if (allChunkRows.length) {
      const chunkResult = await insertChunkRows(client, scope, allChunkRows);
      insertedChunks += chunkResult.inserted;
      reembeddedChunks += chunkResult.reset_pending;
    }

    if (contactsById.size) {
      const allContacts = [...contactsById.values()];
      const batchSize = 200;
      for (let i = 0; i < allContacts.length; i += batchSize) {
        const chunk = allContacts.slice(i, i + batchSize);
        touchedContacts += await upsertContactsBatch(client, scope, chunk);
      }
    }

    await upsertWatermark(client, scope, source, newestTs, newestMsgId, {
      project_id: scope.projectId,
      account_scope_id: scope.accountScopeId,
      processed_conversations: processedConversations,
      processed_messages: processedMessages,
      inserted_chunks: insertedChunks,
      reembedded_chunks: reembeddedChunks,
      touched_contacts: touchedContacts,
      touched_inboxes: touchedInboxes,
      touched_attachments: touchedAttachments,
      since,
      synced_at: new Date().toISOString(),
    });

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const storage = await getStorageSummary(pool, scope, storageBudgetGb);
  if (storage.usage_percent >= storageAlertThresholdPct) {
    logger.warn(
      {
        usage_percent: storage.usage_percent,
        budget_gb: storageBudgetGb,
        database_bytes: storage.database_bytes,
      },
      "database usage is near configured storage budget"
    );
  }

  return {
    source,
    since,
    project_id: scope.projectId,
    account_scope_id: scope.accountScopeId,
    processed_conversations: processedConversations,
    processed_messages: processedMessages,
    inserted_chunks: insertedChunks,
    reembedded_chunks: reembeddedChunks,
    touched_contacts: touchedContacts,
    touched_inboxes: touchedInboxes,
    touched_attachments: touchedAttachments,
    cursor_ts: newestTs,
    cursor_id: newestMsgId,
    storage,
  };
}
