import { fail } from "./api-contract.js";
import type { ProjectScope, RequestScope } from "../types/index.js";

interface RequestWithAuth {
  auth?: {
    active_project_id?: string | null;
    account_scope_id?: string | null;
    user_id?: string | null;
    user_role?: string | null;
  };
}

export function getRequestScope(request: RequestWithAuth): RequestScope {
  const projectId = request?.auth?.active_project_id || null;
  const accountScopeId = request?.auth?.account_scope_id || null;
  return { projectId, accountScopeId };
}

export function requireProjectScope(request: RequestWithAuth): ProjectScope {
  const { projectId, accountScopeId } = getRequestScope(request);
  if (!projectId || !accountScopeId) {
    fail(409, "active_project_required", "Select active project first");
  }
  return { projectId, accountScopeId };
}
