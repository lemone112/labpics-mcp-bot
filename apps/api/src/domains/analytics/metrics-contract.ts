import { ApiError } from "../../infra/api-contract.js";
import { evaluateCriteriaDefinition } from "./criteria-engine.js";
import type { Pool, PoolClient, ProjectScope } from "../../types/index.js";
import type {
  CriteriaEvaluateInput,
  MetricDefinitionUpsertInput,
  MetricsExportInput,
  MetricsIngestInput,
  MetricsQueryInput,
} from "../../infra/schemas.js";

interface MetricDefinitionRow {
  id: string;
  metric_key: string;
  version: number;
  is_current: boolean;
  name: string;
  description: string | null;
  unit: string | null;
  value_type: string;
  aggregation_type: string;
  source: string | null;
  enabled: boolean;
  metadata: unknown;
  created_at: string;
  updated_at: string;
}

interface MetricDimensionRow {
  id: number;
  metric_id: string;
  dimension_key: string;
  dimension_type: string;
  required: boolean;
  allowed_values: unknown;
  metadata: unknown;
}

interface CriteriaRunRow {
  id: string;
  project_id: string;
  account_scope_id: string;
  run_key: string;
  status: string;
  trigger_source: string;
  actor_user_id: string | null;
  criteria_version_snapshot: Record<string, unknown>;
  started_at: string;
  finished_at: string | null;
  error_summary: string | null;
  metadata: Record<string, unknown>;
}

interface CriteriaEvaluationRow {
  id: number;
  run_id: string;
  criteria_id: string;
  criteria_key: string;
  criteria_version: number;
  project_id: string;
  account_scope_id: string;
  subject_type: string;
  subject_id: string;
  status: string;
  score: number;
  reason: string | null;
  evidence_refs: unknown[];
  metric_snapshot: Record<string, unknown>;
  threshold_snapshot: Record<string, unknown>;
  error_payload: Record<string, unknown>;
  evaluated_at: string;
}

function assertSchemaVersion(version: number | undefined, contractName: string) {
  if ((version || 1) !== 1) {
    throw new ApiError(
      400,
      "schema_version_unsupported",
      `${contractName} supports only schema_version=1`
    );
  }
}

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const raw =
    typeof value === "string" ? value : typeof value === "number" || typeof value === "boolean" ? String(value) : JSON.stringify(value);
  if (raw.includes('"') || raw.includes(",") || raw.includes("\n")) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

async function inTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function loadMetricDefinitionById(client: PoolClient, metricId: string): Promise<MetricDefinitionRow> {
  const { rows } = await client.query<MetricDefinitionRow>(
    `
      SELECT
        id::text,
        metric_key,
        version,
        is_current,
        name,
        description,
        unit,
        value_type,
        aggregation_type,
        source,
        enabled,
        metadata,
        created_at::text,
        updated_at::text
      FROM metric_definitions
      WHERE id = $1
      LIMIT 1
    `,
    [metricId]
  );
  const row = rows[0];
  if (!row) throw new ApiError(500, "metric_definition_missing", "Metric definition not found after write");
  return row;
}

async function loadMetricDimensions(client: PoolClient, metricId: string): Promise<MetricDimensionRow[]> {
  const { rows } = await client.query<MetricDimensionRow>(
    `
      SELECT
        id,
        metric_id::text,
        dimension_key,
        dimension_type,
        required,
        allowed_values,
        metadata
      FROM metric_dimensions
      WHERE metric_id = $1
      ORDER BY id ASC
    `,
    [metricId]
  );
  return rows;
}

function parsePgError(error: unknown): Error & { code?: string } {
  return (error || {}) as Error & { code?: string };
}

function mapContractError(error: unknown): unknown {
  if (error instanceof ApiError) return error;
  const pgError = parsePgError(error);
  const message = String(pgError.message || "Contract write failed");

  if (pgError.code === "23503") {
    return new ApiError(400, "foreign_key_violation", message);
  }
  if (pgError.code === "23514") {
    return new ApiError(400, "constraint_violation", message);
  }
  if (pgError.code === "22P02") {
    return new ApiError(400, "invalid_input_syntax", message);
  }
  if (pgError.code === "P0001") {
    return new ApiError(400, "domain_invariant_violation", message);
  }
  return error;
}

