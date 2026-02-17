export type ToastType = "info" | "success" | "error";

export interface SessionInfo {
  authenticated: boolean;
  username?: string;
  active_project_id?: string | null;
  created_at?: string;
  last_seen_at?: string;
  request_id?: string;
}

export interface Project {
  id: string;
  name: string;
  created_at: string;
}

export interface ProjectsResponse {
  ok: boolean;
  projects: Project[];
  active_project_id: string | null;
  request_id?: string;
}

export interface JobRun {
  id: number;
  job_name: string;
  status: "running" | "ok" | "failed" | string;
  started_at: string | null;
  finished_at: string | null;
  processed_count: number;
  error: string | null;
  meta?: Record<string, unknown>;
}

export interface JobsStatusResponse {
  ok: boolean;
  jobs: JobRun[];
  rag_counts: {
    pending: number;
    processing: number;
    ready: number;
    failed: number;
  };
  entities: {
    contacts: number;
    conversations: number;
    messages: number;
    rag_chunks: number;
  };
  storage: {
    database_bytes: number;
    budget_bytes: number;
    usage_percent: number;
    table_bytes: Record<string, number>;
  };
  watermarks: Array<{
    source: string;
    cursor_ts: string | null;
    cursor_id: string | null;
    updated_at: string;
    meta?: Record<string, unknown>;
  }>;
  request_id?: string;
}

export interface Conversation {
  id: number;
  account_id: number | null;
  conversation_id: number;
  contact_global_id: string | null;
  inbox_id: number | null;
  status: string | null;
  assignee_id: number | null;
  updated_at: string | null;
  created_at: string | null;
}

export interface MessageSnippet {
  id: number;
  conversation_global_id: string;
  contact_global_id: string | null;
  sender_type: string | null;
  private: boolean | null;
  content_snippet: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface SearchResultItem {
  id: string;
  conversation_global_id: string | null;
  message_global_id: string | null;
  chunk_index: number | null;
  text: string;
  created_at: string;
  distance: number | null;
}
