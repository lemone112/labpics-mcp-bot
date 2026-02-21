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
import { requestIdOf } from "../infra/utils.js";
import type { Pool } from "../types/index.js";
import type { FastifyReply, FastifyRequest } from "fastify";

type RequestLike = FastifyRequest & {
  auth?: {
    active_project_id?: string | null;
    account_scope_id?: string | null;
    user_id?: string | null;
    user_role?: "owner" | "pm" | null;
    username?: string | null;
  };
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  requestId?: string;
};

type ReplyLike = FastifyReply;
type RegisterFn = (
  path: string,
  handler: (request: RequestLike, reply: ReplyLike) => Promise<unknown> | unknown
) => void;

interface RouteCtx {
  registerGet: RegisterFn;
  registerPost: RegisterFn;
  pool: Pool;
}

/**
 * Report routes.
 */
export function registerReportRoutes(ctx: RouteCtx) {
  const { registerGet, registerPost, pool } = ctx;

  registerGet("/reports/templates", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    await ensureBuiltinTemplates(pool, scope);
    const templates = await listReportTemplates(pool, scope);
    return sendOk(reply, requestIdOf(request), { templates });
  });

  registerPost("/reports/templates", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const body = request.body || {};
    try {
      const template = await upsertReportTemplate(pool, scope, body as any);
      await writeAuditEvent(pool, {
        projectId: scope.projectId,
        accountScopeId: scope.accountScopeId,
        actorUsername: request.auth?.username || null,
        action: body.id ? "report_template.update" : "report_template.create",
        entityType: "report_template",
        entityId: (template as any).id,
        status: "ok",
        requestId: requestIdOf(request),
        payload: { name: (template as any).name, sections: (template as any).sections },
        evidenceRefs: [],
      });
      return sendOk(reply, requestIdOf(request), { template }, body.id ? 200 : 201);
    } catch (error) {
      const msg = String((error as Error)?.message || error);
      return sendError(
        reply,
        requestIdOf(request),
        new ApiError(400, "template_validation_error", msg)
      );
    }
  });

  registerGet("/reports", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const filters = {
      templateId: request.query?.template_id || undefined,
      status: request.query?.status || undefined,
      dateFrom: request.query?.date_from || undefined,
      dateTo: request.query?.date_to || undefined,
      limit: parseLimit(request.query?.limit, 50, 200),
      offset: Math.max(0, Number(request.query?.offset) || 0),
    };
    const result = await listGeneratedReports(pool, scope, filters as any);
    return sendOk(reply, requestIdOf(request), result as any);
  });

  registerGet("/reports/:id", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const reportId = String(request.params?.id || "").trim();
    if (!reportId) {
      return sendError(
        reply,
        requestIdOf(request),
        new ApiError(400, "report_id_required", "Report ID is required")
      );
    }
    const report = await getGeneratedReport(pool, scope, reportId);
    if (!report) {
      return sendError(
        reply,
        requestIdOf(request),
        new ApiError(404, "report_not_found", "Report not found")
      );
    }
    return sendOk(reply, requestIdOf(request), { report });
  });

  registerPost("/reports/generate", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const body = request.body || {};
    const templateId = String(body.template_id || "").trim();

    if (!templateId) {
      return sendError(
        reply,
        requestIdOf(request),
        new ApiError(400, "template_id_required", "template_id is required")
      );
    }

    const template = await getReportTemplate(pool, scope, templateId);
    if (!template) {
      return sendError(
        reply,
        requestIdOf(request),
        new ApiError(404, "template_not_found", "Report template not found")
      );
    }

    const now = new Date();
    const defaultEnd = now.toISOString().slice(0, 10);
    const defaultStart = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
    const dateStart = String(body.date_start || defaultStart).trim();
    const dateEnd = String(body.date_end || defaultEnd).trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStart) || !/^\d{4}-\d{2}-\d{2}$/.test(dateEnd)) {
      return sendError(
        reply,
        requestIdOf(request),
        new ApiError(400, "invalid_date_format", "Dates must be in YYYY-MM-DD format")
      );
    }

    try {
      const report = await generateAndStoreReport(pool, scope, template as any, dateStart, dateEnd);
      await writeAuditEvent(pool, {
        projectId: scope.projectId,
        accountScopeId: scope.accountScopeId,
        actorUsername: request.auth?.username || null,
        action: "report.generate",
        entityType: "generated_report",
        entityId: (report as any).id,
        status: "ok",
        requestId: requestIdOf(request),
        payload: {
          template_id: (template as any).id,
          template_name: (template as any).name,
          date_range: { start: dateStart, end: dateEnd },
        },
        evidenceRefs: [],
      });
      return sendOk(reply, requestIdOf(request), { report }, 201);
    } catch (error) {
      const errMsg = String((error as Error)?.message || error);
      request.log.error(
        { err: errMsg, template_id: templateId, request_id: requestIdOf(request) },
        "report generation failed"
      );
      return sendError(
        reply,
        requestIdOf(request),
        new ApiError(500, "report_generation_failed", "Report generation failed")
      );
    }
  });
}