export async function upsertMetricDefinition(
  pool: Pool,
  input: MetricDefinitionUpsertInput
): Promise<{ metric: MetricDefinitionRow; dimensions: MetricDimensionRow[]; action: "created" | "updated" }> {
  assertSchemaVersion(input.schema_version, "metrics/definitions");

  try {
    return await inTransaction(pool, async (client) => {
      const existingCurrent = await client.query<{
        id: string;
        version: number;
      }>(
        `
          SELECT id::text, version
          FROM metric_definitions
          WHERE metric_key = $1
            AND is_current = true
          LIMIT 1
        `,
        [input.metric_key]
      );

      const current = existingCurrent.rows[0] || null;
      let metricId = "";
      let action: "created" | "updated" = "created";

      const shouldUpdateCurrent =
        current &&
        !input.promote_new_version &&
        (!input.version || input.version === Number(current.version));

      if (shouldUpdateCurrent) {
        metricId = current.id;
        action = "updated";
        await client.query(
          `
            UPDATE metric_definitions
            SET
              name = $2,
              description = $3,
              unit = $4,
              value_type = $5,
              aggregation_type = $6,
              source = $7,
              enabled = $8,
              metadata = $9::jsonb,
              is_current = true,
              updated_at = now()
            WHERE id = $1
          `,
          [
            metricId,
            input.name,
            input.description,
            input.unit,
            input.value_type,
            input.aggregation_type,
            input.source,
            input.enabled,
            JSON.stringify(input.metadata || {}),
          ]
        );
      } else {
        const nextVersion = input.version || (current ? Number(current.version) + 1 : 1);
        const inserted = await client.query<{ id: string }>(
          `
            INSERT INTO metric_definitions(
              metric_key,
              version,
              is_current,
              name,
              description,
              unit,
              value_type,
              aggregation_type,
              source,
              enabled,
              metadata
            )
            VALUES ($1, $2, true, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
            RETURNING id::text AS id
          `,
          [
            input.metric_key,
            nextVersion,
            input.name,
            input.description,
            input.unit,
            input.value_type,
            input.aggregation_type,
            input.source,
            input.enabled,
            JSON.stringify(input.metadata || {}),
          ]
        );
        metricId = inserted.rows[0]?.id || "";
      }

      if (!metricId) throw new ApiError(500, "metric_definition_write_failed", "Failed to persist metric definition");

      await client.query("DELETE FROM metric_dimensions WHERE metric_id = $1", [metricId]);

      for (const dimension of input.dimensions || []) {
        await client.query(
          `
            INSERT INTO metric_dimensions(
              metric_id,
              dimension_key,
              dimension_type,
              required,
              allowed_values,
              metadata
            )
            VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
          `,
          [
            metricId,
            dimension.dimension_key,
            dimension.dimension_type,
            dimension.required,
            dimension.allowed_values ? JSON.stringify(dimension.allowed_values) : null,
            JSON.stringify(dimension.metadata || {}),
          ]
        );
      }

      return {
        metric: await loadMetricDefinitionById(client, metricId),
        dimensions: await loadMetricDimensions(client, metricId),
        action,
      };
    });
  } catch (error) {
    const pgError = parsePgError(error);
    if (pgError.code === "23505") {
      throw new ApiError(409, "metric_definition_conflict", "Metric definition version already exists");
    }
    throw mapContractError(error);
  }
}

