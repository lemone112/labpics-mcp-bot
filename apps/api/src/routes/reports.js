import { ApiError, parseLimit, sendError, sendOk } from "../infra/api-contract.js";
import { requireProjectScope } from "../infra/scope.js";
import { writeAuditEvent } from "../domains/core/audit.js";
import {
  listReportTemplates,
  getReportTemplate,
  upsertReportTemplate,
  ensureBuiltinTemplates,
} from "../domains/analytics/report-templates.js";
import {
  generateAndStoreReport,
  listGeneratedReports,
  getGeneratedReport,
} from "../domains/analytics/report-generator.js";

/**
 * Report routes (Iter 48.4)
 *
 * GET  /reports              — list generated reports (paginated)
 * GET  /reports/:id          — get specific report
 * POST /reports/generate     — trigger manual report generation
 * GET  /reports/templates    — list available templates
 * POST /reports/templates    — create/update template
 *
 * @param {object} ctx
 */
export function registerReportRoutes(ctx) {
  const { registerGet, registerPost, pool } = ctx;

  // ── Templates ───────────────────────────────────────────────────

  registerGet("/reports/templates", async (request, reply) => {
    const scope = requireProjectScope(request);
    await ensureBuiltinTemplates(pool, scope);
    const templates = await listReportTemplates(pool, scope);
    return sendOk(reply, request.requestId, { templates });
  });

  registerPost("/reports/templates", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = request.body || {};
    try {
      const template = await upsertReportTemplate(pool, scope, body);
      await writeAuditEvent(pool, {
        projectId: scope.projectId,
        accountScopeId: scope.accountScopeId,
        actorUsername: request.auth?.username || null,
        action: body.id ? "report_template.update" : "report_template.create",
        entityType: "report_template",
        entityId: template.id,
        status: "ok",
        requestId: request.requestId,
        payload: { name: template.name, sections: template.sections },
        evidenceRefs: [],
      });
      return sendOk(reply, request.requestId, { template }, body.id ? 200 : 201);
    } catch (error) {
      const msg = String(error?.message || error);
      return sendError(
        reply,
        request.requestId,
        new ApiError(400, "template_validation_error", msg)
      );
    }
  });

  // ── Generated Reports ───────────────────────────────────────────

  registerGet("/reports", async (request, reply) => {
    const scope = requireProjectScope(request);
    const filters = {
      templateId: request.query?.template_id || undefined,
      status: request.query?.status || undefined,
      dateFrom: request.query?.date_from || undefined,
      dateTo: request.query?.date_to || undefined,
      limit: parseLimit(request.query?.limit, 50, 200),
      offset: Math.max(0, Number(request.query?.offset) || 0),
    };
    const result = await listGeneratedReports(pool, scope, filters);
    return sendOk(reply, request.requestId, result);
  });

  registerGet("/reports/:id", async (request, reply) => {
    const scope = requireProjectScope(request);
    const reportId = String(request.params?.id || "").trim();
    if (!reportId) {
      return sendError(
        reply,
        request.requestId,
        new ApiError(400, "report_id_required", "Report ID is required")
      );
    }
    const report = await getGeneratedReport(pool, scope, reportId);
    if (!report) {
      return sendError(
        reply,
        request.requestId,
        new ApiError(404, "report_not_found", "Report not found")
      );
    }
    return sendOk(reply, request.requestId, { report });
  });

  // ── Manual Generation ───────────────────────────────────────────

  registerPost("/reports/generate", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = request.body || {};
    const templateId = String(body.template_id || "").trim();

    if (!templateId) {
      return sendError(
        reply,
        request.requestId,
        new ApiError(400, "template_id_required", "template_id is required")
      );
    }

    const template = await getReportTemplate(pool, scope, templateId);
    if (!template) {
      return sendError(
        reply,
        request.requestId,
        new ApiError(404, "template_not_found", "Report template not found")
      );
    }

    // Default date range: last 7 days
    const now = new Date();
    const defaultEnd = now.toISOString().slice(0, 10);
    const defaultStart = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);

    const dateStart = String(body.date_start || defaultStart).trim();
    const dateEnd = String(body.date_end || defaultEnd).trim();

    // Validate dates
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStart) || !/^\d{4}-\d{2}-\d{2}$/.test(dateEnd)) {
      return sendError(
        reply,
        request.requestId,
        new ApiError(400, "invalid_date_format", "Dates must be in YYYY-MM-DD format")
      );
    }

    try {
      const report = await generateAndStoreReport(pool, scope, template, dateStart, dateEnd);
      await writeAuditEvent(pool, {
        projectId: scope.projectId,
        accountScopeId: scope.accountScopeId,
        actorUsername: request.auth?.username || null,
        action: "report.generate",
        entityType: "generated_report",
        entityId: report.id,
        status: "ok",
        requestId: request.requestId,
        payload: {
          template_id: template.id,
          template_name: template.name,
          date_range: { start: dateStart, end: dateEnd },
        },
        evidenceRefs: [],
      });
      return sendOk(reply, request.requestId, { report }, 201);
    } catch (error) {
      const errMsg = String(error?.message || error);
      request.log.error(
        { err: errMsg, template_id: templateId, request_id: request.requestId },
        "report generation failed"
      );
      return sendError(
        reply,
        request.requestId,
        new ApiError(500, "report_generation_failed", "Report generation failed")
      );
    }
  });
}
