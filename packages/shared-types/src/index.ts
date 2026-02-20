// @labpics/shared-types — Cross-service type definitions
// These types are shared between apps/api, apps/web, and apps/telegram-bot.

// ── Scope ──────────────────────────────────────────────────────

export interface ProjectScope {
  projectId: string;
  accountScopeId: string;
}

export interface RequestScope {
  projectId: string | null;
  accountScopeId: string | null;
}

// ── Auth ───────────────────────────────────────────────────────

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

// ── Logger ─────────────────────────────────────────────────────

export interface Logger {
  info(obj: Record<string, unknown>, msg?: string): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
  error(obj: Record<string, unknown>, msg?: string): void;
  debug?(obj: Record<string, unknown>, msg?: string): void;
  child?(bindings: Record<string, unknown>): Logger;
}
