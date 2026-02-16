// @ts-nocheck

import { safeJson } from "./ui.js";

export function sbHeaders(env) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "content-type": "application/json",
    Prefer: "return=representation,resolution=merge-duplicates",
  };
}

export async function sbFetch(env, path, { method = "GET", body } = {}) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: sbHeaders(env),
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  const data = txt ? safeJson(txt) : null;
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${txt || "(empty body)"}`);
  return { data };
}

export async function upsertTelegramUser(env, from) {
  const row = {
    telegram_user_id: String(from.id),
    username: from.username || null,
    first_name: from.first_name || null,
    last_name: from.last_name || null,
  };
  await sbFetch(env, `/telegram_users?on_conflict=telegram_user_id`, { method: "POST", body: row });
}

export async function listProjects(env) {
  const { data } = await sbFetch(env, `/projects?select=project_id,name,status&order=created_at.desc`);
  return Array.isArray(data) ? data : [];
}

export async function getProject(env, projectId) {
  const { data } = await sbFetch(
    env,
    `/projects?select=project_id,name,status&project_id=eq.${encodeURIComponent(projectId)}&limit=1`
  );
  return Array.isArray(data) && data[0] ? data[0] : null;
}

export async function getActiveProjectId(env, telegramUserId) {
  const uid = String(telegramUserId);
  const { data } = await sbFetch(
    env,
    `/user_project_state?select=project_id&telegram_user_id=eq.${encodeURIComponent(uid)}&is_active=eq.true&limit=1`
  );
  return Array.isArray(data) && data[0] ? data[0].project_id : null;
}

export async function setActiveProject(env, telegramUserId, projectId) {
  const uid = String(telegramUserId);
  const now = new Date().toISOString();

  await sbFetch(env, `/user_project_state?telegram_user_id=eq.${encodeURIComponent(uid)}`, {
    method: "PATCH",
    body: { is_active: false, updated_at: now },
  });

  await sbFetch(
    env,
    `/user_project_state?telegram_user_id=eq.${encodeURIComponent(uid)}&project_id=eq.${encodeURIComponent(projectId)}`,
    {
      method: "PATCH",
      body: { is_active: true, last_used_at: now, updated_at: now },
    }
  );

  const { data } = await sbFetch(
    env,
    `/user_project_state?select=id&telegram_user_id=eq.${encodeURIComponent(uid)}&project_id=eq.${encodeURIComponent(projectId)}&limit=1`
  );

  if (!(Array.isArray(data) && data[0])) {
    await sbFetch(env, `/user_project_state`, {
      method: "POST",
      body: { telegram_user_id: uid, project_id: projectId, is_active: true, last_used_at: now, updated_at: now },
    });
  }
}

export async function getUserPendingInput(env, telegramUserId) {
  const uid = String(telegramUserId);
  const { data } = await sbFetch(
    env,
    `/user_input_state?select=kind,payload,expires_at&telegram_user_id=eq.${encodeURIComponent(uid)}&limit=1`
  );
  return Array.isArray(data) && data[0] ? data[0] : null;
}

export async function setUserPendingInput(env, telegramUserId, kind, payload = {}, ttlSeconds = 600) {
  const uid = String(telegramUserId);
  const row = {
    telegram_user_id: uid,
    kind,
    payload,
    expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  await sbFetch(env, `/user_input_state?on_conflict=telegram_user_id`, { method: "POST", body: row });
}

export async function clearUserPendingInput(env, telegramUserId) {
  const uid = String(telegramUserId);
  await sbFetch(env, `/user_input_state?telegram_user_id=eq.${encodeURIComponent(uid)}`, { method: "DELETE" });
}

export async function createProject(env, name) {
  const project_id = crypto.randomUUID();
  await sbFetch(env, `/projects?on_conflict=project_id`, {
    method: "POST",
    body: { project_id, name, status: "open", meta: {}, updated_at: new Date().toISOString() },
  });
  return project_id;
}

export async function loadProjectContext(env, projectId) {
  const [links, proj] = await Promise.all([
    sbFetch(
      env,
      `/project_links?select=source_system,external_type,external_id,meta&project_id=eq.${encodeURIComponent(projectId)}&limit=200`
    ).then((r) => r.data || []),
    getProject(env, projectId),
  ]);

  return { project: proj, links };
}

export async function getLinkCounts(env, projectId) {
  const { data } = await sbFetch(
    env,
    `/project_links?select=external_type&project_id=eq.${encodeURIComponent(projectId)}&limit=500`
  );
  const arr = Array.isArray(data) ? data : [];
  const count = (t) => arr.filter((x) => x.external_type === t).length;

  return {
    conversation: count("conversation"),
    person: count("person"),
    deal: count("deal"),
    company: count("company") > 0,
    linear_project: count("linear_project") > 0,
  };
}
