import type {
  Conversation,
  JobsStatusResponse,
  MessageSnippet,
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
      const message = typeof data === "object" && data && "error" in data ? String((data as { error?: string }).error) : `Request failed with status ${response.status}`;
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
