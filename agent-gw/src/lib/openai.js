// @ts-nocheck

import { safeJson } from "./util.js";
import { requireEnv } from "./security.js";

export async function openaiChatJsonObject(env, systemPrompt, userObj) {
  requireEnv(env, ["OPENAI_API_KEY"], "agent-gw");

  const body = {
    model: "gpt-4o-mini",
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(userObj) },
      { role: "user", content: "Верни ТОЛЬКО JSON-объект формата {\"items\": [...]}" },
    ],
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const txt = await res.text();
  if (!res.ok) throw new Error(`OpenAI chat ${res.status}: ${txt}`);

  const data = safeJson(txt);
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error(`OpenAI unexpected response: ${txt.slice(0, 500)}`);
  return content;
}

export function parseItemsRobust(respText) {
  let parsed = safeJson(respText);
  let items =
    (parsed && Array.isArray(parsed.items) && parsed.items) ||
    (parsed && parsed.schema && Array.isArray(parsed.schema.items) && parsed.schema.items) ||
    null;

  if (!items) {
    const m = respText.match(/\{[\s\S]*\}/);
    if (m) {
      const obj = safeJson(m[0]);
      items =
        (obj && Array.isArray(obj.items) && obj.items) ||
        (obj && obj.schema && Array.isArray(obj.schema.items) && obj.schema.items) ||
        null;
    }
  }

  return items;
}
