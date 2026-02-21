import { describe, it } from "node:test";
import assert from "node:assert/strict";

// lightrag.js does not export internal helpers, so we re-implement them here
// to test the core logic that queryLightRag depends on.
// This approach validates the algorithm without needing a database.

function asText(value, max = 4000) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.slice(0, max);
}

function tokenizeQuery(query) {
  const source = asText(query, 4000).toLowerCase();
  if (!source) return [];
  const tokens = source
    .split(/[^a-zA-Zа-яА-Я0-9_]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3);
  const deduped = [];
  const seen = new Set();
  for (const token of tokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    deduped.push(token);
    if (deduped.length >= 6) break;
  }
  return deduped;
}

function sanitizeLike(text) {
  return String(text || "").replace(/[%\\_]/g, "");
}

function buildLikePatterns(query) {
  const tokens = tokenizeQuery(query);
  if (!tokens.length) {
    const fallback = sanitizeLike(asText(query, 300));
    return fallback ? [`%${fallback}%`] : [];
  }
  return tokens.map((token) => `%${sanitizeLike(token)}%`);
}

function lightragAnswer(query, chunkCount, messageCount, issueCount, opportunityCount) {
  const parts = [];
  parts.push(`Запрос: "${asText(query, 500)}".`);
  parts.push(`Найдено chunk-фрагментов: ${chunkCount}.`);
  parts.push(`Совпадений в сообщениях: ${messageCount}.`);
  parts.push(`Совпадений в задачах Linear: ${issueCount}.`);
  parts.push(`Совпадений в сделках/офферах: ${opportunityCount}.`);
  return parts.join(" ");
}

function buildEvidenceFromRows(rows, sourceType) {
  return rows.map((row) => ({
    source_type: sourceType,
    source_pk: row.id,
    source_ref: row.source_ref || null,
    title: row.title || row.name || null,
    snippet: row.snippet || null,
    created_at: row.created_at || row.updated_at || null,
    metadata: row.metadata || {},
  }));
}

describe("tokenizeQuery", () => {
  it("splits by non-alphanumeric characters", () => {
    const tokens = tokenizeQuery("hello world test");
    assert.deepStrictEqual(tokens, ["hello", "world", "test"]);
  });

  it("converts to lowercase", () => {
    assert.deepStrictEqual(tokenizeQuery("Hello WORLD"), ["hello", "world"]);
  });

  it("filters tokens shorter than 3 characters", () => {
    assert.deepStrictEqual(tokenizeQuery("hi an ok hello"), ["hello"]);
  });

  it("deduplicates tokens", () => {
    assert.deepStrictEqual(tokenizeQuery("hello hello world"), ["hello", "world"]);
  });

  it("limits to 6 tokens", () => {
    const result = tokenizeQuery("one two three four five six seven eight");
    assert.equal(result.length, 6);
  });

  it("handles Cyrillic text", () => {
    const result = tokenizeQuery("привет мир тест");
    assert.deepStrictEqual(result, ["привет", "мир", "тест"]);
  });

  it("handles mixed Cyrillic and Latin", () => {
    const result = tokenizeQuery("hello привет world мир");
    assert.deepStrictEqual(result, ["hello", "привет", "world", "мир"]);
  });

  it("returns empty for empty input", () => {
    assert.deepStrictEqual(tokenizeQuery(""), []);
    assert.deepStrictEqual(tokenizeQuery(null), []);
    assert.deepStrictEqual(tokenizeQuery(undefined), []);
  });

  it("returns empty for only short tokens", () => {
    assert.deepStrictEqual(tokenizeQuery("a b c"), []);
  });

  it("splits by special characters", () => {
    const result = tokenizeQuery("hello-world.test@email");
    assert.deepStrictEqual(result, ["hello", "world", "test", "email"]);
  });

  it("handles underscores as part of token", () => {
    const result = tokenizeQuery("hello_world test_case");
    assert.deepStrictEqual(result, ["hello_world", "test_case"]);
  });
});

describe("buildLikePatterns", () => {
  it("wraps tokens in ILIKE wildcards", () => {
    const result = buildLikePatterns("hello world");
    assert.deepStrictEqual(result, ["%hello%", "%world%"]);
  });

  it("falls back to full query when no tokens found", () => {
    const result = buildLikePatterns("ab");
    assert.deepStrictEqual(result, ["%ab%"]);
  });

  it("returns empty for empty query", () => {
    assert.deepStrictEqual(buildLikePatterns(""), []);
    assert.deepStrictEqual(buildLikePatterns(null), []);
  });

  it("strips wildcard characters from token patterns", () => {
    const result = buildLikePatterns("100%_match");
    assert.deepStrictEqual(result, ["%100%", "%match%"]);
    assert.equal(result.some((item) => item.includes("%_")), false);
  });

  it("strips wildcard characters in fallback mode", () => {
    const result = buildLikePatterns("%_");
    assert.deepStrictEqual(result, []);
  });
});

describe("lightragAnswer", () => {
  it("formats answer with all counts", () => {
    const answer = lightragAnswer("тестовый запрос", 5, 3, 2, 1);
    assert.ok(answer.includes('Запрос: "тестовый запрос"'));
    assert.ok(answer.includes("chunk-фрагментов: 5"));
    assert.ok(answer.includes("сообщениях: 3"));
    assert.ok(answer.includes("задачах Linear: 2"));
    assert.ok(answer.includes("сделках/офферах: 1"));
  });

  it("truncates long queries", () => {
    const longQuery = "a".repeat(600);
    const answer = lightragAnswer(longQuery, 0, 0, 0, 0);
    assert.ok(answer.length < 700);
  });

  it("handles zero counts", () => {
    const answer = lightragAnswer("test", 0, 0, 0, 0);
    assert.ok(answer.includes("chunk-фрагментов: 0"));
  });
});

describe("buildEvidenceFromRows", () => {
  it("maps rows to evidence format", () => {
    const rows = [
      { id: 1, source_ref: "ref1", title: "Title 1", snippet: "text", created_at: "2024-01-01" },
    ];
    const evidence = buildEvidenceFromRows(rows, "chatwoot_message");
    assert.equal(evidence.length, 1);
    assert.equal(evidence[0].source_type, "chatwoot_message");
    assert.equal(evidence[0].source_pk, 1);
    assert.equal(evidence[0].source_ref, "ref1");
    assert.equal(evidence[0].title, "Title 1");
    assert.equal(evidence[0].snippet, "text");
  });

  it("uses name when title is missing", () => {
    const rows = [{ id: 1, name: "Name 1" }];
    const evidence = buildEvidenceFromRows(rows, "test");
    assert.equal(evidence[0].title, "Name 1");
  });

  it("handles missing optional fields", () => {
    const rows = [{ id: 1 }];
    const evidence = buildEvidenceFromRows(rows, "test");
    assert.equal(evidence[0].source_ref, null);
    assert.equal(evidence[0].title, null);
    assert.equal(evidence[0].snippet, null);
    assert.equal(evidence[0].created_at, null);
    assert.deepStrictEqual(evidence[0].metadata, {});
  });

  it("handles empty rows", () => {
    assert.deepStrictEqual(buildEvidenceFromRows([], "test"), []);
  });

  it("preserves metadata when present", () => {
    const rows = [{ id: 1, metadata: { key: "value" } }];
    const evidence = buildEvidenceFromRows(rows, "test");
    assert.deepStrictEqual(evidence[0].metadata, { key: "value" });
  });
});