export async function ingestMetricObservations(
  pool: Pool,
  scope: ProjectScope,
  input: MetricsIngestInput
): Promise<{ total: number; inserted: number; duplicates: number }> {
  assertSchemaVersion(input.schema_version, "metrics/ingest");

  const metricKeys = Array.from(new Set((input.observations || []).map((item) => item.metric_key)));
  const { rows: metricRows } = await pool.query<{ metric_key: string; id: string }>(
    `
      SELECT metric_key, id::text
      FROM metric_definitions
      WHERE metric_key = ANY($1::text[])
        AND is_current = true
        AND enabled = true
    `,
    [metricKeys]
  );

  const metricIdByKey = new Map(metricRows.map((row) => [row.metric_key, row.id]));
  const missingMetricKeys = metricKeys.filter((key) => !metricIdByKey.has(key));
  if (missingMetricKeys.length > 0) {
    throw new ApiError(
      404,
      "metric_definition_not_found",
      `Unknown metric keys: ${missingMetricKeys.join(", ")}`
    );
  }

  try {
    return await inTransaction(pool, async (client) => {
      let inserted = 0;
      let duplicates = 0;

      for (const row of input.observations || []) {
        const metricId = metricIdByKey.get(row.metric_key)!;
        const result = await client.query(
          `
            INSERT INTO metric_observations(
              metric_id,
              project_id,
              account_scope_id,
              subject_type,
              subject_id,
              observed_at,
              value_numeric,
              value_text,
              dimensions,
              quality_flags,
              source,
              source_event_id,
              is_backfill
            )
            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              $6::timestamptz,
              $7,
              $8,
              $9::jsonb,
              $10::jsonb,
              $11,
              $12,
              $13
            )
            ON CONFLICT (
              metric_id,
              project_id,
              account_scope_id,
              subject_type,
              subject_id,
              observed_at,
              dimension_hash
            )
            DO NOTHING
            RETURNING id
          `,
          [
            metricId,
            scope.projectId,
            scope.accountScopeId,
            row.subject_type,
            row.subject_id,
            row.observed_at,
            row.value_numeric,
            row.value_text,
            JSON.stringify(row.dimensions || {}),
            JSON.stringify(row.quality_flags || {}),
            row.source,
            row.source_event_id,
            Boolean(row.is_backfill),
          ]
        );
        if (result.rowCount && result.rowCount > 0) inserted += 1;
        else duplicates += 1;
      }

      return {
        total: (input.observations || []).length,
        inserted,
        duplicates,
      };
    });
  } catch (error) {
    throw mapContractError(error);
  }
}

function buildMetricQuery(
  scope: ProjectScope,
  input: MetricsQueryInput | MetricsExportInput
): { whereSql: string; values: unknown[] } {
  const whereParts = ["o.project_id = $1", "o.account_scope_id = $2"];
  const values: unknown[] = [scope.projectId, scope.accountScopeId];

  if (input.metric_key) {
    values.push(input.metric_key);
    whereParts.push(`d.metric_key = $${values.length}`);
  }
  if (input.subject_type) {
    values.push(input.subject_type);
    whereParts.push(`o.subject_type = $${values.length}`);
  }
  if (input.subject_id) {
    values.push(input.subject_id);
    whereParts.push(`o.subject_id = $${values.length}::uuid`);
  }
  if (input.date_from) {
    values.push(input.date_from);
    whereParts.push(`o.observed_at >= $${values.length}::timestamptz`);
  }
  if (input.date_to) {
    values.push(input.date_to);
    whereParts.push(`o.observed_at <= $${values.length}::timestamptz`);
  }

  return {
    whereSql: whereParts.join(" AND "),
    values,
  };
}

export async function queryMetricObservations(
  pool: Pool,
  scope: ProjectScope,
  input: MetricsQueryInput
): Promise<{ total: number; limit: number; offset: number; rows: Record<string, unknown>[] }> {
  assertSchemaVersion(input.schema_version, "metrics/query");

  const sortMap: Record<string, string> = {
    observed_at: "o.observed_at",
    ingested_at: "o.ingested_at",
    created_at: "o.created_at",
  };
  const sortBy = sortMap[input.sort_by] || "o.observed_at";
  const sortOrder = input.sort_order === "asc" ? "ASC" : "DESC";

  const { whereSql, values } = buildMetricQuery(scope, input);
  const countResult = await pool.query<{ total: number }>(
    `
      SELECT count(*)::int AS total
      FROM metric_observations o
      JOIN metric_definitions d ON d.id = o.metric_id
      WHERE ${whereSql}
    `,
    values
  );

  const limit = Number(input.limit || 100);
  const offset = Number(input.offset || 0);
  const dataValues = [...values, limit, offset];

  const dataResult = await pool.query(
    `
      SELECT
        o.id,
        d.metric_key,
        d.version AS metric_version,
        d.value_type,
        d.aggregation_type,
        o.subject_type,
        o.subject_id::text AS subject_id,
        o.observed_at::text AS observed_at,
        o.ingested_at::text AS ingested_at,
        o.value_numeric,
        o.value_text,
        o.dimensions,
        o.quality_flags,
        o.source,
        o.source_event_id,
        o.is_backfill
      FROM metric_observations o
      JOIN metric_definitions d ON d.id = o.metric_id
      WHERE ${whereSql}
      ORDER BY ${sortBy} ${sortOrder}, o.id DESC
      LIMIT $${dataValues.length - 1}
      OFFSET $${dataValues.length}
    `,
    dataValues
  );

  return {
    total: countResult.rows[0]?.total || 0,
    limit,
    offset,
    rows: dataResult.rows as Record<string, unknown>[],
  };
}

