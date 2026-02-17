export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";
const CSRF_COOKIE_NAME = process.env.NEXT_PUBLIC_CSRF_COOKIE_NAME || "csrf_token";

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

  const csrfToken =
    typeof document !== "undefined"
      ? document.cookie
          .split(";")
          .map((row) => row.trim())
          .find((row) => row.startsWith(`${CSRF_COOKIE_NAME}=`))
          ?.slice(CSRF_COOKIE_NAME.length + 1) || ""
      : "";

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "x-request-id": buildRequestId(),
        ...(csrfToken ? { "x-csrf-token": decodeURIComponent(csrfToken) } : {}),
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
