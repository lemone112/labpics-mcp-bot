import { fail } from "./api-contract.js";

export function getRequestScope(request) {
  const projectId = request?.auth?.active_project_id || null;
  const accountScopeId = request?.auth?.account_scope_id || null;
  return { projectId, accountScopeId };
}

export function requireProjectScope(request) {
  const { projectId, accountScopeId } = getRequestScope(request);
  if (!projectId || !accountScopeId) {
    fail(409, "active_project_required", "Select active project first");
  }
  return { projectId, accountScopeId };
}
