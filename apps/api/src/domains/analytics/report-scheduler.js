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

// ── Simple cron matcher ─────────────────────────────────────────
// Matches 5-field cron expressions against a given Date.
// Supports: numbers, *, ranges (1-5), steps (*/6), lists (1,3,5).

/**
 * Check if a cron field matches a given value.
 * @param {string} field - Cron field expression
 * @param {number} value - Current value to check
 * @param {number} min   - Minimum value for the field
 * @param {number} max   - Maximum value for the field
 * @returns {boolean}
 */
function cronFieldMatches(field, value, min, max) {
  if (field === "*") return true;

  // Handle step: */N or range/N
  if (field.includes("/")) {
    const [rangeStr, stepStr] = field.split("/");
    const step = parseInt(stepStr, 10);
    if (!Number.isFinite(step) || step <= 0) return false;

    if (rangeStr === "*") {
      return value % step === 0;
    }
    // range/step
    if (rangeStr.includes("-")) {
      const [startStr, endStr] = rangeStr.split("-");
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (value < start || value > end) return false;
      return (value - start) % step === 0;
    }
    return false;
  }

  // Handle list: 1,3,5
  if (field.includes(",")) {
    return field.split(",").some((part) => cronFieldMatches(part.trim(), value, min, max));
  }

  // Handle range: 1-5
  if (field.includes("-")) {
    const [startStr, endStr] = field.split("-");
    const start = parseInt(startStr, 10);
    const end = parseInt(endStr, 10);
    return value >= start && value <= end;
  }

  // Exact number
  const exact = parseInt(field, 10);
  return Number.isFinite(exact) && exact === value;
}

/**
 * Check if a cron expression matches a given Date.
 * @param {string} cronExpr - 5-field cron expression (min hour dom month dow)
 * @param {Date} date
 * @returns {boolean}
 */
export function cronMatches(cronExpr, date) {
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
 * - Hourly/frequent schedules: last 1 day
 * @param {string|null} schedule
 * @returns {{ dateStart: string, dateEnd: string }}
 */
function computeDateRange(schedule) {
  const now = new Date();
  const end = new Date(now);
  end.setUTCHours(0, 0, 0, 0);
  const endStr = end.toISOString().slice(0, 10);

  // Detect weekly by day-of-week field being a specific number (not *)
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
 *
 * This function is designed to be called from the scheduler tick (every N minutes).
 * Since the scheduler runs on a fixed cadence (not every minute), we match
 * templates whose cron hour matches the current hour, allowing a tolerance window.
 *
 * @param {import('pg').Pool} pool
 * @param {{ projectId: string, accountScopeId: string }} scope
 * @param {object} [options]
 * @param {object} [options.logger]
 * @returns {Promise<{ generated: number, errors: number, details: object[] }>}
 */
export async function runScheduledReports(pool, scope, options = {}) {
  const logger = options.logger || console;
  const now = new Date();

  const templates = await listReportTemplates(pool, scope);
  const activeWithSchedule = templates.filter(
    (tpl) => tpl.active && tpl.schedule
  );

  const stats = { generated: 0, errors: 0, details: [] };

  for (const template of activeWithSchedule) {
    if (!cronMatches(template.schedule, now)) continue;

    // Check if we already generated a report for this template in the last hour
    // to prevent duplicate generation across overlapping scheduler ticks
    const { rows: recent } = await pool.query(
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
      const report = await generateAndStoreReport(pool, scope, template, dateStart, dateEnd);
      stats.generated++;
      stats.details.push({
        template_id: template.id,
        template_name: template.name,
        report_id: report.id,
        status: "completed",
      });
      logger.info(
        { template_id: template.id, template_name: template.name, report_id: report.id },
        "scheduled report generated"
      );
    } catch (error) {
      stats.errors++;
      const errMsg = String(error?.message || error).slice(0, 500);
      stats.details.push({
        template_id: template.id,
        template_name: template.name,
        status: "failed",
        error: errMsg,
      });
      logger.error(
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
 *
 * @returns {Function}
 */
export function createReportGenerationHandler() {
  return async ({ pool, scope, logger }) => {
    return runScheduledReports(pool, scope, { logger });
  };
}
