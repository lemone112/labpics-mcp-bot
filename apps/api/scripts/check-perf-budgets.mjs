import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { Redis } from "ioredis";

import { applyMigrations } from "../db/migrate-lib.js";

const { Pool } = pg;

const integrationEnabled = process.env.PERF_BUDGETS_INTEGRATION === "1";
if (!integrationEnabled) {
  console.log("Perf budget checks are disabled (set PERF_BUDGETS_INTEGRATION=1).");
  process.exit(0);
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function percentile(samples, p) {
  if (!samples.length) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
  return Number(sorted[idx].toFixed(3));
}

function summarizeSamples(samples) {
  const total = samples.reduce((sum, x) => sum + x, 0);
  return {
    count: samples.length,
    avg_ms: Number((total / Math.max(1, samples.length)).toFixed(3)),
    p50_ms: percentile(samples, 50),
    p95_ms: percentile(samples, 95),
    p99_ms: percentile(samples, 99),
    min_ms: Number(Math.min(...samples).toFixed(3)),
    max_ms: Number(Math.max(...samples).toFixed(3)),
  };
}

function nowMs() {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

async function measureIterations(iterations, fn) {
  const latencies = [];
  for (let i = 0; i < iterations; i += 1) {
    const started = nowMs();
    await fn(i);
    latencies.push(nowMs() - started);
  }
  return summarizeSamples(latencies);
}

async function waitForPostgres(pool, attempts = 30) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch {
      await sleep(400);
    }
  }
  throw new Error("Postgres did not become ready in time");
}

