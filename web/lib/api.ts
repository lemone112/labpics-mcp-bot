import type {
  Commitment,
  Conversation,
  JobsStatusResponse,
  MessageSnippet,
  ProjectSourceLink,
  Project,
  ProjectsResponse,
  SearchResultItem,
  SessionInfo,
} from "@/lib/types";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

function buildRequestId() {
  try {
    return globalThis.crypto?.randomUUID() || `req_${Date.now()}`;
  } catch {
    return `req_${Date.now()}`;
  }
}

function humanizeError(errorCode: string) {
  const map: Record<string, string> = {
    unauthorized: "Session expired. Please sign in again.",
    invalid_credentials: "Invalid credentials.",
    active_project_required: "Select an active project in Projects first.",
    query_required: "Search query is required.",
    invalid_name: "Project name must be 2 to 160 characters long.",
    invalid_title: "Title must be between 3 and 300 characters.",
    invalid_status: "Invalid status value.",
    invalid_owner: "Invalid owner value.",
    invalid_confidence: "Invalid confidence value.",
    invalid_due_at: "Invalid due date format.",
    invalid_evidence: "Evidence must be an array of source IDs.",
    invalid_source_type: "Invalid source type.",
    invalid_source_external_id: "Invalid source external ID.",
    invalid_source_account_id: "Invalid source account ID.",
    source_account_mismatch: "Source account does not match configured Chatwoot account.",
    invalid_import_from_ts: "Invalid import_from timestamp.",
    invalid_link_id: "Invalid link ID.",
    link_not_found: "Link not found for selected project.",
    source_already_linked_to_other_project: "This source is already linked to another project.",
    commitment_not_found: "Commitment not found for selected project.",
    project_not_found: "Project not found.",
  };
  return map[errorCode] || errorCode;
}

function toQueryString(query?: Record<string, string | number | null | undefined>) {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

interface ApiFetchOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  timeoutMs?: number;
  headers?: Record<string, string>;
  query?: Record<string, string | number | null | undefined>;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { method = "GET", body, timeoutMs = 15_000, headers = {}, query } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);

  try {
    const response = await fetch(`${API_BASE}${path}${toQueryString(query)}`, {
      method,
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "x-request-id": buildRequestId(),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!response.ok) {
      const rawMessage =
        typeof data === "object" && data && "error" in data
          ? String((data as { error?: string }).error)
          : `Request failed with status ${response.status}`;
      const message = humanizeError(rawMessage);
      throw new ApiError(message, response.status, data);
    }

    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

export function getCurrentSession() {
  return apiFetch<SessionInfo>("/auth/me");
}

export function logout() {
  return apiFetch<{ ok: boolean; request_id?: string }>("/auth/logout", { method: "POST" });
}

export function login(payload: { username: string; password: string }) {
  return apiFetch<{ ok: boolean; username: string; active_project_id: string | null }>("/auth/login", {
    method: "POST",
    body: payload,
  });
}

export function getProjects() {
  return apiFetch<ProjectsResponse>("/projects");
}

export function createProject(name: string) {
  return apiFetch<{ ok: boolean; project: Project; request_id?: string }>("/projects", {
    method: "POST",
    body: { name },
  });
}

export function selectProject(projectId: string) {
  return apiFetch<{ ok: boolean; active_project_id: string; request_id?: string }>(`/projects/${projectId}/select`, {
    method: "POST",
  });
}

export function getJobsStatus() {
  return apiFetch<JobsStatusResponse>("/jobs/status");
}

export function runChatwootSync() {
  return apiFetch<{ ok: boolean; result?: Record<string, unknown>; request_id?: string }>("/jobs/chatwoot/sync", {
    method: "POST",
    timeoutMs: 60_000,
  });
}

export function runEmbeddingsJob() {
  return apiFetch<{ ok: boolean; result?: Record<string, unknown>; request_id?: string }>("/jobs/embeddings/run", {
    method: "POST",
    timeoutMs: 60_000,
  });
}

export function searchChunks(query: string, topK: number) {
  return apiFetch<{
    ok: boolean;
    query: string;
    topK: number;
    embedding_model: string;
    results: SearchResultItem[];
    search_config?: { ivfflat_probes: number; hnsw_ef_search: number };
  }>("/search", {
    method: "POST",
    body: { query, topK },
    timeoutMs: 25_000,
  });
}

export function getConversations(limit = 50) {
  return apiFetch<{ ok: boolean; conversations: Conversation[]; request_id?: string }>("/conversations", {
    query: { limit },
  });
}

export function getMessages(limit = 50, conversationGlobalId?: string) {
  return apiFetch<{ ok: boolean; messages: MessageSnippet[]; request_id?: string }>("/messages", {
    query: {
      limit,
      conversation_global_id: conversationGlobalId,
    },
  });
}

interface CommitmentPatch {
  title?: string;
  owner?: "studio" | "client" | "unknown";
  due_at?: string | null;
  status?: "active" | "proposed" | "closed" | "done" | "cancelled";
  confidence?: "high" | "medium" | "low";
  summary?: string | null;
  evidence?: string[];
}

export function getCommitments(status?: Commitment["status"], limit = 100) {
  return apiFetch<{ ok: boolean; commitments: Commitment[]; request_id?: string }>("/commitments", {
    query: { status, limit },
  });
}

export function createCommitment(payload: CommitmentPatch & { title: string }) {
  return apiFetch<{ ok: boolean; commitment: Commitment; request_id?: string }>("/commitments", {
    method: "POST",
    body: payload,
  });
}

export function updateCommitment(id: string, payload: CommitmentPatch) {
  return apiFetch<{ ok: boolean; commitment: Commitment; request_id?: string }>(`/commitments/${id}`, {
    method: "PATCH",
    body: payload,
  });
}

export function getProjectLinks(sourceType?: string) {
  return apiFetch<{ ok: boolean; links: ProjectSourceLink[]; request_id?: string }>("/project-links", {
    query: { source_type: sourceType },
  });
}

export function createProjectLink(payload: {
  source_type: string;
  source_account_id?: string;
  source_external_id: string;
  source_url?: string;
  metadata?: Record<string, unknown>;
}) {
  return apiFetch<{ ok: boolean; link: ProjectSourceLink; created: boolean; request_id?: string }>("/project-links", {
    method: "POST",
    body: payload,
  });
}

export function deleteProjectLink(id: string) {
  return apiFetch<{ ok: boolean; deleted_id: string; request_id?: string }>(`/project-links/${id}`, {
    method: "DELETE",
  });
}
