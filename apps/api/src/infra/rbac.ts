import { ApiError } from "./api-contract.js";

export type Role = "owner" | "pm" | "delivery_lead" | "executor" | "viewer";
export type Permission =
  | "project.read"
  | "project.create"
  | "user.read"
  | "user.manage"
  | "project_assignment.manage"
  | "api_keys.manage"
  | "workforce.employee.read"
  | "workforce.employee.write"
  | "workforce.condition.read"
  | "workforce.condition.write"
  | "workforce.link.read"
  | "workforce.link.write";

interface AuthContext {
  session_id?: string;
  user_id?: string | null;
  user_role?: Role | null;
  active_project_id?: string | null;
}

interface ApiKeyContext {
  scopes?: string[];
}

interface RequestLike {
  auth?: AuthContext;
  apiKey?: ApiKeyContext;
}

interface QueryResult {
  rows: Array<Record<string, unknown>>;
}

interface PoolLike {
  query: (query: string, params?: unknown[]) => Promise<QueryResult>;
}

const ROLE_LEVELS: Record<Role, number> = {
  owner: 5,
  pm: 4,
  delivery_lead: 3,
  executor: 2,
  viewer: 1,
};

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: [
    "project.read",
    "project.create",
    "user.read",
    "user.manage",
    "project_assignment.manage",
    "api_keys.manage",
    "workforce.employee.read",
    "workforce.employee.write",
    "workforce.condition.read",
    "workforce.condition.write",
    "workforce.link.read",
    "workforce.link.write",
  ],
  pm: [
    "project.read",
    "user.read",
    "workforce.employee.read",
    "workforce.employee.write",
    "workforce.condition.read",
    "workforce.condition.write",
    "workforce.link.read",
    "workforce.link.write",
  ],
  delivery_lead: [
    "project.read",
    "workforce.employee.read",
    "workforce.condition.read",
    "workforce.condition.write",
    "workforce.link.read",
    "workforce.link.write",
  ],
  executor: [
    "project.read",
    "workforce.employee.read",
    "workforce.condition.read",
    "workforce.link.read",
  ],
  viewer: [
    "project.read",
    "workforce.employee.read",
    "workforce.condition.read",
    "workforce.link.read",
  ],
};

const VALID_ROLES = new Set<Role>(Object.keys(ROLE_LEVELS) as Role[]);

function normalizeRole(value: unknown): Role | null {
  const role = String(value || "").trim().toLowerCase();
  if (!role || !VALID_ROLES.has(role as Role)) return null;
  return role as Role;
}

/**
 * Role-based access control middleware for multi-user support.
 *
 * Roles:
 *   - owner: full access
 *   - pm: broad operational access in assigned projects
 *   - delivery_lead: workforce management in assigned projects
 *   - executor: execution visibility in assigned projects
 *   - viewer: read-only visibility in assigned projects
 *
 * Fallback: sessions without user_id (env var auth) are treated as owner.
 */

/**
 * Returns the effective role for the current request.
 * - If authenticated via API key with admin scope, returns "owner".
 * - If authenticated via API key without admin scope, returns "pm".
 * - If user_role is set from the session JOIN, use that.
 * - If no user_id (legacy env var session), default to "owner".
 */
export function getEffectiveRole(request: RequestLike): Role {
  const explicitRole = normalizeRole(request.auth?.user_role);
  if (explicitRole) return explicitRole;

  if (request.apiKey) {
    const scopes = Array.isArray(request.apiKey?.scopes) ? request.apiKey.scopes : [];
    return scopes.includes("admin") ? "owner" : "pm";
  }

  // Legacy env-var sessions do not have user_id and should retain owner rights.
  if (!request.auth?.user_id) return "owner";

  // Safe fallback for authenticated DB users with missing role.
  return "pm";
}

export function hasPermission(role: Role, permission: Permission): boolean {
  const allowed = ROLE_PERMISSIONS[role];
  if (!allowed) return false;
  return allowed.includes(permission);
}

export function requirePermission(permission: Permission) {
  return async function checkPermission(request: RequestLike): Promise<void> {
    const role = getEffectiveRole(request);
    if (!hasPermission(role, permission)) {
      throw new ApiError(403, "permission_denied", `Missing permission: ${permission}`);
    }
  };
}

/**
 * Middleware: require a specific role (or higher).
 * Role hierarchy: owner > pm > delivery_lead > executor > viewer.
 * Usage: requireRole("owner") — only owners can access.
 */
export function requireRole(role: Role) {
  return async function checkRole(request: RequestLike): Promise<void> {
    const effectiveRole = getEffectiveRole(request);
    if ((ROLE_LEVELS[effectiveRole] || 0) < (ROLE_LEVELS[role] || 0)) {
      throw new ApiError(403, "forbidden", `This action requires ${role} role`);
    }
  };
}

/**
 * Check if a PM user has access to a specific project.
 * Owners always have access. PMs need a project_assignments record.
 */
export async function canAccessProject(
  pool: PoolLike,
  userId: string | null,
  userRole: Role,
  projectId: string
): Promise<boolean> {
  // Owners and legacy env var users (no userId) can access all projects.
  if (userRole === "owner" || !userId) return true;
  if (!projectId) return false;

  const { rows } = await pool.query(
    "SELECT 1 FROM project_assignments WHERE user_id = $1 AND project_id = $2 LIMIT 1",
    [userId, projectId]
  );
  return rows.length > 0;
}

/**
 * Middleware: enforce project-level access for the current request.
 * Uses the active_project_id from the session scope.
 * Owners pass through. PMs are checked against project_assignments.
 */
export function requireProjectAccess(pool: PoolLike) {
  return async function checkProjectAccess(request: RequestLike): Promise<void> {
    if (request.apiKey) return; // API keys have their own scope

    const userId = request.auth?.user_id || null;
    const userRole = getEffectiveRole(request);
    const projectId = request.auth?.active_project_id;

    if (!projectId) return; // No project selected yet — other middleware handles this

    const hasAccess = await canAccessProject(pool, userId, userRole, projectId);
    if (!hasAccess) {
      throw new ApiError(403, "project_access_denied", "You do not have access to this project");
    }
  };
}

/**
 * Get the list of project IDs a user can access.
 * Owners get null (meaning all projects). PMs get their assigned project IDs.
 */
export async function getAccessibleProjectIds(
  pool: PoolLike,
  userId: string | null,
  userRole: Role
): Promise<string[] | null> {
  if (userRole === "owner" || !userId) return null; // null = unrestricted

  const { rows } = await pool.query(
    "SELECT project_id::text FROM project_assignments WHERE user_id = $1",
    [userId]
  );
  return rows.map((r) => String(r.project_id));
}