async function waitForRedis(url, attempts = 30) {
  for (let i = 0; i < attempts; i += 1) {
    const client = new Redis(url, { lazyConnect: false });
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

async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function parseExplainSummary(rawPlan) {
  const top = Array.isArray(rawPlan) ? rawPlan[0] : rawPlan;
  const plan = top?.Plan || {};
  return {
    node_type: plan["Node Type"] || "unknown",
    relation_name: plan["Relation Name"] || null,
    startup_cost: plan["Startup Cost"] ?? null,
    total_cost: plan["Total Cost"] ?? null,
    plan_rows: plan["Plan Rows"] ?? null,
    actual_total_time: plan["Actual Total Time"] ?? null,
    shared_hit_blocks: plan["Shared Hit Blocks"] ?? null,
    shared_read_blocks: plan["Shared Read Blocks"] ?? null,
    planning_time_ms: top?.["Planning Time"] ?? null,
    execution_time_ms: top?.["Execution Time"] ?? null,
  };
}

function regressionPctHigherIsWorse(currentValue, baselineValue) {
  if (!Number.isFinite(currentValue) || !Number.isFinite(baselineValue) || baselineValue <= 0) return null;
  return Number((((currentValue - baselineValue) / baselineValue) * 100).toFixed(2));
}

function regressionPctLowerIsWorse(currentValue, baselineValue) {
  if (!Number.isFinite(currentValue) || !Number.isFinite(baselineValue) || baselineValue <= 0) return null;
  return Number((((baselineValue - currentValue) / baselineValue) * 100).toFixed(2));
}

async function seedPerfData(pool, runTag) {
  const { rows: defaultRows } = await pool.query(
    "SELECT id::text AS id FROM account_scopes WHERE scope_key = 'default' LIMIT 1"
  );
  let scopeA = defaultRows[0]?.id || null;
  if (!scopeA) {
    const { rows } = await pool.query(
      `
        INSERT INTO account_scopes(scope_key, name)
        VALUES ('default', 'Default Scope')
        RETURNING id::text AS id
      `
    );
    scopeA = rows[0]?.id || null;
  }
  if (!scopeA) throw new Error("Failed to create default scope");

  const { rows: scopeRows } = await pool.query(
    `
      INSERT INTO account_scopes(scope_key, name)
      VALUES ($1, $2)
      RETURNING id::text AS id
    `,
    [`perf-scope-${runTag}`, `Perf Scope ${runTag}`]
  );
  const scopeB = scopeRows[0]?.id;

  const { rows: projectRows } = await pool.query(
    `
      INSERT INTO projects(name, account_scope_id)
      VALUES
        ($1, $2),
        ($3, $4)
      RETURNING id::text AS id, account_scope_id::text AS account_scope_id
    `,
    [`perf-project-a-${runTag}`, scopeA, `perf-project-b-${runTag}`, scopeB]
  );
  const projectA = projectRows.find((row) => row.account_scope_id === scopeA)?.id;
  const projectB = projectRows.find((row) => row.account_scope_id === scopeB)?.id;

  const { rows: userRows } = await pool.query(
    `
      INSERT INTO app_users(username, password_hash, role, email)
      VALUES
        ($1, 'hash', 'pm', $2),
        ($3, 'hash', 'pm', $4),
        ($5, 'hash', 'pm', $6)
      RETURNING id::text AS id, username
    `,
    [
      `perf_user_a_${runTag}`,
      `perf_user_a_${runTag}@example.local`,
      `perf_user_a2_${runTag}`,
      `perf_user_a2_${runTag}@example.local`,
      `perf_user_b_${runTag}`,
      `perf_user_b_${runTag}@example.local`,
    ]
  );
  const userA = userRows.find((row) => row.username.startsWith("perf_user_a_"))?.id;
  const userA2 = userRows.find((row) => row.username.startsWith("perf_user_a2_"))?.id;
  const userB = userRows.find((row) => row.username.startsWith("perf_user_b_"))?.id;

  const { rows: employeeRows } = await pool.query(
    `
      INSERT INTO employees(account_scope_id, user_id, display_name, status, timezone)
      VALUES
        ($1, $2, 'Perf Employee A', 'active', 'UTC'),
        ($1, $3, 'Perf Employee A2', 'active', 'UTC'),
        ($4, $5, 'Perf Employee B', 'active', 'UTC')
      RETURNING id::text AS id, account_scope_id::text AS account_scope_id, display_name
    `,
    [scopeA, userA, userA2, scopeB, userB]
  );
  const employeeA = employeeRows.find((row) => row.display_name === "Perf Employee A")?.id;
  const employeeA2 = employeeRows.find((row) => row.display_name === "Perf Employee A2")?.id;
  const employeeB = employeeRows.find((row) => row.account_scope_id === scopeB)?.id;

  const { rows: accountRows } = await pool.query(
    `
      INSERT INTO crm_accounts(project_id, account_scope_id, name, stage, owner_username)
      VALUES
        ($1, $2, $3, 'active', $4),
        ($5, $6, $7, 'active', $8)
      RETURNING id::text AS id, project_id::text AS project_id
    `,
    [
      projectA,
      scopeA,
      `Perf Account A ${runTag}`,
      `perf_user_a_${runTag}`,
      projectB,
      scopeB,
      `Perf Account B ${runTag}`,
      `perf_user_b_${runTag}`,
    ]
  );
  const accountA = accountRows.find((row) => row.project_id === projectA)?.id;

  const { rows: opportunityRows } = await pool.query(
    `
      INSERT INTO crm_opportunities(
        project_id, account_scope_id, account_id, title, stage, amount_estimate, probability, next_step, owner_username
      )
      VALUES ($1, $2, $3, $4, 'qualified', 7000, 0.55, 'prepare timeline', $5)
      RETURNING id::text AS id
    `,
    [projectA, scopeA, accountA, `Perf Opp A ${runTag}`, `perf_user_a_${runTag}`]
  );
  const opportunityA = opportunityRows[0]?.id;

  const { rows: linkRows } = await pool.query(
    `
      INSERT INTO client_executor_links(
        project_id, account_scope_id, client_type, client_id,
        employee_id, link_type, allocation_pct, priority, status
      )
      VALUES
        ($1, $2, 'crm_opportunity', $3, $4, 'owner', 60, 1, 'active'),
        ($1, $2, 'crm_opportunity', $3, $5, 'reviewer', 40, 2, 'active')
      RETURNING id::text AS id, link_type
    `,
    [projectA, scopeA, opportunityA, employeeA, employeeA2]
  );
  const ownerLink = linkRows.find((row) => row.link_type === "owner")?.id;
  const reviewerLink = linkRows.find((row) => row.link_type === "reviewer")?.id;

  await pool.query(
    `
      INSERT INTO client_executor_dependencies(
        project_id, account_scope_id, parent_link_id, child_link_id, dependency_kind
      )
      VALUES ($1, $2, $3, $4, 'requires')
    `,
    [projectA, scopeA, ownerLink, reviewerLink]
  );

  await pool.query(
    `
      INSERT INTO employee_conditions(
        employee_id, project_id, account_scope_id, condition_type, payload, effective_from, effective_to
      )
      VALUES
        ($1, $2, $3, 'workload', '{"hours": 8}'::jsonb, now() - interval '60 days', now() - interval '30 days'),
        ($1, $2, $3, 'workload', '{"hours": 6}'::jsonb, now() - interval '30 days', now() + interval '30 days')
    `,
    [employeeA, projectA, scopeA]
  );

  await pool.query(
    `
      INSERT INTO employee_capacity_calendar(
        employee_id, project_id, account_scope_id, day, capacity_hours
      )
      SELECT $1, $2, $3, (current_date - gs)::date, 6.0
      FROM generate_series(0, 90) AS gs
      ON CONFLICT (employee_id, project_id, day) DO NOTHING
    `,
    [employeeA, projectA, scopeA]
  );

  await pool.query(
    `
      INSERT INTO search_analytics(
        query, result_count, filters, project_id, account_scope_id, event_type, duration_ms, created_at
      )
      SELECT
        concat('perf seed query ', gs)::text,
        (gs % 12) + 1,
        jsonb_build_object('source', 'perf-seed', 'rank', gs),
        $1,
        $2,
        CASE WHEN gs % 3 = 0 THEN 'search' WHEN gs % 3 = 1 THEN 'click' ELSE 'open' END,
        (30 + (gs % 70)),
        now() - make_interval(days => gs % 45)
      FROM generate_series(1, 400) AS gs
    `,
    [projectA, scopeA]
  );

  return {
    scopeA,
    scopeB,
    projectA,
    projectB,
    employeeA,
    employeeB,
    accountA,
    opportunityA,
    ownerLink,
    reviewerLink,
  };
}

async function runQueryBenchmarks(pool, fixture, sampleSize) {
  const queryClasses = [
    {
      key: "workforce_employee_lookup",
      sql: `
        SELECT id, display_name, status
        FROM employees
        WHERE account_scope_id = $1
          AND status = 'active'
        ORDER BY updated_at DESC
        LIMIT 50
      `,
      params: [fixture.scopeA],
    },
    {
      key: "workforce_conditions_timeline",
      sql: `
        SELECT employee_id, project_id, condition_type, payload, effective_from, effective_to
        FROM employee_conditions
        WHERE employee_id = $1
        ORDER BY effective_from DESC
        LIMIT 100
      `,
      params: [fixture.employeeA],
    },
    {
      key: "graph_links_active_by_project",
      sql: `
        SELECT client_type, client_id, link_type, allocation_pct, priority
        FROM client_executor_links
        WHERE project_id = $1
          AND account_scope_id = $2
          AND status = 'active'
        ORDER BY priority ASC, effective_from DESC
        LIMIT 200
      `,
      params: [fixture.projectA, fixture.scopeA],
    },
    {
      key: "graph_dependency_traversal",
      sql: `
        WITH RECURSIVE walk(node, depth) AS (
          SELECT $1::uuid, 0
          UNION ALL
          SELECT d.child_link_id, w.depth + 1
          FROM client_executor_dependencies d
          JOIN walk w ON d.parent_link_id = w.node
          WHERE w.depth < 8
        )
        SELECT count(*)::int AS node_count
        FROM walk
      `,
      params: [fixture.ownerLink],
    },
    {
      key: "search_analytics_scope_rollup",
      sql: `
        SELECT event_type, count(*)::int AS total
        FROM search_analytics
        WHERE account_scope_id = $1
          AND created_at >= now() - interval '45 days'
        GROUP BY event_type
        ORDER BY total DESC
      `,
      params: [fixture.scopeA],
    },
  ];

  const results = [];
  for (const queryClass of queryClasses) {
    const metric = await measureIterations(sampleSize, () => pool.query(queryClass.sql, queryClass.params));
    const explain = await pool.query(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${queryClass.sql}`,
      queryClass.params
    );
    const explainRaw = explain.rows[0]?.["QUERY PLAN"] || null;
    results.push({
      key: queryClass.key,
      ...metric,
      explain_summary: parseExplainSummary(explainRaw),
    });
  }
  return results;
}

async function runWriteIngestBenchmark(pool, fixture, iterations) {
  return measureIterations(iterations, (idx) =>
    pool.query(
      `
        INSERT INTO search_analytics(
          query, result_count, filters, project_id, account_scope_id, event_type, duration_ms, created_at
        )
        VALUES ($1, $2, $3::jsonb, $4, $5, 'search', $6, now())
      `,
      [
        `perf-write-${idx}`,
        (idx % 20) + 1,
        JSON.stringify({ source: "perf-write", run: idx }),
        fixture.projectA,
        fixture.scopeA,
        40 + (idx % 60),
      ]
    )
  );
}

async function runRedisPubSubBenchmark(redisUrl, messageCount) {
  const publisher = new Redis(redisUrl, { lazyConnect: false });
  const subscriber = new Redis(redisUrl, { lazyConnect: false });
  const runs = [];
  try {
    for (let run = 0; run < 3; run += 1) {
      const channel = `perf:pubsub:${Date.now()}:${run}`;
      let received = 0;
      const receivePromise = new Promise((resolve) => {
        subscriber.removeAllListeners("message");
        subscriber.on("message", (incomingChannel) => {
          if (incomingChannel !== channel) return;
          received += 1;
          if (received >= messageCount) resolve();
        });
      });
      let timeoutId = null;
      const receiveTimeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Timed out waiting for Redis pub/sub messages")), 10_000);
      });

      await subscriber.subscribe(channel);
      const started = nowMs();
      const pipeline = publisher.pipeline();
      for (let i = 0; i < messageCount; i += 1) {
        pipeline.publish(channel, JSON.stringify({ i, run }));
      }
      await pipeline.exec();
      try {
        await Promise.race([receivePromise, receiveTimeoutPromise]);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
      const elapsedMs = nowMs() - started;
      const throughput = Number((messageCount / (elapsedMs / 1000)).toFixed(2));
      runs.push({ elapsed_ms: Number(elapsedMs.toFixed(3)), throughput_ops_sec: throughput });
      await subscriber.unsubscribe(channel);
    }
  } finally {
    try {
      await publisher.quit();
    } catch {
      publisher.disconnect();
    }
    try {
      await subscriber.quit();
    } catch {
      subscriber.disconnect();
    }
  }
  const throughputSamples = runs.map((r) => r.throughput_ops_sec);
  return {
    message_count: messageCount,
    runs,
    throughput_avg_ops_sec: Number(
      (throughputSamples.reduce((sum, x) => sum + x, 0) / Math.max(1, throughputSamples.length)).toFixed(2)
    ),
    throughput_min_ops_sec: Number(Math.min(...throughputSamples).toFixed(2)),
  };
}

async function runCacheInvalidationBenchmark(redisUrl) {
  const client = new Redis(redisUrl, { lazyConnect: false });
  const latencies = [];
  let totalDeleted = 0;
  try {
    for (let run = 0; run < 6; run += 1) {
      const prefix = `perf:cache:${Date.now()}:${run}:`;
      const pipeline = client.pipeline();
      for (let i = 0; i < 350; i += 1) {
        pipeline.set(`${prefix}${i}`, JSON.stringify({ i, run }), "EX", 120);
      }
      await pipeline.exec();

      const started = nowMs();
      let cursor = "0";
      let deleted = 0;
      do {
        const [nextCursor, keys] = await client.scan(cursor, "MATCH", `${prefix}*`, "COUNT", "200");
        cursor = nextCursor;
        if (keys.length) {
          deleted += await client.del(...keys);
        }
      } while (cursor !== "0");
      totalDeleted += deleted;
      latencies.push(nowMs() - started);
    }
  } finally {
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
  }
  return {
    deleted_keys: totalDeleted,
    ...summarizeSamples(latencies),
  };
}

async function main() {
  const databaseUrl = requiredEnv("DATABASE_URL");
  const redisUrl = requiredEnv("REDIS_URL");
  const sampleSize = parseInt(process.env.PERF_SAMPLE_SIZE || "", 10) || 30;
  const writeIterations = parseInt(process.env.PERF_WRITE_ITERATIONS || "", 10) || 90;
  const pubsubMessageCount = parseInt(process.env.PERF_PUBSUB_MESSAGES || "", 10) || 400;
  const failOnRegression = process.env.PERF_FAIL_ON_REGRESSION === "1";
  const baselineWriteMode = process.env.PERF_WRITE_BASELINE === "1";
  const resultsPath = path.resolve(process.cwd(), process.env.PERF_RESULTS_PATH || "test-results/perf-report.json");
  const configPath = path.resolve(process.cwd(), process.env.PERF_BUDGETS_CONFIG || "perf/perf-budgets.json");

  const configFile = (await readJsonIfExists(configPath)) || {};
  const regressionThresholdPct = Number(
    configFile.regression_threshold_pct ?? parseFloat(process.env.PERF_REGRESSION_THRESHOLD_PCT || "40")
  );
  const budgets = configFile.budgets || {};
  const baselines = configFile.baselines || {};

  const pool = new Pool({ connectionString: databaseUrl, max: 20 });
  try {
    await waitForPostgres(pool);
    await waitForRedis(redisUrl);

    const currentFile = fileURLToPath(import.meta.url);
    const migrationsDir = path.resolve(path.dirname(currentFile), "../db/migrations");

    await resetSchema(pool);
    await applyMigrations(pool, migrationsDir, console);

    const runTag = `${Date.now()}`;
    const fixture = await seedPerfData(pool, runTag);

    const queryResults = await runQueryBenchmarks(pool, fixture, sampleSize);
    const writeIngest = await runWriteIngestBenchmark(pool, fixture, writeIterations);
    const redisPubSub = await runRedisPubSubBenchmark(redisUrl, pubsubMessageCount);
    const cacheInvalidation = await runCacheInvalidationBenchmark(redisUrl);

    const failures = [];
    const warnings = [];

    const queryComparisons = queryResults.map((queryResult) => {
      const budgetMs = Number(budgets?.queries?.[queryResult.key]);
      if (Number.isFinite(budgetMs) && queryResult.p95_ms > budgetMs) {
        failures.push(
          `[budget] query ${queryResult.key} p95 ${queryResult.p95_ms}ms exceeds budget ${budgetMs}ms`
        );
      }

      const baselineMs = Number(baselines?.queries?.[queryResult.key]);
      const regressionPct = regressionPctHigherIsWorse(queryResult.p95_ms, baselineMs);
      if (regressionPct !== null && regressionPct > regressionThresholdPct) {
        const msg = `[regression] query ${queryResult.key} degraded by ${regressionPct}% (baseline=${baselineMs}ms, current=${queryResult.p95_ms}ms)`;
        if (failOnRegression) failures.push(msg);
        else warnings.push(msg);
      }
      return {
        key: queryResult.key,
        baseline_p95_ms: Number.isFinite(baselineMs) ? baselineMs : null,
        current_p95_ms: queryResult.p95_ms,
        regression_pct: regressionPct,
        explain_summary: queryResult.explain_summary,
      };
    });

    const writeBudgetMs = Number(budgets?.write_ingest_p95_ms);
    if (Number.isFinite(writeBudgetMs) && writeIngest.p95_ms > writeBudgetMs) {
      failures.push(
        `[budget] write ingest p95 ${writeIngest.p95_ms}ms exceeds budget ${writeBudgetMs}ms`
      );
    }

    const baselineWriteMs = Number(baselines?.write_ingest_p95_ms);
    const writeRegression = regressionPctHigherIsWorse(writeIngest.p95_ms, baselineWriteMs);
    if (writeRegression !== null && writeRegression > regressionThresholdPct) {
      const msg = `[regression] write ingest degraded by ${writeRegression}% (baseline=${baselineWriteMs}ms, current=${writeIngest.p95_ms}ms)`;
      if (failOnRegression) failures.push(msg);
      else warnings.push(msg);
    }

    const minPubSubBudget = Number(budgets?.redis_pubsub_min_ops_sec);
    if (Number.isFinite(minPubSubBudget) && redisPubSub.throughput_min_ops_sec < minPubSubBudget) {
      failures.push(
        `[budget] redis pub/sub throughput ${redisPubSub.throughput_min_ops_sec} ops/s below budget ${minPubSubBudget} ops/s`
      );
    }

    const baselinePubSub = Number(baselines?.redis_pubsub_ops_sec);
    const pubsubRegression = regressionPctLowerIsWorse(redisPubSub.throughput_avg_ops_sec, baselinePubSub);
    if (pubsubRegression !== null && pubsubRegression > regressionThresholdPct) {
      const msg = `[regression] redis pub/sub throughput degraded by ${pubsubRegression}% (baseline=${baselinePubSub} ops/s, current=${redisPubSub.throughput_avg_ops_sec} ops/s)`;
      if (failOnRegression) failures.push(msg);
      else warnings.push(msg);
    }

    const cacheBudgetMs = Number(budgets?.cache_invalidation_p95_ms);
    if (Number.isFinite(cacheBudgetMs) && cacheInvalidation.p95_ms > cacheBudgetMs) {
      failures.push(
        `[budget] cache invalidation p95 ${cacheInvalidation.p95_ms}ms exceeds budget ${cacheBudgetMs}ms`
      );
    }

    const baselineCacheMs = Number(baselines?.cache_invalidation_p95_ms);
    const cacheRegression = regressionPctHigherIsWorse(cacheInvalidation.p95_ms, baselineCacheMs);
    if (cacheRegression !== null && cacheRegression > regressionThresholdPct) {
      const msg = `[regression] cache invalidation degraded by ${cacheRegression}% (baseline=${baselineCacheMs}ms, current=${cacheInvalidation.p95_ms}ms)`;
      if (failOnRegression) failures.push(msg);
      else warnings.push(msg);
    }

    const topDegradedQueries = queryComparisons
      .filter((entry) => Number.isFinite(entry.regression_pct))
      .sort((a, b) => (b.regression_pct || 0) - (a.regression_pct || 0))
      .slice(0, 5);

    const report = {
      generated_at: new Date().toISOString(),
      config_path: configPath,
      regression_threshold_pct: regressionThresholdPct,
      sample_size: sampleSize,
      write_iterations: writeIterations,
      pubsub_message_count: pubsubMessageCount,
      metrics: {
        write_ingest,
        redis_pubsub: redisPubSub,
        cache_invalidation: cacheInvalidation,
        queries: queryResults,
      },
      top_degraded_queries: topDegradedQueries,
      failures,
      warnings,
      status: failures.length > 0 ? "failed" : "passed",
    };

    if (baselineWriteMode) {
      const nextConfig = {
        ...configFile,
        regression_threshold_pct: regressionThresholdPct,
        baselines: {
          ...(configFile.baselines || {}),
          write_ingest_p95_ms: writeIngest.p95_ms,
          redis_pubsub_ops_sec: redisPubSub.throughput_avg_ops_sec,
          cache_invalidation_p95_ms: cacheInvalidation.p95_ms,
          queries: Object.fromEntries(queryResults.map((q) => [q.key, q.p95_ms])),
        },
      };
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");
      console.log(`Updated baselines in ${configPath}`);
    }

    await fs.mkdir(path.dirname(resultsPath), { recursive: true });
    await fs.writeFile(resultsPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    console.log(`Perf report written to ${resultsPath}`);
    console.log(`Top degraded query classes (max 5): ${topDegradedQueries.length}`);
    for (const row of topDegradedQueries) {
      console.log(
        `  - ${row.key}: baseline=${row.baseline_p95_ms}ms current=${row.current_p95_ms}ms regression=${row.regression_pct}%`
      );
    }

    if (warnings.length > 0) {
      console.warn("Perf warnings:");
      for (const warning of warnings) console.warn(`  - ${warning}`);
    }

    if (failures.length > 0) {
      console.error("Perf failures:");
      for (const failure of failures) console.error(`  - ${failure}`);
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Perf budget check failed:", error);
  process.exit(1);
});
