// @ts-nocheck

export async function hmacSha256Hex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function constantTimeEqual(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  const len = Math.max(left.length, right.length);

  let diff = left.length ^ right.length;
  for (let i = 0; i < len; i++) {
    const x = i < left.length ? left.charCodeAt(i) : 0;
    const y = i < right.length ? right.charCodeAt(i) : 0;
    diff |= x ^ y;
  }
  return diff === 0;
}

export function requireEnv(env, keys, ns = "agent-gw") {
  for (const k of keys) {
    if (!env[k]) throw new Error(`${k} missing in ${ns}`);
  }
}
