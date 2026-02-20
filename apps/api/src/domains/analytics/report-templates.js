/**
 * Report Templates System (Iter 48.1)
 *
 * Manages report template definitions: CRUD operations, schema validation,
 * and built-in (seed) templates for common report types.
 */

// ── Valid section types ─────────────────────────────────────────
const VALID_SECTIONS = new Set([
  "summary_stats",
  "connector_health",
  "project_activity",
  "embedding_coverage",
  "error_summary",
]);

const VALID_FORMATS = new Set(["json", "html"]);

/**
 * Validate a template sections array.
 * Each section must be a string from the allowed set.
 * @param {unknown[]} sections
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateSections(sections) {
  if (!Array.isArray(sections) || sections.length === 0) {
    return { valid: false, error: "sections must be a non-empty array" };
  }
  for (const section of sections) {
    if (typeof section !== "string" || !VALID_SECTIONS.has(section)) {
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
 * @param {string} format
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateFormat(format) {
  if (!format || !VALID_FORMATS.has(format)) {
    return {
      valid: false,
      error: `invalid format: "${format}". Allowed: ${[...VALID_FORMATS].join(", ")}`,
    };
  }
  return { valid: true };
}

/**
 * Validate a cron expression (basic check: 5 space-separated fields).
 * @param {string|null|undefined} schedule
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateSchedule(schedule) {
  if (schedule == null || schedule === "") return { valid: true };
  const parts = String(schedule).trim().split(/\s+/);
  if (parts.length !== 5) {
    return { valid: false, error: "schedule must be a valid 5-field cron expression" };
  }
  return { valid: true };
}

// ── Built-in template definitions (seeds) ───────────────────────
export const BUILTIN_TEMPLATES = [
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
 * @param {import('pg').Pool} pool
 * @param {{ projectId: string, accountScopeId: string }} scope
 * @returns {Promise<object[]>}
 */
export async function listReportTemplates(pool, scope) {
  const { rows } = await pool.query(
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
 * @param {import('pg').Pool} pool
 * @param {{ projectId: string, accountScopeId: string }} scope
 * @param {string} templateId
 * @returns {Promise<object|null>}
 */
export async function getReportTemplate(pool, scope, templateId) {
  const { rows } = await pool.query(
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
 * @param {import('pg').Pool} pool
 * @param {{ projectId: string, accountScopeId: string }} scope
 * @param {object} input
 * @param {string} [input.id] - Template ID for update
 * @param {string} input.name
 * @param {string} [input.description]
 * @param {string[]} input.sections
 * @param {string} [input.format]
 * @param {string|null} [input.schedule]
 * @param {boolean} [input.active]
 * @returns {Promise<object>}
 */
export async function upsertReportTemplate(pool, scope, input) {
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
    const { rows } = await pool.query(
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
  const { rows } = await pool.query(
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
 * @param {import('pg').Pool} pool
 * @param {{ projectId: string, accountScopeId: string }} scope
 * @returns {Promise<number>} Number of templates seeded
 */
export async function ensureBuiltinTemplates(pool, scope) {
  const { rows: existing } = await pool.query(
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
    seeded++;
  }
  return seeded;
}

export { VALID_SECTIONS, VALID_FORMATS };
