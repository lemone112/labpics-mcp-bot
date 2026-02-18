import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(status, code, message, details = null) {
    super(message || code);
    this.name = "ApiError";
    this.status = Number.isFinite(status) ? status : 500;
    this.code = String(code || "internal_error");
    this.details = details || null;
  }
}

export function fail(status, code, message, details = null) {
  throw new ApiError(status, code, message, details);
}

export function toApiError(error) {
  if (error instanceof ApiError) return error;
  if (error instanceof ZodError) {
    const issues = error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
      code: i.code,
    }));
    return new ApiError(400, "validation_error", issues[0]?.message || "Invalid request", issues);
  }
  return new ApiError(500, "internal_error", String(error?.message || error || "internal_error"));
}

export function sendOk(reply, requestId, payload = {}, status = 200) {
  return reply.code(status).send({
    ok: true,
    ...payload,
    request_id: requestId,
  });
}

export function sendError(reply, requestId, error) {
  const apiError = toApiError(error);
  const body = {
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

export function parseLimit(value, fallback = 100, max = 500) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(parsed, max));
}

export function parseBody(schema, raw) {
  const input = raw && typeof raw === "object" ? raw : {};
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issues = result.error.issues.map((i) => ({
    path: i.path.join("."),
    message: i.message,
    code: i.code,
  }));
  throw new ApiError(400, "validation_error", issues[0]?.message || "Invalid request body", issues);
}
