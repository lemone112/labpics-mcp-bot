import crypto from "node:crypto";
import type { Pool, ProjectScope } from "../../types/index.js";

interface IdentitySuggestionCandidate {
  left_entity_type: string;
  left_entity_id: string;
  right_entity_type: string;
  right_entity_id: string;
  confidence: number;
  reason: string;
  dedupe_key: string;
  evidence_refs: string[];
  meta: Record<string, unknown>;
}

interface ContactRow {
  id: string;
  name: string | null;
  email: string | null;
}

interface AttioAccountRow {
  id: string;
  external_id: string | null;
  name: string | null;
  domain: string | null;
}

interface LinearProjectRow {
  id: string;
  external_id: string | null;
  name: string | null;
}

interface IdentitySuggestionRow {
  id: string;
  left_entity_type: string;
  left_entity_id: string;
  right_entity_type: string;
  right_entity_id: string;
  confidence: number;
  reason: string;
  status: string;
  evidence_refs: string[] | null;
  meta: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface IdentityLinkRow {
  id: string;
  left_entity_type: string;
  left_entity_id: string;
  right_entity_type: string;
  right_entity_id: string;
  status: string;
  source: string;
  evidence_refs: string[] | null;
  created_by: string | null;
  created_at: string;
}

interface IdentitySuggestionListOptions {
  limit?: unknown;
  status?: unknown;
}

interface IdentityLinkListOptions {
  limit?: unknown;
  status?: unknown;
}

function similarityScore(a: unknown, b: unknown): number {
  const left = String(a || "")
    .trim()
    .toLowerCase();
  const right = String(b || "")
    .trim()
    .toLowerCase();
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.86;
  const leftWords = new Set(left.split(/[^\p{L}\p{N}]+/gu).filter(Boolean));
  const rightWords = new Set(right.split(/[^\p{L}\p{N}]+/gu).filter(Boolean));
  if (!leftWords.size || !rightWords.size) return 0;
  let overlap = 0;
  for (const word of leftWords) {
    if (rightWords.has(word)) overlap += 1;
  }
  return overlap / Math.max(leftWords.size, rightWords.size);
}

function dedupeKey(
  leftType: string,
  leftId: string,
  rightType: string,
  rightId: string
): string {
  const a = `${leftType}:${leftId}`;
  const b = `${rightType}:${rightId}`;
  const sorted = a <= b ? `${a}|${b}` : `${b}|${a}`;
  return crypto.createHash("sha1").update(sorted).digest("hex");
}

async function upsertSuggestions(
  pool: Pool,
  scope: ProjectScope,
  suggestions: IdentitySuggestionCandidate[]
): Promise<number> {
  if (!suggestions.length) return 0;
  const payload = suggestions.map((row) => ({
    project_id: scope.projectId,
    account_scope_id: scope.accountScopeId,
    left_entity_type: row.left_entity_type,
    left_entity_id: row.left_entity_id,
    right_entity_type: row.right_entity_type,
    right_entity_id: row.right_entity_id,
    confidence: row.confidence,
    reason: row.reason,
    status: "proposed",
    dedupe_key: row.dedupe_key,
    evidence_refs: row.evidence_refs || [],
    meta: row.meta || {},
  }));

  const result = await pool.query(
    `
      INSERT INTO identity_link_suggestions(
        project_id,
        account_scope_id,
        left_entity_type,
        left_entity_id,
        right_entity_type,
        right_entity_id,
        confidence,
        reason,
        status,
        dedupe_key,
        evidence_refs,
        meta,
        updated_at
      )
      SELECT
        x.project_id,
        x.account_scope_id,
        x.left_entity_type,
        x.left_entity_id,
        x.right_entity_type,
        x.right_entity_id,
        x.confidence,
        x.reason,
        x.status,
        x.dedupe_key,
        x.evidence_refs,
        x.meta,
        now()
      FROM jsonb_to_recordset($1::jsonb) AS x(
        project_id uuid,
        account_scope_id uuid,
        left_entity_type text,
        left_entity_id text,
        right_entity_type text,
        right_entity_id text,
        confidence numeric,
        reason text,
        status text,
        dedupe_key text,
        evidence_refs jsonb,
        meta jsonb
      )
      ON CONFLICT (project_id, dedupe_key)
      DO UPDATE SET
        confidence = GREATEST(identity_link_suggestions.confidence, EXCLUDED.confidence),
        reason = EXCLUDED.reason,
        evidence_refs = EXCLUDED.evidence_refs,
        meta = EXCLUDED.meta,
        updated_at = now()
      WHERE identity_link_suggestions.status = 'proposed'
    `,
    [JSON.stringify(payload)]
  );
  return result.rowCount || 0;
}

function domainFromEmail(email: unknown): string | null {
  const value = String(email || "")
    .trim()
    .toLowerCase();
  if (!value || !value.includes("@")) return null;
  return value.split("@")[1] || null;
}

export async function previewIdentitySuggestions(
  pool: Pool,
  scope: ProjectScope,
  limit: unknown = 100
): Promise<{
  generated: number;
  stored: number;
  suggestions: IdentitySuggestionCandidate[];
}> {
  const safeLimit =
    typeof limit === "number" && Number.isFinite(limit)
      ? Math.max(1, Math.min(limit, 200))
      : 100;
  const [contactsResult, attioResult, linearProjectsResult] = await Promise.all([
    pool.query<ContactRow>(
      `
        SELECT id, name, email
        FROM cw_contacts
        WHERE project_id = $1
          AND account_scope_id = $2
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 400
      `,
      [scope.projectId, scope.accountScopeId]
    ),
    pool.query<AttioAccountRow>(
      `
        SELECT id, external_id, name, domain
        FROM attio_accounts_raw
        WHERE project_id = $1
          AND account_scope_id = $2
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 400
      `,
      [scope.projectId, scope.accountScopeId]
    ),
    pool.query<LinearProjectRow>(
      `
        SELECT id, external_id, name
        FROM linear_projects_raw
        WHERE project_id = $1
          AND account_scope_id = $2
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 400
      `,
      [scope.projectId, scope.accountScopeId]
    ),
  ]);

  const suggestions: IdentitySuggestionCandidate[] = [];
  for (const contact of contactsResult.rows) {
    const contactName = String(contact.name || "").trim();
    const contactDomain = domainFromEmail(contact.email);
    for (const account of attioResult.rows) {
      const nameScore = similarityScore(contactName, account.name);
      const domainScore =
        contactDomain &&
        account.domain &&
        contactDomain === String(account.domain).toLowerCase()
          ? 1
          : 0;
      const score = Math.max(nameScore, domainScore * 0.95);
      if (score < 0.72) continue;
      const reason =
        domainScore > 0
          ? "matching_email_domain"
          : "matching_contact_account_name";
      suggestions.push({
        left_entity_type: "cw_contact",
        left_entity_id: contact.id,
        right_entity_type: "attio_account",
        right_entity_id: account.id,
        confidence: Number(score.toFixed(4)),
        reason,
        dedupe_key: dedupeKey("cw_contact", contact.id, "attio_account", account.id),
        evidence_refs: [contact.id, account.id],
        meta: {
          contact_name: contactName || null,
          account_name: account.name || null,
          contact_domain: contactDomain,
          account_domain: account.domain || null,
        },
      });
    }
  }

  for (const account of attioResult.rows) {
    for (const linearProject of linearProjectsResult.rows) {
      const score = similarityScore(account.name, linearProject.name);
      if (score < 0.65) continue;
      suggestions.push({
        left_entity_type: "attio_account",
        left_entity_id: account.id,
        right_entity_type: "linear_project",
        right_entity_id: linearProject.id,
        confidence: Number(score.toFixed(4)),
        reason: "matching_account_project_name",
        dedupe_key: dedupeKey(
          "attio_account",
          account.id,
          "linear_project",
          linearProject.id
        ),
        evidence_refs: [account.id, linearProject.id],
        meta: {
          account_name: account.name || null,
          linear_project_name: linearProject.name || null,
        },
      });
    }
  }

  suggestions.sort((a, b) => b.confidence - a.confidence);
  const unique: IdentitySuggestionCandidate[] = [];
  const seen = new Set<string>();
  for (const suggestion of suggestions) {
    if (seen.has(suggestion.dedupe_key)) continue;
    seen.add(suggestion.dedupe_key);
    unique.push(suggestion);
    if (unique.length >= safeLimit) break;
  }

  const stored = await upsertSuggestions(pool, scope, unique);
  return {
    generated: unique.length,
    stored,
    suggestions: unique,
  };
}

export async function listIdentitySuggestions(
  pool: Pool,
  scope: ProjectScope,
  options: IdentitySuggestionListOptions = {}
): Promise<IdentitySuggestionRow[]> {
  const limitRaw = Number.parseInt(String(options.limit || "50"), 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 200)) : 50;
  const status = String(options.status || "proposed").trim();
  const { rows } = await pool.query<IdentitySuggestionRow>(
    `
      SELECT
        id,
        left_entity_type,
        left_entity_id,
        right_entity_type,
        right_entity_id,
        confidence,
        reason,
        status,
        evidence_refs,
        meta,
        created_at,
        updated_at
      FROM identity_link_suggestions
      WHERE project_id = $1
        AND account_scope_id = $2
        AND ($3 = '' OR status = $3)
      ORDER BY confidence DESC, updated_at DESC
      LIMIT $4
    `,
    [scope.projectId, scope.accountScopeId, status === "all" ? "" : status, limit]
  );
  return rows;
}

