import type { Pool } from "../../types/index.js";

type ProjectScope = {
  projectId: string;
  accountScopeId: string;
};

type PgUniqueViolation = {
  code?: string;
  detail?: string;
};

export async function resolveProjectSourceBinding(
  pool: Pool,
  scope: ProjectScope,
  sourceKind: string,
  fallbackExternalId = "",
  meta: Record<string, unknown> = {}
) {
  const { rows } = await pool.query(
    `
      SELECT external_id
      FROM project_sources
      WHERE project_id = $1
        AND account_scope_id = $2
        AND source_kind = $3
      LIMIT 1
    `,
    [scope.projectId, scope.accountScopeId, sourceKind]
  );
  if ((rows[0] as { external_id?: string } | undefined)?.external_id) {
    return String((rows[0] as { external_id: string }).external_id);
  }

  const fallback = String(fallbackExternalId || "").trim();
  if (!fallback) {
    throw new Error(`${sourceKind}_source_not_bound`);
  }

  try {
    await pool.query(
      `
        INSERT INTO project_sources(project_id, account_scope_id, source_kind, external_id, meta, updated_at)
        VALUES ($1, $2, $3, $4, $5::jsonb, now())
      `,
      [scope.projectId, scope.accountScopeId, sourceKind, fallback, JSON.stringify(meta || {})]
    );
    return fallback;
  } catch (error) {
    const err = error as PgUniqueViolation;
    if (String(err?.code) === "23505") {
      const detail = String(err?.detail || "").toLowerCase();
      if (detail.includes("source_kind") && detail.includes("external_id")) {
        throw new Error(`${sourceKind}_external_id_already_bound_to_another_project`);
      }
      if (detail.includes("project_id") && detail.includes("source_kind")) {
        throw new Error(`${sourceKind}_project_already_has_binding`);
      }
      throw new Error(`${sourceKind}_source_binding_conflict`);
    }
    throw error;
  }
}
