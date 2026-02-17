import { fetchWithRetry } from "../lib/http.js";
import { toPositiveInt } from "../lib/chunking.js";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function sanitizeInput(text) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim().slice(0, 8_000);
  return normalized || " ";
}

function chunkArray(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function parseEmbeddingsResponse(text) {
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("OpenAI embeddings returned invalid JSON");
  }

  const data = Array.isArray(parsed?.data) ? parsed.data : [];
  return data.map((row) => row?.embedding).filter((embedding) => Array.isArray(embedding));
}

async function createEmbeddingsBatch({ apiKey, model, inputs, timeoutMs, logger }) {
  const res = await fetchWithRetry("https://api.openai.com/v1/embeddings", {
    method: "POST",
    timeoutMs,
    retries: 2,
    logger,
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ model, input: inputs }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`OpenAI embeddings failed (${res.status})`);
  }

  const embeddings = parseEmbeddingsResponse(text);
  if (embeddings.length !== inputs.length) {
    throw new Error(`OpenAI embeddings count mismatch: got ${embeddings.length}, expected ${inputs.length}`);
  }
  return embeddings;
}

export async function createEmbeddings(inputs, logger = console) {
  const input = Array.isArray(inputs) ? inputs.map(sanitizeInput) : [];
  const model = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
  if (!input.length) return { model, embeddings: [] };

  const apiKey = requiredEnv("OPENAI_API_KEY");
  const timeoutMs = toPositiveInt(process.env.OPENAI_TIMEOUT_MS, 20_000, 1_000, 120_000);
  const maxInputsPerRequest = toPositiveInt(process.env.OPENAI_EMBED_MAX_INPUTS, 100, 1, 100);
  const expectedDim = toPositiveInt(process.env.EMBEDDING_DIM, 1536, 128, 4096);

  const chunks = chunkArray(input, maxInputsPerRequest);
  const embeddings = [];
  for (const chunk of chunks) {
    const batchEmbeddings = await createEmbeddingsBatch({
      apiKey,
      model,
      inputs: chunk,
      timeoutMs,
      logger,
    });
    embeddings.push(...batchEmbeddings);
  }

  const wrongDim = embeddings.find((vector) => vector.length !== expectedDim);
  if (wrongDim) {
    throw new Error(`OpenAI embeddings dimension mismatch. Expected ${expectedDim}, got ${wrongDim.length}`);
  }

  return { model, embeddings };
}
