import { ZodError } from "zod";
import type { FastifyReply } from "fastify";
import type { z } from "zod";

export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(status: number, code: string, message?: string, details: unknown = null) {
    super(message || code);
    this.name = "ApiError";
    this.status = Number.isFinite(status) ? status : 500;
    this.code = String(code || "internal_error");
    this.details = details || null;
  }
}

export function fail(status: number, code: string, message: string, details: unknown = null): never {
  throw new ApiError(status, code, message, details);
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof ZodError) {
    const issues = error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
      code: i.code,
    }));
    return new ApiError(400, "validation_error", issues[0]?.message || "Invalid request", issues);
  }
  return new ApiError(500, "internal_error", "Internal server error");
}

export function sendOk(reply: FastifyReply, requestId: string, payload: Record<string, unknown> = {}, status = 200): FastifyReply {
  return reply.code(status).send({
    ok: true,
    ...payload,
    request_id: requestId,
  });
}

export function sendError(reply: FastifyReply, requestId: string, error: unknown): FastifyReply {
  const apiError = toApiError(error);
  const body: Record<string, unknown> = {
    ok: false,
    error: apiError.code,
    message: apiError.message,
    request_id: requestId,
  };
  if (apiError.details != null) {
    body.details = apiError.details;
  }
  return reply.code(apiError.status).send(body);
}

export function parseLimit(value: unknown, fallback = 100, max = 500): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(parsed, max));
}

export function parseBody<T>(schema: z.ZodType<T>, raw: unknown): T {
  const input = raw && typeof raw === "object" ? raw : {};
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issues = (result as { success: false; error: ZodError }).error.issues.map((i) => ({
    path: i.path.join("."),
    message: i.message,
    code: i.code,
  }));
  throw new ApiError(400, "validation_error", issues[0]?.message || "Invalid request body", issues);
}
