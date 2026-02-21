import test, { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { applyMigrations } from "../db/migrate-lib.js";
import { runEmbeddings, searchChunks } from "../src/domains/rag/embeddings.js";
import { getLightRagStatus, queryLightRag, submitLightRagFeedback } from "../src/domains/rag/lightrag.js";
import { getSearchAnalyticsSummary, trackSearchEvent } from "../src/domains/rag/search-analytics.js";
import { createCacheLayer } from "../src/infra/cache.js";
import { createRedisClient } from "../src/infra/redis.js";
import { createRedisPubSub } from "../src/infra/redis-pubsub.js";

const { Pool } = pg;

const integrationEnabled = process.env.LIGHTRAG_INTEGRATION === "1";
const EMBEDDING_DIM = 1536;

if (!integrationEnabled) {
  test("lightrag db+redis integration tests are disabled", { skip: "set LIGHTRAG_INTEGRATION=1" }, () => {});
} else {
  const silentLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
  };

  function requiredEnv(name) {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required env var: ${name}`);
    return value;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitForPostgres(pool, attempts = 30) {
    for (let i = 0; i < attempts; i += 1) {
      try {
        await pool.query("SELECT 1");
        return;
      } catch {
        await sleep(500);
      }
    }
    throw new Error("Postgres did not become ready in time");
  }

  async function waitForRedis(url, attempts = 30) {
    for (let i = 0; i < attempts; i += 1) {
      const client = createRedisClient({ url, logger: silentLogger, name: `redis-it-wait-${i}` });
      if (!client) throw new Error("Redis client was not created");
      try {
        await client.ping();
        await client.quit();
        return;
      } catch {
        client.disconnect();
        await sleep(300);
      }
    }
    throw new Error("Redis did not become ready in time");
  }

  async function resetSchema(pool) {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await pool.query("GRANT ALL ON SCHEMA public TO CURRENT_USER");
    await pool.query("GRANT ALL ON SCHEMA public TO public");
  }

  function bucketForText(text) {
    const source = String(text || "").toLowerCase();
    if (source.includes("deal") || source.includes("contract") || source.includes("opportunity")) return 0;
    if (source.includes("bug") || source.includes("issue")) return 1;
    return 2;
  }

  function buildEmbeddingVector(bucket) {
    const vec = Array(EMBEDDING_DIM).fill(0);
    vec[bucket] = 1;
    return vec;
  }

  function embeddingForText(text) {
    return buildEmbeddingVector(bucketForText(text));
  }

  async function startOpenAiMockServer() {
    const server = http.createServer(async (req, res) => {
      if (req.method !== "POST" || req.url !== "/embeddings") {
        res.statusCode = 404;
        res.end("not found");
        return;
      }

      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString("utf8");

      let payload = {};
      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch {
        res.statusCode = 400;
        res.end("invalid json");
        return;
      }

      const inputs = Array.isArray(payload.input) ? payload.input : [payload.input];
      const data = inputs.map((input, index) => ({
        object: "embedding",
        index,
        embedding: embeddingForText(input),
      }));
      const body = JSON.stringify({
        object: "list",
        data,
        model: payload.model || "integration-test-embedding-model",
        usage: {
          total_tokens: inputs.length * 12,
        },
      });
      res.setHeader("content-type", "application/json");
      res.statusCode = 200;
      res.end(body);
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to start OpenAI mock server");
    }
    return {
      server,
      baseUrl: `http://127.0.0.1:${address.port}`,
    };
  }

  async function closeServer(server) {
    if (!server) return;
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  async function seedFixtures(pool, scope) {
    await pool.query(
      `
        INSERT INTO cw_messages(
          id, account_id, message_id, conversation_id, content, data,
          created_at, updated_at, project_id, account_scope_id,
          conversation_global_id, contact_global_id, sender_type, sender_id, private, message_type
        )
        VALUES
          ($1, 1, 101, 1001, $2, '{}'::jsonb, now(), now(), $3, $4, $5, 'contact-1', 'user', 11, false, 'incoming'),
          ($6, 1, 102, 1002, $7, '{}'::jsonb, now(), now(), $3, $4, $8, 'contact-2', 'agent', 12, false, 'outgoing')
      `,
      [
        "cw-msg-deal",
        "deal thread: contract is waiting for signature",
        scope.projectId,
        scope.accountScopeId,
        "cw-conv-deal",
        "cw-msg-bug",
        "bug report from onboarding flow",
        "cw-conv-bug",
      ]
    );

    await pool.query(
      `
        INSERT INTO linear_issues_raw(
          id, project_id, account_scope_id, workspace_id, external_id, linear_project_external_id,
          title, state, priority, assignee_name, due_date, data, updated_at, created_at
        )
        VALUES
          ($1, $2, $3, 'ws-linear', 'lin-1', 'lin-project-1', 'Deal blocker for handoff', 'todo', 2, 'PM', '2026-02-20', $4::jsonb, now(), now())
      `,
      [
        "lin-issue-1",
        scope.projectId,
        scope.accountScopeId,
        JSON.stringify({ next_step: "prepare deal handoff checklist" }),
      ]
    );

    await pool.query(
      `
        INSERT INTO attio_opportunities_raw(
          id, project_id, account_scope_id, workspace_id, external_id, account_external_id,
          title, stage, amount, probability, expected_close_date, next_step, data, updated_at, created_at
        )
        VALUES
          ($1, $2, $3, 'ws-attio', 'att-1', 'acc-1', 'Deal expansion Q2', 'negotiation', 5000, 0.6, '2026-03-10', 'send updated proposal', '{}'::jsonb, now(), now())
      `,
      ["att-opp-1", scope.projectId, scope.accountScopeId]
    );

    await pool.query(
      `
        INSERT INTO rag_chunks(
          conversation_global_id, message_global_id, chunk_index, text,
          project_id, account_scope_id, embedding_status, created_at, updated_at
        )
        VALUES
          ('cw-conv-deal', 'cw-msg-deal', 0, 'deal contract renewal and negotiation context', $1, $2, 'pending', now(), now()),
          ('cw-conv-bug', 'cw-msg-bug', 0, 'bug triage with engineering issue details', $1, $2, 'pending', now(), now())
      `,
      [scope.projectId, scope.accountScopeId]
    );
  }

  describe("LightRAG DB + Redis integration", { concurrency: 1 }, () => {
    let pool = null;
    let scope = null;
    let openAiMock = null;
    const envBackup = {};

    before(async () => {
      const databaseUrl = requiredEnv("DATABASE_URL");
      const redisUrl = requiredEnv("REDIS_URL");
      pool = new Pool({ connectionString: databaseUrl });
      await waitForPostgres(pool);
      await waitForRedis(redisUrl);

      await resetSchema(pool);
      const currentFile = fileURLToPath(import.meta.url);
      const migrationsDir = path.resolve(path.dirname(currentFile), "../db/migrations");
      await applyMigrations(pool, migrationsDir, silentLogger);

      const scopeResult = await pool.query(
        "SELECT id::text AS id FROM account_scopes WHERE scope_key = 'default' LIMIT 1"
      );
      const accountScopeId = scopeResult.rows[0]?.id;
      assert.ok(accountScopeId, "default account scope should exist after migrations");

      const projectName = `it-lightrag-${crypto.randomUUID().slice(0, 8)}`;
      const projectResult = await pool.query(
        "INSERT INTO projects(name, account_scope_id) VALUES ($1, $2) RETURNING id::text AS id",
        [projectName, accountScopeId]
      );
      scope = {
        projectId: projectResult.rows[0]?.id,
        accountScopeId,
      };
      assert.ok(scope.projectId, "integration project should be created");

      await seedFixtures(pool, scope);
      openAiMock = await startOpenAiMockServer();

      for (const key of [
        "OPENAI_API_KEY",
        "OPENAI_BASE_URL",
        "EMBEDDING_DIM",
        "OPENAI_EMBED_MAX_INPUTS",
        "OPENAI_TIMEOUT_MS",
        "EMBED_BATCH_SIZE",
        "SEARCH_IVFFLAT_PROBES",
        "SEARCH_HNSW_EF_SEARCH",
      ]) {
        envBackup[key] = process.env[key];
      }

      process.env.OPENAI_API_KEY = "integration-test-key";
      process.env.OPENAI_BASE_URL = openAiMock.baseUrl;
      process.env.EMBEDDING_DIM = String(EMBEDDING_DIM);
      process.env.OPENAI_EMBED_MAX_INPUTS = "16";
      process.env.OPENAI_TIMEOUT_MS = "5000";
      process.env.EMBED_BATCH_SIZE = "10";
      process.env.SEARCH_IVFFLAT_PROBES = "10";
      process.env.SEARCH_HNSW_EF_SEARCH = "40";
    });

    after(async () => {
      for (const [key, value] of Object.entries(envBackup)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
      await closeServer(openAiMock?.server);
      if (pool) await pool.end();
    });

    it("processes pending chunks and returns vector-ranked search results", async () => {
      const embeddingResult = await runEmbeddings(pool, scope, silentLogger);
      assert.equal(embeddingResult.status, "ok");
      assert.equal(embeddingResult.processed, 2);

      const statusRows = await pool.query(
        `
          SELECT embedding_status, count(*)::int AS count
          FROM rag_chunks
          WHERE project_id = $1 AND account_scope_id = $2
          GROUP BY embedding_status
        `,
        [scope.projectId, scope.accountScopeId]
      );
      const readyCount = statusRows.rows.find((row) => row.embedding_status === "ready")?.count || 0;
      assert.equal(readyCount, 2);

      const searchResult = await searchChunks(pool, scope, "deal contract", 2, silentLogger);
      assert.equal(searchResult.results.length, 2);
      assert.equal(searchResult.results[0].text.includes("deal"), true);
      assert.ok(searchResult.embedding_model, "embedding model should be returned");
    });

    it("executes full lightrag query, persists query run, and stores feedback", async () => {
      // Safe re-run: if embeddings are already ready, runEmbeddings returns idle.
      await runEmbeddings(pool, scope, silentLogger);

      const result = await queryLightRag(
        pool,
        scope,
        {
          query: "deal handoff",
          topK: 5,
          sourceLimit: 5,
          createdBy: "integration-user",
        },
        silentLogger
      );

      assert.equal(result.query, "deal handoff");
      assert.ok(result.query_run_id, "query run id should be persisted");
      assert.ok(result.stats.chunks >= 1, "vector chunk hits expected");
      assert.ok(result.stats.messages >= 1, "message hits expected");
      assert.ok(result.stats.issues >= 1, "linear issue hits expected");
      assert.ok(result.stats.opportunities >= 1, "opportunity hits expected");
      assert.ok(result.quality_score > 0, "quality score should be computed");

      const persisted = await pool.query(
        `
          SELECT query_text, chunk_hits, source_hits, quality_score, source_diversity
          FROM lightrag_query_runs
          WHERE id = $1
        `,
        [result.query_run_id]
      );
      assert.equal(persisted.rows.length, 1);
      assert.equal(persisted.rows[0].query_text, "deal handoff");
      assert.equal(persisted.rows[0].chunk_hits, result.stats.chunks);
      assert.equal(
        persisted.rows[0].source_hits,
        result.stats.messages + result.stats.issues + result.stats.opportunities
      );

      const invalidFeedback = await submitLightRagFeedback(pool, scope, {
        queryRunId: result.query_run_id,
        rating: 2,
      });
      assert.equal(invalidFeedback, null);

      const feedback = await submitLightRagFeedback(pool, scope, {
        queryRunId: result.query_run_id,
        rating: 1,
        comment: "Useful answer with evidence",
        createdBy: "integration-user",
      });
      assert.equal(feedback.rating, 1);
      assert.equal(feedback.query_run_id, result.query_run_id);
    });

    it("tracks and aggregates search analytics for the same project scope", async () => {
      const searchEventId = await trackSearchEvent(
        pool,
        scope,
        {
          query: "deal handoff",
          resultCount: 4,
          filters: { sourceFilter: ["messages", "issues"], topK: 5 },
          eventType: "search",
          durationMs: 123,
        },
        silentLogger
      );
      assert.ok(searchEventId, "search event should be stored");

      const clickEventId = await trackSearchEvent(
        pool,
        scope,
        {
          query: "deal handoff",
          resultCount: 4,
          clickedResultId: "cw-msg-deal",
          clickedSourceType: "chatwoot_message",
          eventType: "click",
        },
        silentLogger
      );
      assert.ok(clickEventId, "click event should be stored");

      const summary = await getSearchAnalyticsSummary(pool, scope, { days: 30, topQueriesLimit: 10 });
      assert.ok(summary.overview.total_searches >= 1);
      assert.ok(summary.overview.total_clicks >= 1);
      assert.ok(summary.overview.click_through_rate_pct >= 0);
      assert.ok(summary.overview.click_through_rate_pct <= 100);
      assert.ok(summary.top_queries.some((row) => row.query === "deal handoff"));
    });

    it("validates redis cache + pubsub invalidation flow for lightrag keys", async () => {
      const redisUrl = requiredEnv("REDIS_URL");
      const cache = createCacheLayer({ logger: silentLogger });
      const pubsub = createRedisPubSub({ url: redisUrl, logger: silentLogger });
      assert.equal(cache.enabled, true);
      assert.equal(pubsub.enabled, true);

      const lightragKeyA = `lightrag:${scope.projectId}:a`;
      const lightragKeyB = `lightrag:${scope.projectId}:b`;
      const untouchedKey = `portfolio:${scope.accountScopeId}:keep`;
      let unsubscribe = null;
      try {
        await cache.set(lightragKeyA, { value: 1 }, 60);
        await cache.set(lightragKeyB, { value: 2 }, 60);
        await cache.set(untouchedKey, { keep: true }, 60);

        assert.deepStrictEqual(await cache.get(lightragKeyA), { value: 1 });
        assert.deepStrictEqual(await cache.get(untouchedKey), { keep: true });

        let resolveDeleted;
        let rejectDeleted;
        const deletedPromise = new Promise((resolve, reject) => {
          resolveDeleted = resolve;
          rejectDeleted = reject;
        });
        const timer = setTimeout(() => rejectDeleted(new Error("timed out waiting for pubsub invalidation")), 5000);
        let settled = false;
        unsubscribe = await pubsub.subscribe("job_completed", (payload) => {
          if (!payload || payload.project_id !== scope.projectId) return;
          if (payload.job_type !== "embeddings_run") return;
          if (settled) return;
          settled = true;
          void cache
            .invalidateByPrefix(`lightrag:${scope.projectId}:`)
            .then((deleted) => {
              clearTimeout(timer);
              resolveDeleted(deleted);
            })
            .catch((err) => {
              clearTimeout(timer);
              rejectDeleted(err);
            });
        });

        try {
          await pubsub.publish(
            "job_completed",
            JSON.stringify({
              project_id: scope.projectId,
              account_scope_id: scope.accountScopeId,
              job_type: "embeddings_run",
              status: "ok",
              at: new Date().toISOString(),
            })
          );

          const deletedCount = await deletedPromise;
          assert.ok(deletedCount >= 2, "expected at least two lightrag keys to be invalidated");
          assert.equal(await cache.get(lightragKeyA), null);
          assert.equal(await cache.get(lightragKeyB), null);
          assert.deepStrictEqual(await cache.get(untouchedKey), { keep: true });
        } finally {
          clearTimeout(timer);
        }
      } finally {
        if (typeof unsubscribe === "function") unsubscribe();
        await pubsub.close();
        await cache.close();
      }
    });

    it("reports status for embeddings and source tables within project scope", async () => {
      const status = await getLightRagStatus(pool, scope);
      assert.equal(status.project_id, scope.projectId);
      assert.equal(status.account_scope_id, scope.accountScopeId);
      assert.ok(status.embeddings.ready >= 2);
      assert.equal(status.sources.messages_total, 2);
      assert.equal(status.sources.linear_issues_total, 1);
      assert.equal(status.sources.opportunities_total, 1);
    });
  });
}
