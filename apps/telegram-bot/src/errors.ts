import type { NormalizedError, ErrorCategory } from "./safety/types";

export function normalizeError(e: unknown): NormalizedError {
  if (e instanceof Error) {
    return {
      category: categorize(e),
      code: "INTERNAL",
      message: e.message,
      details: e.stack,
      retryable: false,
    };
  }
  return {
    category: "UNKNOWN",
    code: "INTERNAL",
    message: String(e),
    retryable: false,
  };
}

function categorize(e: Error): ErrorCategory {
  const msg = e.message.toLowerCase();
  if (msg.includes("supabase") || msg.includes("database")) return "DB";
  if (msg.includes("composio") || msg.includes("telegram api")) return "UPSTREAM";
  if (msg.includes("missing env")) return "CONFIG";
  return "UNKNOWN";
}

export function formatUserError(err: NormalizedError): string {
  return [
    "Error",
    "",
    `Summary: ${err.code}`,
    `What happened: ${err.message}`,
    `Retry safe?: ${err.retryable ? "Yes" : "No"}`,
    "Next step: open Menu and try again.",
  ].join("\n");
}
