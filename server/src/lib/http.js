function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export async function fetchWithRetry(url, options = {}) {
  const {
    retries = 2,
    timeoutMs = 15_000,
    backoffMs = 500,
    logger = console,
    ...fetchOptions
  } = options;

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
        await sleep(backoffMs * (attempt + 1));
        continue;
      }

      return response;
    } catch (error) {
      clearTimeout(timer);
      lastError = error;

      if (attempt >= retries) break;
      logger.warn({ url, attempt, retries, err: String(error?.message || error) }, "retrying fetch after error");
      await sleep(backoffMs * (attempt + 1));
    }
  }

  throw lastError || new Error("fetchWithRetry failed");
}
