import pino from "pino";

export function createLogger(name) {
  return pino({
    name,
    level: process.env.LOG_LEVEL || "info",
  });
}
