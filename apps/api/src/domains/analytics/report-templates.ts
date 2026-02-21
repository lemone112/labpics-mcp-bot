/**
 * Report Templates System (Iter 48.1)
 *
 * Manages report template definitions: CRUD operations, schema validation,
 * and built-in (seed) templates for common report types.
 */

import type { Pool, ProjectScope } from "../../types/index.js";

type TemplateSection =
  | "summary_stats"
  | "connector_health"
  | "project_activity"
  | "embedding_coverage"
  | "error_summary";

type ReportFormat = "json" | "html";

interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface ReportTemplateRow {
  id: string;
  name: string;
  description: string | null;
  sections: string[] | null;
  format: string;
  schedule: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface UpsertReportTemplateInput {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  sections?: unknown;
  format?: unknown;
  schedule?: unknown;
  active?: unknown;
}

// ── Valid section types ─────────────────────────────────────────
const VALID_SECTIONS = new Set<TemplateSection>([
  "summary_stats",
  "connector_health",
  "project_activity",
  "embedding_coverage",
  "error_summary",
]);

const VALID_FORMATS = new Set<ReportFormat>(["json", "html"]);

/**
 * Validate a template sections array.
 * Each section must be a string from the allowed set.
 */
export function validateSections(sections: unknown): ValidationResult {
  if (!Array.isArray(sections) || sections.length === 0) {
    return { valid: false, error: "sections must be a non-empty array" };
  }
  for (const section of sections) {
    if (typeof section !== "string" || !VALID_SECTIONS.has(section as TemplateSection)) {
      return {
        valid: false,
        error: `invalid section: "${section}". Allowed: ${[...VALID_SECTIONS].join(", ")}`,
      };
    }
  }
  return { valid: true };
}

/**
 * Validate a report format.
 */
export function validateFormat(format: unknown): ValidationResult {
  if (!format || !VALID_FORMATS.has(format as ReportFormat)) {
    return {
      valid: false,
      error: `invalid format: "${format}". Allowed: ${[...VALID_FORMATS].join(", ")}`,
    };
  }
  return { valid: true };
}

/**
 * Validate a cron expression (basic check: 5 space-separated fields).
 */
export function validateSchedule(schedule: string | null | undefined): ValidationResult {
  if (schedule == null || schedule === "") return { valid: true };
  const parts = String(schedule).trim().split(/\s+/);
  if (parts.length !== 5) {
    return { valid: false, error: "schedule must be a valid 5-field cron expression" };
  }
  return { valid: true };
}

// ── Built-in template definitions (seeds) ───────────────────────
export const BUILTIN_TEMPLATES: Array<{
  name: string;
  description: string;
  sections: TemplateSection[];
  format: ReportFormat;
  schedule: string;
}> = [
  {
    name: "Weekly Summary",
    description: "Weekly overview of project activity, connector health, and key metrics",
    sections: ["summary_stats", "connector_health", "project_activity"],
    format: "json",
    schedule: "0 9 * * 1", // Monday 09:00
  },
  {
    name: "Project Health",
    description: "Detailed project health report including embeddings and error analysis",
    sections: ["summary_stats", "project_activity", "embedding_coverage", "error_summary"],
    format: "json",
    schedule: "0 8 * * *", // Daily 08:00
  },
  {
    name: "Connector Status",
    description: "Connector synchronization status and error summary",
    sections: ["connector_health", "error_summary"],
    format: "json",
    schedule: "0 */6 * * *", // Every 6 hours
  },
];

// ── Database operations ─────────────────────────────────────────

/**
 * List all report templates for a project scope.
 */
export async function listReportTemplates(
  pool: Pool,
  scope: ProjectScope
): Promise<ReportTemplateRow[]> {
  const { rows } = await pool.query<ReportTemplateRow>(
    `
      SELECT
        id, name, description, sections, format, schedule, active,
        created_at, updated_at
      FROM report_templates
      WHERE project_id = $1
        AND account_scope_id = $2
      ORDER BY name ASC
    `,
    [scope.projectId, scope.accountScopeId]
  );
  return rows;
}

/**
 * Get a single report template by ID.
 */
export async function getReportTemplate(
  pool: Pool,
  scope: ProjectScope,
  templateId: string
): Promise<ReportTemplateRow | null> {
  const { rows } = await pool.query<ReportTemplateRow>(
    `
      SELECT
        id, name, description, sections, format, schedule, active,
        created_at, updated_at
      FROM report_templates
      WHERE id = $1
        AND project_id = $2
        AND account_scope_id = $3
      LIMIT 1
    `,
    [templateId, scope.projectId, scope.accountScopeId]
  );
  return rows[0] || null;
}

/**
 * Create or update a report template.
 * If id is provided and exists, updates; otherwise inserts.
 */
export async function upsertReportTemplate(
  pool: Pool,
  scope: ProjectScope,
  input: UpsertReportTemplateInput
): Promise<ReportTemplateRow> {
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Template name is required");

  const sections = input.sections || [];
  const sectionsResult = validateSections(sections);
  if (!sectionsResult.valid) throw new Error(sectionsResult.error);

  const format = input.format || "json";
  const formatResult = validateFormat(format);
  if (!formatResult.valid) throw new Error(formatResult.error);

  const schedule = input.schedule != null ? String(input.schedule).trim() || null : null;
  if (schedule) {
    const scheduleResult = validateSchedule(schedule);
    if (!scheduleResult.valid) throw new Error(scheduleResult.error);
  }

  const description = input.description != null ? String(input.description).trim() : null;
  const active = input.active !== false;

  if (input.id) {
    // Update existing template
    const { rows } = await pool.query<ReportTemplateRow>(
      `
        UPDATE report_templates
        SET
          name = $4,
          description = $5,
          sections = $6::jsonb,
          format = $7,
          schedule = $8,
          active = $9,
          updated_at = now()
        WHERE id = $1
          AND project_id = $2
          AND account_scope_id = $3
        RETURNING id, name, description, sections, format, schedule, active, created_at, updated_at
      `,
      [
        input.id,
        scope.projectId,
        scope.accountScopeId,
        name,
        description,
        JSON.stringify(sections),
        format,
        schedule,
        active,
      ]
    );
    if (!rows[0]) throw new Error("Template not found");
    return rows[0];
  }

  // Insert new template
  const { rows } = await pool.query<ReportTemplateRow>(
    `
      INSERT INTO report_templates(
        project_id, account_scope_id,
        name, description, sections, format, schedule, active
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
      RETURNING id, name, description, sections, format, schedule, active, created_at, updated_at
    `,
    [
      scope.projectId,
      scope.accountScopeId,
      name,
      description,
      JSON.stringify(sections),
      format,
      schedule,
      active,
    ]
  );
  return rows[0];
}

/**
 * Ensure built-in templates exist for a given project scope.
 * Inserts only if no templates exist for the scope yet (first-run seeding).
 */
export async function ensureBuiltinTemplates(
  pool: Pool,
  scope: ProjectScope
): Promise<number> {
  const { rows: existing } = await pool.query<{ cnt: number | string }>(
    `
      SELECT count(*)::int AS cnt
      FROM report_templates
      WHERE project_id = $1
        AND account_scope_id = $2
    `,
    [scope.projectId, scope.accountScopeId]
  );
  if (Number(existing[0]?.cnt || 0) > 0) return 0;

  let seeded = 0;
  for (const tpl of BUILTIN_TEMPLATES) {
    await pool.query(
      `
        INSERT INTO report_templates(
          project_id, account_scope_id,
          name, description, sections, format, schedule, active
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, true)
      `,
      [
        scope.projectId,
        scope.accountScopeId,
        tpl.name,
        tpl.description,
        JSON.stringify(tpl.sections),
        tpl.format,
        tpl.schedule,
      ]
    );
    seeded += 1;
  }
  return seeded;
}

export { VALID_SECTIONS, VALID_FORMATS };
