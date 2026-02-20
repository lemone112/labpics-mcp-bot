import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import type { FastifyRequest, FastifyReply } from "fastify";
import type { Redis } from "ioredis";

// ── Scope ──────────────────────────────────────────────────────

export interface ProjectScope {
  projectId: string;
  accountScopeId: string;
}

export interface RequestScope {
  projectId: string | null;
  accountScopeId: string | null;
}

// ── Auth (augmented on FastifyRequest) ─────────────────────────

export interface AuthPayload {
  username: string;
  active_project_id: string | null;
  account_scope_id: string | null;
  session_id?: string;
}

export interface ApiKeyPayload {
  id: string;
  scopes: string[];
}

export interface AuthenticatedRequest extends FastifyRequest {
  auth: AuthPayload;
  requestId: string;
  apiKey?: ApiKeyPayload;
}

// ── Logger ─────────────────────────────────────────────────────

export interface Logger {
  info(obj: Record<string, unknown>, msg?: string): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
  error(obj: Record<string, unknown>, msg?: string): void;
  debug?(obj: Record<string, unknown>, msg?: string): void;
  child?(bindings: Record<string, unknown>): Logger;
}

// ── Re-exports for convenience ─────────────────────────────────

export type { Pool, PoolClient, QueryResult, QueryResultRow };
export type { FastifyRequest, FastifyReply };
export type { Redis };
