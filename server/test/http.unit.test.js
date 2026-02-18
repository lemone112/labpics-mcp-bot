import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fetchWithRetry } from "../src/lib/http.js";

const silentLogger = { warn: () => {}, info: () => {}, error: () => {} };

describe("fetchWithRetry", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns response on success", async () => {
    globalThis.fetch = async () => ({ status: 200, ok: true });

    const resp = await fetchWithRetry("http://example.com", { logger: silentLogger });
    assert.equal(resp.status, 200);
  });

  it("retries on 500 status", async () => {
    let attempts = 0;
    globalThis.fetch = async () => {
      attempts++;
      if (attempts < 3) return { status: 500, ok: false };
      return { status: 200, ok: true };
    };

    const resp = await fetchWithRetry("http://example.com", {
      retries: 3,
      backoffMs: 10,
      logger: silentLogger,
    });
    assert.equal(resp.status, 200);
    assert.equal(attempts, 3);
  });

  it("retries on 429 status", async () => {
    let attempts = 0;
    globalThis.fetch = async () => {
      attempts++;
      if (attempts < 2) return { status: 429, ok: false };
      return { status: 200, ok: true };
    };

    const resp = await fetchWithRetry("http://example.com", {
      retries: 2,
      backoffMs: 10,
      logger: silentLogger,
    });
    assert.equal(resp.status, 200);
    assert.equal(attempts, 2);
  });

  it("does not retry on 400 status", async () => {
    let attempts = 0;
    globalThis.fetch = async () => {
      attempts++;
      return { status: 400, ok: false };
    };

    const resp = await fetchWithRetry("http://example.com", {
      retries: 2,
      backoffMs: 10,
      logger: silentLogger,
    });
    assert.equal(resp.status, 400);
    assert.equal(attempts, 1);
  });

  it("retries on network error and throws after exhausting retries", async () => {
    let attempts = 0;
    globalThis.fetch = async () => {
      attempts++;
      throw new Error("network failure");
    };

    await assert.rejects(
      () =>
        fetchWithRetry("http://example.com", {
          retries: 2,
          backoffMs: 10,
          logger: silentLogger,
        }),
      { message: "network failure" }
    );
    assert.equal(attempts, 3); // initial + 2 retries
  });

  it("returns last retryable response when retries exhausted", async () => {
    let attempts = 0;
    globalThis.fetch = async () => {
      attempts++;
      return { status: 500, ok: false };
    };

    const resp = await fetchWithRetry("http://example.com", {
      retries: 1,
      backoffMs: 10,
      logger: silentLogger,
    });
    // On last attempt, non-retryable path returns the response
    assert.equal(resp.status, 500);
    assert.equal(attempts, 2);
  });

  it("respects timeout via AbortController", async () => {
    globalThis.fetch = async (_url, opts) => {
      return new Promise((_resolve, reject) => {
        const checkAbort = setInterval(() => {
          if (opts.signal?.aborted) {
            clearInterval(checkAbort);
            reject(opts.signal.reason || new Error("aborted"));
          }
        }, 5);
      });
    };

    await assert.rejects(
      () =>
        fetchWithRetry("http://example.com", {
          retries: 0,
          timeoutMs: 50,
          backoffMs: 10,
          logger: silentLogger,
        }),
      (err) => err instanceof Error
    );
  });

  it("retries on 408 Request Timeout status", async () => {
    let attempts = 0;
    globalThis.fetch = async () => {
      attempts++;
      if (attempts < 2) return { status: 408, ok: false };
      return { status: 200, ok: true };
    };

    const resp = await fetchWithRetry("http://example.com", {
      retries: 2,
      backoffMs: 10,
      logger: silentLogger,
    });
    assert.equal(resp.status, 200);
  });
});