export async function applyIdentitySuggestions(
  pool: Pool,
  scope: ProjectScope,
  suggestionIds: string[] = [],
  actorUsername: string | null = null
): Promise<{ applied: number; links: IdentityLinkRow[] }> {
  if (!Array.isArray(suggestionIds) || !suggestionIds.length) {
    return { applied: 0, links: [] };
  }

  const { rows } = await pool.query<
    Pick<
      IdentitySuggestionRow,
      | "id"
      | "left_entity_type"
      | "left_entity_id"
      | "right_entity_type"
      | "right_entity_id"
      | "confidence"
      | "evidence_refs"
    >
  >(
    `
      SELECT
        id,
        left_entity_type,
        left_entity_id,
        right_entity_type,
        right_entity_id,
        confidence,
        evidence_refs
      FROM identity_link_suggestions
      WHERE project_id = $1
        AND account_scope_id = $2
        AND id = ANY($3::uuid[])
        AND status = 'proposed'
    `,
    [scope.projectId, scope.accountScopeId, suggestionIds]
  );
  if (!rows.length) {
    return { applied: 0, links: [] };
  }

  const payload = rows.map((row) => ({
    project_id: scope.projectId,
    account_scope_id: scope.accountScopeId,
    left_entity_type: row.left_entity_type,
    left_entity_id: row.left_entity_id,
    right_entity_type: row.right_entity_type,
    right_entity_id: row.right_entity_id,
    status: "active",
    source: "suggestion",
    evidence_refs: row.evidence_refs || [],
    created_by: actorUsername,
  }));

  const inserted = await pool.query<IdentityLinkRow>(
    `
      INSERT INTO identity_links(
        project_id,
        account_scope_id,
        left_entity_type,
        left_entity_id,
        right_entity_type,
        right_entity_id,
        status,
        source,
        evidence_refs,
        created_by
      )
      SELECT
        x.project_id,
        x.account_scope_id,
        x.left_entity_type,
        x.left_entity_id,
        x.right_entity_type,
        x.right_entity_id,
        x.status,
        x.source,
        x.evidence_refs,
        x.created_by
      FROM jsonb_to_recordset($1::jsonb) AS x(
        project_id uuid,
        account_scope_id uuid,
        left_entity_type text,
        left_entity_id text,
        right_entity_type text,
        right_entity_id text,
        status text,
        source text,
        evidence_refs jsonb,
        created_by text
      )
      ON CONFLICT (project_id, left_entity_type, left_entity_id, right_entity_type, right_entity_id)
      DO UPDATE SET
        status = 'active',
        source = EXCLUDED.source,
        evidence_refs = EXCLUDED.evidence_refs,
        created_by = EXCLUDED.created_by
      RETURNING id, left_entity_type, left_entity_id, right_entity_type, right_entity_id, status, source, evidence_refs, created_at
    `,
    [JSON.stringify(payload)]
  );

  await pool.query(
    `
      UPDATE identity_link_suggestions
      SET status = 'applied',
          updated_at = now()
      WHERE project_id = $1
        AND account_scope_id = $2
        AND id = ANY($3::uuid[])
    `,
    [scope.projectId, scope.accountScopeId, rows.map((row) => row.id)]
  );

  return {
    applied: inserted.rowCount || 0,
    links: inserted.rows,
  };
}

export async function listIdentityLinks(
  pool: Pool,
  scope: ProjectScope,
  options: IdentityLinkListOptions = {}
): Promise<IdentityLinkRow[]> {
  const limitRaw = Number.parseInt(String(options.limit || "100"), 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 400)) : 100;
  const status = String(options.status || "active").trim();
  const { rows } = await pool.query<IdentityLinkRow>(
    `
      SELECT
        id,
        left_entity_type,
        left_entity_id,
        right_entity_type,
        right_entity_id,
        status,
        source,
        evidence_refs,
        created_by,
        created_at
      FROM identity_links
      WHERE project_id = $1
        AND account_scope_id = $2
        AND ($3 = '' OR status = $3)
      ORDER BY created_at DESC
      LIMIT $4
    `,
    [scope.projectId, scope.accountScopeId, status === "all" ? "" : status, limit]
  );
  return rows;
}
