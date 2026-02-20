export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

// CSRF token stored in memory (populated from login/auth-me responses).
// Cookie is httpOnly so JS cannot read it directly.
let csrfTokenCache = "";
let csrfRefreshPromise = null;

function buildRequestId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `req_${Date.now()}`;
  }
}

async function refreshCsrfToken() {
  if (csrfRefreshPromise) return csrfRefreshPromise;
  csrfRefreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        credentials: "include",
        headers: { "content-type": "application/json" },
      });
      const data = await response.json().catch(() => null);
      if (data?.csrf_token) csrfTokenCache = data.csrf_token;
      if (data?.data?.csrf_token) csrfTokenCache = data.data.csrf_token;
    } finally {
      csrfRefreshPromise = null;
    }
  })();
  return csrfRefreshPromise;
}

async function rawFetch(path, options) {
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
    if (data?.csrf_token) csrfTokenCache = data.csrf_token;
    if (data?.data?.csrf_token) csrfTokenCache = data.data.csrf_token;

    return { response, data };
  } finally {
    clearTimeout(timer);
  }
}

export async function apiFetch(path, options = {}) {
  const { _csrfRetried, ...opts } = options;
  const { response, data } = await rawFetch(path, opts);

  // On 403 with csrf_invalid, refresh token and retry once
  if (
    response.status === 403 &&
    !_csrfRetried &&
    (data?.error?.includes?.("csrf") || data?.code === "csrf_invalid")
  ) {
    await refreshCsrfToken();
    return apiFetch(path, { ...opts, _csrfRetried: true });
  }

  if (!response.ok) {
    const message = data?.error || `Request failed with status ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data;
}

export async function getCurrentSession() {
  // rawFetch already captures csrf_token from every response
  return apiFetch("/auth/me");
}