export async function exportMetricObservations(
  pool: Pool,
  scope: ProjectScope,
  input: MetricsExportInput
): Promise<
  | { format: "json"; filename: string; row_count: number; rows: Record<string, unknown>[] }
  | { format: "csv"; filename: string; row_count: number; content: string }
> {
  assertSchemaVersion(input.schema_version, "metrics/export");

  const result = await queryMetricObservations(pool, scope, {
    ...input,
    schema_version: input.schema_version,
    limit: input.limit,
    offset: input.offset,
    sort_by: input.sort_by,
    sort_order: input.sort_order,
  });

  const filename = `metrics-export-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;
  if (input.format !== "csv") {
    return {
      format: "json",
      filename: `${filename}.json`,
      row_count: result.rows.length,
      rows: result.rows,
    };
  }

  const headers = [
    "metric_key",
    "metric_version",
    "value_type",
    "aggregation_type",
    "subject_type",
    "subject_id",
    "observed_at",
    "ingested_at",
    "value_numeric",
    "value_text",
    "dimensions",
    "quality_flags",
    "source",
    "source_event_id",
    "is_backfill",
  ];
  const lines = [headers.join(",")];
  for (const row of result.rows) {
    lines.push(
      headers
        .map((header) => csvEscape((row as Record<string, unknown>)[header]))
        .join(",")
    );
  }

  return {
    format: "csv",
    filename: `${filename}.csv`,
    row_count: result.rows.length,
    content: lines.join("\n"),
  };
}

export async function evaluateCriteriaAndStoreRun(
  pool: Pool,
  scope: ProjectScope,
  actorUserId: string | null,
  input: CriteriaEvaluateInput
): Promise<{
  run: CriteriaRunRow;
  summary: { total: number; pass: number; fail: number; error: number };
  evaluations: CriteriaEvaluationRow[];
}> {
  assertSchemaVersion(input.schema_version, "criteria/evaluate");

  try {
    return await inTransaction(pool, async (client) => {
      const runKey =
        input.run_key ||
        `criteria-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`;

    const runInsert = await client.query<{ id: string }>(
      `
        INSERT INTO criteria_evaluation_runs(
          project_id,
          account_scope_id,
          run_key,
          status,
          trigger_source,
          actor_user_id,
          criteria_version_snapshot,
          metadata
        )
        VALUES ($1, $2, $3, 'running', $4, $5::uuid, '{}'::jsonb, '{}'::jsonb)
        RETURNING id::text AS id
      `,
      [scope.projectId, scope.accountScopeId, runKey, input.trigger_source || "api", actorUserId]
    );
    const runId = runInsert.rows[0]?.id;
    if (!runId) throw new ApiError(500, "criteria_run_create_failed", "Failed to create criteria evaluation run");

    const criteriaKeys = Array.from(new Set((input.evaluations || []).map((item) => item.criteria_key)));
    const definitionsResult = await client.query<{
      id: string;
      criteria_key: string;
      version: number;
      severity: string;
      rule_spec: unknown;
    }>(
      `
        SELECT id::text, criteria_key, version, severity, rule_spec
        FROM criteria_definitions
        WHERE criteria_key = ANY($1::text[])
          AND is_current = true
          AND enabled = true
      `,
      [criteriaKeys]
    );
    const definitionsByKey = new Map(definitionsResult.rows.map((row) => [row.criteria_key, row]));

    const missing = criteriaKeys.filter((key) => !definitionsByKey.has(key));
    if (missing.length) {
      throw new ApiError(404, "criteria_definition_not_found", `Unknown criteria keys: ${missing.join(", ")}`);
    }

    const versionSnapshot: Record<string, number> = {};
    const persisted: CriteriaEvaluationRow[] = [];

    for (const item of input.evaluations || []) {
      const definition = definitionsByKey.get(item.criteria_key)!;
      versionSnapshot[item.criteria_key] = definition.version;

      const evaluated = evaluateCriteriaDefinition(definition, {
        metricValues: item.metric_values || {},
        thresholds: item.thresholds || {},
        evidence_refs: item.evidence_refs || [],
      });

      const insert = await client.query<CriteriaEvaluationRow>(
        `
          INSERT INTO criteria_evaluations(
            run_id,
            criteria_id,
            project_id,
            account_scope_id,
            subject_type,
            subject_id,
            status,
            score,
            reason,
            evidence_refs,
            metric_snapshot,
            threshold_snapshot,
            error_payload,
            evaluated_at
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6::uuid,
            $7,
            $8,
            $9,
            $10::jsonb,
            $11::jsonb,
            $12::jsonb,
            $13::jsonb,
            now()
          )
          RETURNING
            id,
            run_id::text,
            criteria_id::text,
            $14::text AS criteria_key,
            $15::int AS criteria_version,
            project_id::text,
            account_scope_id::text,
            subject_type,
            subject_id::text,
            status,
            score,
            reason,
            evidence_refs,
            metric_snapshot,
            threshold_snapshot,
            error_payload,
            evaluated_at::text
        `,
        [
          runId,
          definition.id,
          scope.projectId,
          scope.accountScopeId,
          item.subject_type,
          item.subject_id,
          evaluated.status,
          evaluated.score,
          evaluated.reason,
          JSON.stringify(evaluated.evidence_refs || []),
          JSON.stringify(evaluated.metric_snapshot || {}),
          JSON.stringify(evaluated.threshold_snapshot || {}),
          JSON.stringify(evaluated.error ? { message: evaluated.error } : {}),
          definition.criteria_key,
          definition.version,
        ]
      );
      persisted.push(insert.rows[0]);
    }

    const summary = {
      total: persisted.length,
      pass: persisted.filter((item) => item.status === "pass").length,
      fail: persisted.filter((item) => item.status === "fail").length,
      error: persisted.filter((item) => item.status === "error").length,
    };

    const finalStatus = summary.error > 0 ? "failed" : "completed";
    await client.query(
      `
        UPDATE criteria_evaluation_runs
        SET
          status = $2,
          finished_at = now(),
          criteria_version_snapshot = $3::jsonb,
          updated_at = now()
        WHERE id = $1
      `,
      [runId, finalStatus, JSON.stringify(versionSnapshot)]
    );

    const runResult = await client.query<CriteriaRunRow>(
      `
        SELECT
          id::text,
          project_id::text,
          account_scope_id::text,
          run_key,
          status,
          trigger_source,
          actor_user_id::text,
          criteria_version_snapshot,
          started_at::text,
          finished_at::text,
          error_summary,
          metadata
        FROM criteria_evaluation_runs
        WHERE id = $1
        LIMIT 1
      `,
      [runId]
    );

      return {
        run: runResult.rows[0],
        summary,
        evaluations: persisted,
      };
    });
  } catch (error) {
    throw mapContractError(error);
  }
}

export async function getCriteriaRunDetails(
  pool: Pool,
  scope: ProjectScope,
  runId: string
): Promise<{ run: CriteriaRunRow; evaluations: CriteriaEvaluationRow[] } | null> {
  const runResult = await pool.query<CriteriaRunRow>(
    `
      SELECT
        id::text,
        project_id::text,
        account_scope_id::text,
        run_key,
        status,
        trigger_source,
        actor_user_id::text,
        criteria_version_snapshot,
        started_at::text,
        finished_at::text,
        error_summary,
        metadata
      FROM criteria_evaluation_runs
      WHERE id = $1::uuid
        AND project_id = $2::uuid
        AND account_scope_id = $3::uuid
      LIMIT 1
    `,
    [runId, scope.projectId, scope.accountScopeId]
  );
  const run = runResult.rows[0];
  if (!run) return null;

  const evaluationsResult = await pool.query<CriteriaEvaluationRow>(
    `
      SELECT
        e.id,
        e.run_id::text,
        e.criteria_id::text,
        d.criteria_key,
        d.version AS criteria_version,
        e.project_id::text,
        e.account_scope_id::text,
        e.subject_type,
        e.subject_id::text,
        e.status,
        e.score,
        e.reason,
        e.evidence_refs,
        e.metric_snapshot,
        e.threshold_snapshot,
        e.error_payload,
        e.evaluated_at::text
      FROM criteria_evaluations e
      JOIN criteria_definitions d ON d.id = e.criteria_id
      WHERE e.run_id = $1::uuid
      ORDER BY e.id ASC
    `,
    [runId]
  );

  return {
    run,
    evaluations: evaluationsResult.rows,
  };
}
