import { fetchWithRetry } from "../lib/http.js";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

export async function createEmbeddings(inputs, logger = console) {
  const input = Array.isArray(inputs) ? inputs.map((x) => String(x || "").slice(0, 8_000)) : [];
  if (!input.length) return { model: process.env.EMBEDDING_MODEL || "text-embedding-3-small", embeddings: [] };

  const apiKey = requiredEnv("OPENAI_API_KEY");
  const model = process.env.EMBEDDING_MODEL || "text-embedding-3-small";

  const res = await fetchWithRetry("https://api.openai.com/v1/embeddings", {
    method: "POST",
    timeoutMs: 20_000,
    retries: 2,
    logger,
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ model, input }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`OpenAI embeddings failed ${res.status}: ${text.slice(0, 500)}`);

  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("OpenAI embeddings returned invalid JSON");
  }

  const data = Array.isArray(parsed?.data) ? parsed.data : [];
  const embeddings = data.map((row) => row?.embedding).filter((e) => Array.isArray(e));
  if (embeddings.length !== input.length) {
    throw new Error(`OpenAI embeddings count mismatch: got ${embeddings.length}, expected ${input.length}`);
  }

  return { model, embeddings };
}
