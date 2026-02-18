export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

// CSRF token stored in memory (populated from login/auth-me responses).
// Cookie is httpOnly so JS cannot read it directly.
let csrfTokenCache = "";

function buildRequestId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `req_${Date.now()}`;
  }
}

export async function apiFetch(path, options = {}) {
  const {
    method = "GET",
    body,
    timeoutMs = 15_000,
    headers = {},
  } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "x-request-id": buildRequestId(),
        ...(csrfTokenCache ? { "x-csrf-token": csrfTokenCache } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    // Capture CSRF token from auth responses
    if (data?.data?.csrf_token) {
      csrfTokenCache = data.data.csrf_token;
    }

    if (!response.ok) {
      const message = data?.error || `Request failed with status ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.payload = data;
      throw error;
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
}

export async function getCurrentSession() {
  return apiFetch("/auth/me");
}
