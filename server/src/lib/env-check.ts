import type { Logger } from "../types/index.js";

const REQUIRED = [
  "DATABASE_URL",
];

const RECOMMENDED = [
  "AUTH_CREDENTIALS",
  "OPENAI_API_KEY",
  "CORS_ORIGIN",
];

export function validateEnv(logger: Logger | Console = console): void {
  const missing = REQUIRED.filter((key) => !process.env[key]?.trim());
  const unset = RECOMMENDED.filter((key) => !process.env[key]?.trim());

  if (unset.length) {
    logger.warn({ vars: unset }, "recommended env vars not set — some features may be limited");
  }

  if (missing.length) {
    logger.error({ vars: missing }, "required env vars missing — cannot start");
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}
