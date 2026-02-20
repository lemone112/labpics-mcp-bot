import type { Logger } from "../types/index.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

// --- Circuit Breaker ---
type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerState {
  name: string;
  state: CircuitState;
  failures: number;
  lastFailureAt: number;
}

export interface CircuitBreaker {
  recordSuccess(): void;
  recordFailure(): void;
  canRequest(): boolean;
  getState(): CircuitBreakerState;
}

interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeoutMs?: number;
  logger?: Logger | Console;
}

export function createCircuitBreaker(name: string, opts: CircuitBreakerOptions = {}): CircuitBreaker {
  const {
    failureThreshold = 5,
    resetTimeoutMs = 30_000,
    logger = console,
  } = opts;

  let state: CircuitState = "closed";
  let failures = 0;
  let lastFailureAt = 0;

  let probeInFlight = false;

  function recordSuccess(): void {
    if (state === "half-open") {
      logger.info({ circuit: name }, "circuit breaker closed (recovered)");
    }
    state = "closed";
    failures = 0;
    probeInFlight = false;
  }

  function recordFailure(): void {
    failures++;
    lastFailureAt = Date.now();
    probeInFlight = false;
    if (failures >= failureThreshold && state === "closed") {
      state = "open";
      logger.warn({ circuit: name, failures }, "circuit breaker opened");
    }
    if (state === "half-open") {
      state = "open";
      logger.warn({ circuit: name, failures }, "circuit breaker re-opened after half-open probe failure");
    }
  }

  function canRequest(): boolean {
    if (state === "closed") return true;
    if (state === "open") {
      if (Date.now() - lastFailureAt >= resetTimeoutMs) {
        state = "half-open";
        probeInFlight = true;
        return true;
      }
      return false;
    }
    // half-open: only allow the single probe request
    if (probeInFlight) return false;
    return true;
  }

  function getState(): CircuitBreakerState {
    return { name, state, failures, lastFailureAt };
  }

  return { recordSuccess, recordFailure, canRequest, getState };
}

const circuitBreakers = new Map<string, CircuitBreaker>();

function getCircuitBreaker(url: string, logger: Logger | Console): CircuitBreaker | null {
  try {
    const host = new URL(url).host;
    if (!circuitBreakers.has(host)) {
      circuitBreakers.set(host, createCircuitBreaker(host, { logger }));
    }
    return circuitBreakers.get(host)!;
  } catch {
    return null;
  }
}

interface FetchWithRetryOptions extends RequestInit {
  retries?: number;
  timeoutMs?: number;
  backoffMs?: number;
  logger?: Logger | Console;
}

export async function fetchWithRetry(url: string, options: FetchWithRetryOptions = {}): Promise<Response> {
  const {
    retries = 2,
    timeoutMs = 15_000,
    backoffMs = 500,
    logger = console,
    ...fetchOptions
  } = options;

  const breaker = getCircuitBreaker(url, logger);
  if (breaker && !breaker.canRequest()) {
    const err = new Error(`Circuit breaker open for ${new URL(url).host}`);
    (err as Error & { code: string }).code = "CIRCUIT_OPEN";
    throw err;
  }

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new Error("fetch timeout")), timeoutMs);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: ctrl.signal,
      });
      clearTimeout(timer);

      if (attempt < retries && shouldRetryStatus(response.status)) {
        let waitMs = backoffMs * (attempt + 1);
        if (response.status === 429) {
          const retryAfter = response.headers.get("retry-after");
          if (retryAfter) {
            const parsed = Number(retryAfter);
            waitMs = Number.isFinite(parsed)
              ? parsed * 1000
              : Math.max(0, new Date(retryAfter).getTime() - Date.now());
            waitMs = Math.min(Math.max(waitMs, 1000), 120_000);
          } else {
            waitMs = Math.min(2000 * Math.pow(2, attempt), 60_000);
          }
        }
        logger.warn({ url, status: response.status, attempt, retries, waitMs }, "retrying fetch due to response status");
        if (breaker) breaker.recordFailure();
        await sleep(waitMs);
        continue;
      }

      if (breaker) {
        if (response.ok || !shouldRetryStatus(response.status)) {
          breaker.recordSuccess();
        } else {
          breaker.recordFailure();
        }
      }

      return response;
    } catch (error) {
      clearTimeout(timer);
      lastError = error as Error;
      if (breaker) breaker.recordFailure();

      if (attempt >= retries) break;
      logger.warn({ url, attempt, retries, err: String((error as Error)?.message || error) }, "retrying fetch after error");
      await sleep(backoffMs * (attempt + 1));
    }
  }

  throw lastError || new Error("fetchWithRetry failed");
}

export function getCircuitBreakerStates(): CircuitBreakerState[] {
  const result: CircuitBreakerState[] = [];
  for (const [, breaker] of circuitBreakers) {
    result.push(breaker.getState());
  }
  return result;
}

export function resetCircuitBreakers(): void {
  circuitBreakers.clear();
}
