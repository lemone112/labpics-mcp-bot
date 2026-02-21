/**
 * Report Scheduler (Iter 48.3)
 *
 * Integrates with the existing scheduler to run report generation
 * as a scheduled job type. Supports cron-based scheduling from templates.
 *
 * This module:
 * 1. Provides a handler function for the scheduler's job registry
 * 2. Finds active templates with cron schedules that are due
 * 3. Generates reports for each due template
 */

import { generateAndStoreReport } from "./report-generator.js";
import { listReportTemplates } from "./report-templates.js";
import type { Logger, Pool, ProjectScope } from "../../types/index.js";

type ReportTemplate = {
  id: string;
  name?: string | null;
  active?: boolean | null;
  schedule?: string | null;
};

type ReportResult = { id: string };

interface RunScheduledReportsDeps {
  listTemplates?: (pool: Pool, scope: ProjectScope) => Promise<ReportTemplate[]>;
  generateReport?: (
    pool: Pool,
    scope: ProjectScope,
    template: ReportTemplate,
    dateStart: string,
    dateEnd: string
  ) => Promise<ReportResult>;
}

interface RunScheduledReportsOptions extends RunScheduledReportsDeps {
  logger?: Pick<Logger, "info" | "error">;
  now?: Date;
}

type ScheduledReportStats = {
  generated: number;
  errors: number;
  details: Array<{
    template_id: string;
    template_name: string;
    report_id?: string;
    status: "completed" | "failed";
    error?: string;
  }>;
};

// ── Simple cron matcher ─────────────────────────────────────────
// Matches 5-field cron expressions against a given Date.
// Supports: numbers, *, ranges (1-5), steps (*/6), lists (1,3,5).

/**
 * Check if a cron field matches a given value.
 */
function cronFieldMatches(field: string, value: number, min: number, max: number): boolean {
  if (field === "*") return true;

  // Handle step: */N or range/N
  if (field.includes("/")) {
    const [rangeStr, stepStr] = field.split("/");
    const step = Number.parseInt(stepStr, 10);
    if (!Number.isFinite(step) || step <= 0) return false;

    if (rangeStr === "*") {
      return value % step === 0;
    }
    // range/step
    if (rangeStr.includes("-")) {
      const [startStr, endStr] = rangeStr.split("-");
      const start = Number.parseInt(startStr, 10);
      const end = Number.parseInt(endStr, 10);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
      if (start < min || end > max || start > end) return false;
      if (value < start || value > end) return false;
      return (value - start) % step === 0;
    }
    return false;
  }

  // Handle list: 1,3,5
  if (field.includes(",")) {
    return field
      .split(",")
      .some((part) => cronFieldMatches(part.trim(), value, min, max));
  }

  // Handle range: 1-5
  if (field.includes("-")) {
    const [startStr, endStr] = field.split("-");
    const start = Number.parseInt(startStr, 10);
    const end = Number.parseInt(endStr, 10);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
    if (start < min || end > max || start > end) return false;
    return value >= start && value <= end;
  }

  // Exact number
  const exact = Number.parseInt(field, 10);
  if (!Number.isFinite(exact)) return false;
  if (exact < min || exact > max) return false;
  return exact === value;
}

/**
 * Check if a cron expression matches a given Date.
 * @param cronExpr 5-field cron expression (min hour dom month dow)
 */
export function cronMatches(cronExpr: string | null | undefined, date: Date): boolean {
  if (!cronExpr) return false;
  const fields = String(cronExpr).trim().split(/\s+/);
  if (fields.length !== 5) return false;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  const d = date instanceof Date ? date : new Date(date);

  return (
    cronFieldMatches(minute, d.getUTCMinutes(), 0, 59) &&
    cronFieldMatches(hour, d.getUTCHours(), 0, 23) &&
    cronFieldMatches(dayOfMonth, d.getUTCDate(), 1, 31) &&
    cronFieldMatches(month, d.getUTCMonth() + 1, 1, 12) &&
    cronFieldMatches(dayOfWeek, d.getUTCDay(), 0, 6)
  );
}

/**
 * Compute the default date range for a report based on its schedule.
 * - Weekly schedules (day-of-week = specific day): last 7 days
 * - Daily schedules: last 1 day
 */
function computeDateRange(schedule: string | null | undefined): { dateStart: string; dateEnd: string } {
  const now = new Date();
  const end = new Date(now);
  end.setUTCHours(0, 0, 0, 0);
  const endStr = end.toISOString().slice(0, 10);

  const fields = schedule ? String(schedule).trim().split(/\s+/) : [];
  const dow = fields[4] || "*";
  const isWeekly = dow !== "*";

  const daysBack = isWeekly ? 7 : 1;
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - daysBack);
  const startStr = start.toISOString().slice(0, 10);

  return { dateStart: startStr, dateEnd: endStr };
}

/**
 * Run scheduled report generation.
 * Finds all active templates with cron schedules that match the current time,
 * and generates reports for each.
 */
export async function runScheduledReports(
  pool: Pool,
  scope: ProjectScope,
  options: RunScheduledReportsOptions = {}
): Promise<ScheduledReportStats> {
  const logger = options.logger || console;
  const now = options.now instanceof Date ? options.now : new Date();
  const listTemplates = options.listTemplates || listReportTemplates;
  const generateReport = options.generateReport || generateAndStoreReport;

  const templates = (await listTemplates(pool, scope)) as ReportTemplate[];
  const activeWithSchedule = templates.filter(
    (tpl) => Boolean(tpl.active) && Boolean(tpl.schedule)
  );

  const stats: ScheduledReportStats = { generated: 0, errors: 0, details: [] };

  for (const template of activeWithSchedule) {
    if (!cronMatches(template.schedule, now)) continue;

    // Check if we already generated a report for this template in the last hour
    // to prevent duplicate generation across overlapping scheduler ticks.
    const { rows: recent } = await pool.query<{ id: string }>(
      `
        SELECT id FROM generated_reports
        WHERE template_id = $1
          AND project_id = $2
          AND account_scope_id = $3
          AND created_at > now() - interval '55 minutes'
        LIMIT 1
      `,
      [template.id, scope.projectId, scope.accountScopeId]
    );
    if (recent.length > 0) continue;

    const { dateStart, dateEnd } = computeDateRange(template.schedule);

    try {
      const report = await generateReport(pool, scope, template, dateStart, dateEnd);
      stats.generated += 1;
      stats.details.push({
        template_id: template.id,
        template_name: template.name || "",
        report_id: report.id,
        status: "completed",
      });
      logger.info?.(
        { template_id: template.id, template_name: template.name, report_id: report.id },
        "scheduled report generated"
      );
    } catch (error) {
      stats.errors += 1;
      const errMsg = String((error as Error)?.message || error).slice(0, 500);
      stats.details.push({
        template_id: template.id,
        template_name: template.name || "",
        status: "failed",
        error: errMsg,
      });
      logger.error?.(
        { template_id: template.id, template_name: template.name, error: errMsg },
        "scheduled report generation failed"
      );
    }
  }

  return stats;
}

/**
 * Creates a handler function compatible with the scheduler's job registry.
 * Register this as a handler for the "report_generation" job type.
 */
export function createReportGenerationHandler(deps: RunScheduledReportsDeps = {}) {
  return async ({ pool, scope, logger }: { pool: Pool; scope: ProjectScope; logger?: Pick<Logger, "info" | "error"> }) => {
    return runScheduledReports(pool, scope, { logger, ...deps });
  };
}
