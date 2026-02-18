function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

// --- Circuit Breaker ---
// States: closed (normal) → open (failing, instant reject) → half-open (probe)
const CIRCUIT_CLOSED = "closed";
const CIRCUIT_OPEN = "open";
const CIRCUIT_HALF_OPEN = "half-open";

/**
 * Create a circuit breaker for a named service.
 * @param {string} name - service identifier (e.g. "chatwoot", "linear")
 * @param {{ failureThreshold?: number, resetTimeoutMs?: number, logger?: object }} opts
 */
export function createCircuitBreaker(name, opts = {}) {
  const {
    failureThreshold = 5,
    resetTimeoutMs = 30_000,
    logger = console,
  } = opts;

  let state = CIRCUIT_CLOSED;
  let failures = 0;
  let lastFailureAt = 0;

  function recordSuccess() {
    if (state === CIRCUIT_HALF_OPEN) {
      logger.info({ circuit: name }, "circuit breaker closed (recovered)");
    }
    state = CIRCUIT_CLOSED;
    failures = 0;
  }

  function recordFailure() {
    failures++;
    lastFailureAt = Date.now();
    if (failures >= failureThreshold && state === CIRCUIT_CLOSED) {
      state = CIRCUIT_OPEN;
      logger.warn({ circuit: name, failures }, "circuit breaker opened");
    }
  }

  function canRequest() {
    if (state === CIRCUIT_CLOSED) return true;
    if (state === CIRCUIT_OPEN) {
      if (Date.now() - lastFailureAt >= resetTimeoutMs) {
        state = CIRCUIT_HALF_OPEN;
        return true; // allow one probe request
      }
      return false;
    }
    // half-open: allow probe
    return true;
  }

  function getState() {
    return { name, state, failures, lastFailureAt };
  }

  return { recordSuccess, recordFailure, canRequest, getState };
}

// Registry of circuit breakers per host
const circuitBreakers = new Map();

function getCircuitBreaker(url, logger) {
  try {
    const host = new URL(url).host;
    if (!circuitBreakers.has(host)) {
      circuitBreakers.set(host, createCircuitBreaker(host, { logger }));
    }
    return circuitBreakers.get(host);
  } catch {
    return null;
  }
}

export async function fetchWithRetry(url, options = {}) {
  const {
    retries = 2,
    timeoutMs = 15_000,
    backoffMs = 500,
    logger = console,
    ...fetchOptions
  } = options;

  // Circuit breaker check
  const breaker = getCircuitBreaker(url, logger);
  if (breaker && !breaker.canRequest()) {
    const err = new Error(`Circuit breaker open for ${new URL(url).host}`);
    err.code = "CIRCUIT_OPEN";
    throw err;
  }

  let lastError = null;
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
        logger.warn({ url, status: response.status, attempt, retries }, "retrying fetch due to response status");
        if (breaker) breaker.recordFailure();
        await sleep(backoffMs * (attempt + 1));
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
      lastError = error;
      if (breaker) breaker.recordFailure();

      if (attempt >= retries) break;
      logger.warn({ url, attempt, retries, err: String(error?.message || error) }, "retrying fetch after error");
      await sleep(backoffMs * (attempt + 1));
    }
  }

  throw lastError || new Error("fetchWithRetry failed");
}

/** Get all circuit breaker states (for /metrics or debugging) */
export function getCircuitBreakerStates() {
  const result = [];
  for (const [, breaker] of circuitBreakers) {
    result.push(breaker.getState());
  }
  return result;
}

/** Reset all circuit breakers (for testing) */
export function resetCircuitBreakers() {
  circuitBreakers.clear();
}
