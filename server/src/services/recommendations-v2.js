import crypto from "node:crypto";

import { KAG_TEMPLATE_KEYS, buildSuggestedTemplate, generateTemplate } from "./templates/index.js";
import { findSimilarCases } from "./similarity.js";
import { failProcessRun, finishProcessRun, startProcessRun, warnProcess } from "./process-log.js";

function clampInt(value, fallback, min = 1, max = 500) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function toBoolean(value, fallback = false) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  return ["1", "true", "yes", "on"].includes(normalized);
}

function addDaysIso(now, days) {
  const base = now instanceof Date ? now : new Date(now);
  const next = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  return next.toISOString().slice(0, 10);
}

function hashColor(input) {
  const hash = crypto.createHash("sha1").update(String(input || "")).digest("hex");
  return `#${hash.slice(0, 6)}`;
}

function dedupeKey(category, payload = {}) {
  return crypto.createHash("sha1").update(`${category}:${JSON.stringify(payload)}`).digest("hex");
}

function indexBy(items = [], keyField) {
  const out = {};
  for (const item of items) {
    const key = item?.[keyField];
    if (!key) continue;
    out[key] = item;
  }
  return out;
}

function dedupeEvidence(refs = [], limit = 30) {
  const out = [];
  const seen = new Set();
  for (const ref of refs) {
    if (!ref || typeof ref !== "object") continue;
    const key = JSON.stringify(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
    if (out.length >= limit) break;
  }
  return out;
}

function evidenceToLinks(evidenceRefs = []) {
  const links = [];
  for (const ref of evidenceRefs) {
    if (ref?.doc_url) links.push(ref.doc_url);
    if (ref?.message_id) links.push(`chatwoot://message/${ref.message_id}`);
    if (ref?.linear_issue_id) links.push(`linear://issue/${ref.linear_issue_id}`);
    if (ref?.attio_record_id) links.push(`attio://record/${ref.attio_record_id}`);
  }
  return [...new Set(links)].slice(0, 20);
}

function evidenceSourceSet(evidenceRefs = []) {
  const out = new Set();
  for (const ref of evidenceRefs) {
    if (!ref || typeof ref !== "object") continue;
    if (ref.message_id) out.add("message");
    if (ref.linear_issue_id) out.add("linear");
    if (ref.attio_record_id) out.add("attio");
    if (ref.doc_url) out.add("doc");
    if (ref.rag_chunk_id) out.add("rag");
  }
  return out;
}

export function evidenceGatePolicy() {
  return {
    minCount: clampInt(process.env.RECOMMENDATIONS_EVIDENCE_MIN_COUNT, 2, 1, 20),
    minQuality: clamp(Number(process.env.RECOMMENDATIONS_EVIDENCE_MIN_QUALITY || 0.35), 0, 1),
    requirePrimary:
      !toBoolean(process.env.RECOMMENDATIONS_EVIDENCE_ALLOW_SECONDARY_ONLY, false),
  };
}

export function computeEvidenceGate(evidenceRefs = [], policy = evidenceGatePolicy()) {
  const refs = Array.isArray(evidenceRefs) ? evidenceRefs : [];
  const sourceSet = evidenceSourceSet(refs);
  const countScore = clamp(refs.length / Math.max(1, policy.minCount * 2), 0, 1);
  const diversityScore = clamp(sourceSet.size / 3, 0, 1);
  const primaryPresent = sourceSet.has("message") || sourceSet.has("linear") || sourceSet.has("attio") || sourceSet.has("doc");
  const primaryScore = primaryPresent ? 1 : 0;
  const quality = clamp(Number((0.5 * countScore + 0.35 * diversityScore + 0.15 * primaryScore).toFixed(4)), 0, 1);

  if (refs.length < policy.minCount) {
    return {
      evidence_count: refs.length,
      evidence_quality_score: quality,
      evidence_gate_status: "hidden",
      evidence_gate_reason: `insufficient_evidence_count_${refs.length}_lt_${policy.minCount}`,
    };
  }
  if (policy.requirePrimary && !primaryPresent) {
    return {
      evidence_count: refs.length,
      evidence_quality_score: quality,
      evidence_gate_status: "hidden",
      evidence_gate_reason: "missing_primary_source",
    };
  }
  if (quality < policy.minQuality) {
    return {
      evidence_count: refs.length,
      evidence_quality_score: quality,
      evidence_gate_status: "hidden",
      evidence_gate_reason: `low_evidence_quality_${quality}_lt_${policy.minQuality}`,
    };
  }
  return {
    evidence_count: refs.length,
    evidence_quality_score: quality,
    evidence_gate_status: "visible",
    evidence_gate_reason: null,
  };
}

function scoreValue(scoresMap, scoreType) {
  return Number(scoresMap?.[scoreType]?.score || 0);
}

function signalValue(signalsMap, signalKey) {
  return Number(signalsMap?.[signalKey]?.value || 0);
}

function forecastByType(forecasts = []) {
  const out = {};
  for (const item of forecasts) {
    out[item.risk_type] = item;
  }
  return out;
}

function recommendationEnvelope(rec) {
  return {
    category: rec.category,
    priority: rec.priority,
    due_date: rec.due_date,
    owner_role: rec.owner_role,
    status: "new",
    title: rec.title,
    rationale: rec.rationale,
    why_now: rec.why_now,
    expected_impact: rec.expected_impact,
    evidence_refs: rec.evidence_refs,
    links: rec.links,
    suggested_template_key: rec.suggested_template_key,
    suggested_template: rec.suggested_template,
    signal_snapshot: rec.signal_snapshot || {},
    forecast_snapshot: rec.forecast_snapshot || {},
    dedupe_key: rec.dedupe_key,
    evidence_count: Number(rec.evidence_count || 0),
    evidence_quality_score: Number(rec.evidence_quality_score || 0),
    evidence_gate_status: String(rec.evidence_gate_status || "hidden"),
    evidence_gate_reason: rec.evidence_gate_reason || null,
  };
}

function buildTopNTemplateGenerator(llmGenerateTemplate, topN = 3) {
  if (typeof llmGenerateTemplate !== "function") return null;
  let used = 0;
  const safeTopN = clampInt(topN, 3, 0, 50);
  return async ({ templateKey, variables = {}, fallback = "" }) => {
    if (used >= safeTopN) return fallback;
    used += 1;
    return llmGenerateTemplate({ templateKey, variables, fallback });
  };
}

export async function generateRecommendationsV2FromInputs({
  signals = [],
  scores = [],
  forecasts = [],
  similarCases = [],
  now = new Date(),
  llmGenerateTemplate = null,
  context = {},
  return_meta = false,
}) {
  const signalMap = indexBy(signals, "signal_key");
  const scoreMap = indexBy(scores, "score_type");
  const forecastMap = forecastByType(forecasts);
  const gatePolicy = evidenceGatePolicy();
  const recs = [];

  const waitingSignal = signalMap.waiting_on_client_days;
  const clientForecast = forecastMap.client_risk;
  const waitingEvidence = dedupeEvidence([
    ...(waitingSignal?.evidence_refs || []),
    ...(clientForecast?.evidence_refs || []),
  ]);
  if (
    waitingEvidence.length > 0 &&
    (signalValue(signalMap, "waiting_on_client_days") >= 2 || Number(clientForecast?.probability_7d || 0) >= 0.45)
  ) {
    const template = await generateTemplate({
      templateKey: KAG_TEMPLATE_KEYS.WAITING,
      variables: {
        client_name: context.client_name || "коллеги",
        stage_name: context.stage_name || "текущий этап",
        waiting_days: signalValue(signalMap, "waiting_on_client_days").toFixed(1),
      },
      llmGenerateTemplate,
    });
    recs.push(
      recommendationEnvelope({
        category: "waiting_on_client",
        priority: Number(clientForecast?.probability_7d || 0) > 0.65 ? 5 : 4,
        due_date: addDaysIso(now, 1),
        owner_role: "pm",
        title: "Follow-up по клиентскому апруву",
        rationale: `Ожидание клиента ${signalValue(signalMap, "waiting_on_client_days").toFixed(1)} дн.`,
        why_now: `P(client_risk,7d)=${Number(clientForecast?.probability_7d || 0).toFixed(2)}.`,
        expected_impact: "Снижение client risk, ускорение перехода к следующему этапу.",
        evidence_refs: waitingEvidence,
        links: evidenceToLinks(waitingEvidence),
        suggested_template_key: KAG_TEMPLATE_KEYS.WAITING,
        suggested_template: template,
        signal_snapshot: { waiting_on_client_days: waitingSignal },
        forecast_snapshot: { client_risk: clientForecast },
        dedupe_key: dedupeKey("waiting_on_client", {
          waiting_days: signalValue(signalMap, "waiting_on_client_days").toFixed(1),
          p7: Number(clientForecast?.probability_7d || 0).toFixed(2),
        }),
        ...computeEvidenceGate(waitingEvidence, gatePolicy),
      })
    );
  }

  const scopeSignal = signalMap.scope_creep_rate;
  const scopeForecast = forecastMap.scope_risk;
  const scopeEvidence = dedupeEvidence([...(scopeSignal?.evidence_refs || []), ...(scopeForecast?.evidence_refs || [])]);
  if (
    scopeEvidence.length > 0 &&
    (signalValue(signalMap, "scope_creep_rate") >= 0.2 || Number(scopeForecast?.probability_14d || 0) >= 0.5)
  ) {
    const template = await generateTemplate({
      templateKey: KAG_TEMPLATE_KEYS.SCOPE_CREEP,
      variables: {
        client_name: context.client_name || "коллеги",
        out_of_scope_count: Math.max(1, Number(scopeSignal?.details?.scope_requests_7d || 0)),
      },
      llmGenerateTemplate,
    });
    recs.push(
      recommendationEnvelope({
        category: "scope_creep_change_request",
        priority: Number(scopeForecast?.probability_7d || 0) > 0.6 ? 5 : 4,
        due_date: addDaysIso(now, 2),
        owner_role: "pm",
        title: "Оформить Change Request",
        rationale: `Scope creep rate=${signalValue(signalMap, "scope_creep_rate").toFixed(2)}.`,
        why_now: `P(scope_risk,14d)=${Number(scopeForecast?.probability_14d || 0).toFixed(2)}.`,
        expected_impact: "Контроль объёма работ и предсказуемость сроков.",
        evidence_refs: scopeEvidence,
        links: evidenceToLinks(scopeEvidence),
        suggested_template_key: KAG_TEMPLATE_KEYS.SCOPE_CREEP,
        suggested_template: template,
        signal_snapshot: { scope_creep_rate: scopeSignal },
        forecast_snapshot: { scope_risk: scopeForecast },
        dedupe_key: dedupeKey("scope_creep_change_request", {
          scope_rate: signalValue(signalMap, "scope_creep_rate").toFixed(2),
          p14: Number(scopeForecast?.probability_14d || 0).toFixed(2),
        }),
        ...computeEvidenceGate(scopeEvidence, gatePolicy),
      })
    );
  }

  const deliveryForecast = forecastMap.delivery_risk;
  const blockersSignal = signalMap.blockers_age;
  const stageSignal = signalMap.stage_overdue;
  const deliveryEvidence = dedupeEvidence([
    ...(blockersSignal?.evidence_refs || []),
    ...(stageSignal?.evidence_refs || []),
    ...(deliveryForecast?.evidence_refs || []),
  ]);
  if (
    deliveryEvidence.length > 0 &&
    (Number(deliveryForecast?.probability_7d || 0) >= 0.45 || signalValue(signalMap, "blockers_age") > 5)
  ) {
    const template = await generateTemplate({
      templateKey: KAG_TEMPLATE_KEYS.DELIVERY,
      variables: {
        project_name: context.project_name || "проект",
        blockers_count: Number(blockersSignal?.details?.open_blockers || 0),
        blockers_age_days: signalValue(signalMap, "blockers_age").toFixed(1),
        stage_overdue_days: signalValue(signalMap, "stage_overdue").toFixed(1),
      },
      llmGenerateTemplate,
    });
    recs.push(
      recommendationEnvelope({
        category: "delivery_risk",
        priority: Number(deliveryForecast?.probability_7d || 0) >= 0.7 ? 5 : 4,
        due_date: addDaysIso(now, 1),
        owner_role: "pm",
        title: "Эскалировать delivery-risk и перепланировать",
        rationale: `P(delivery_risk,7d)=${Number(deliveryForecast?.probability_7d || 0).toFixed(2)}.`,
        why_now: `Ожидаемое время до риска ≈ ${Number(deliveryForecast?.expected_time_to_risk_days || 0).toFixed(1)} дн.`,
        expected_impact: "Снижение вероятности срыва этапа и дедлайна.",
        evidence_refs: deliveryEvidence,
        links: evidenceToLinks(deliveryEvidence),
        suggested_template_key: KAG_TEMPLATE_KEYS.DELIVERY,
        suggested_template: template,
        signal_snapshot: { blockers_age: blockersSignal, stage_overdue: stageSignal },
        forecast_snapshot: { delivery_risk: deliveryForecast },
        dedupe_key: dedupeKey("delivery_risk", {
          p7: Number(deliveryForecast?.probability_7d || 0).toFixed(2),
          blockers_age: signalValue(signalMap, "blockers_age").toFixed(1),
        }),
        ...computeEvidenceGate(deliveryEvidence, gatePolicy),
      })
    );
  }

  const financeForecast = forecastMap.finance_risk;
  const burnSignal = signalMap.budget_burn_rate;
  const marginSignal = signalMap.margin_risk;
  const financeEvidence = dedupeEvidence([
    ...(burnSignal?.evidence_refs || []),
    ...(marginSignal?.evidence_refs || []),
    ...(financeForecast?.evidence_refs || []),
  ]);
  if (
    financeEvidence.length > 0 &&
    (Number(financeForecast?.probability_7d || 0) >= 0.45 || signalValue(signalMap, "budget_burn_rate") >= 1.2)
  ) {
    const template = await generateTemplate({
      templateKey: KAG_TEMPLATE_KEYS.FINANCE,
      variables: {
        client_name: context.client_name || "коллеги",
        burn_rate: signalValue(signalMap, "budget_burn_rate").toFixed(2),
        margin_risk_pct: (signalValue(signalMap, "margin_risk") * 100).toFixed(1),
      },
      llmGenerateTemplate,
    });
    recs.push(
      recommendationEnvelope({
        category: "finance_risk",
        priority: Number(financeForecast?.probability_7d || 0) >= 0.7 ? 5 : 4,
        due_date: addDaysIso(now, 2),
        owner_role: "finance_lead",
        title: "Пересчитать маржу и инициировать renegotiation",
        rationale: `Burn=${signalValue(signalMap, "budget_burn_rate").toFixed(2)}x, margin risk=${(signalValue(signalMap, "margin_risk") * 100).toFixed(1)}%.`,
        why_now: `P(finance_risk,14d)=${Number(financeForecast?.probability_14d || 0).toFixed(2)}.`,
        expected_impact: "Стабилизация unit economics и снижение риска перерасхода.",
        evidence_refs: financeEvidence,
        links: evidenceToLinks(financeEvidence),
        suggested_template_key: KAG_TEMPLATE_KEYS.FINANCE,
        suggested_template: template,
        signal_snapshot: { budget_burn_rate: burnSignal, margin_risk: marginSignal },
        forecast_snapshot: { finance_risk: financeForecast },
        dedupe_key: dedupeKey("finance_risk", {
          burn: signalValue(signalMap, "budget_burn_rate").toFixed(2),
          p14: Number(financeForecast?.probability_14d || 0).toFixed(2),
        }),
        ...computeEvidenceGate(financeEvidence, gatePolicy),
      })
    );
  }

  const upsellSignal = scoreValue(scoreMap, "upsell_likelihood");
  const upsellEvidence = dedupeEvidence([
    ...(signalMap.scope_creep_rate?.evidence_refs || []),
    ...(signalMap.waiting_on_client_days?.evidence_refs || []),
    ...(clientForecast?.evidence_refs || []),
  ]);
  if (upsellEvidence.length > 0 && upsellSignal >= 65 && Number(clientForecast?.probability_30d || 0) < 0.75) {
    const template = await generateTemplate({
      templateKey: KAG_TEMPLATE_KEYS.UPSELL,
      variables: {
        client_name: context.client_name || "коллеги",
        need_signal: "выявлены признаки дополнительной потребности",
        expected_value: "рост скорости поставки и бизнес-эффекта",
      },
      llmGenerateTemplate,
    });
    recs.push(
      recommendationEnvelope({
        category: "upsell_opportunity",
        priority: upsellSignal >= 80 ? 5 : 4,
        due_date: addDaysIso(now, 3),
        owner_role: "account_manager",
        title: "Подготовить upsell offer",
        rationale: `Upsell likelihood=${upsellSignal.toFixed(1)}.`,
        why_now: `Есть окно для расширения при P(client_risk,30d)=${Number(clientForecast?.probability_30d || 0).toFixed(2)}.`,
        expected_impact: "Рост LTV и закрепление value через доп. решение.",
        evidence_refs: upsellEvidence,
        links: evidenceToLinks(upsellEvidence),
        suggested_template_key: KAG_TEMPLATE_KEYS.UPSELL,
        suggested_template: template,
        signal_snapshot: { scope_creep_rate: scopeSignal },
        forecast_snapshot: { client_risk: clientForecast },
        dedupe_key: dedupeKey("upsell_opportunity", {
          upsell: upsellSignal.toFixed(1),
          p30: Number(clientForecast?.probability_30d || 0).toFixed(2),
        }),
        ...computeEvidenceGate(upsellEvidence, gatePolicy),
      })
    );
  }

  const winbackEvidence = dedupeEvidence(
    similarCases.flatMap((item) =>
      (item.outcomes_seen || [])
        .filter((outcome) => String(outcome.outcome_type || "").includes("client"))
        .flatMap((outcome) => outcome.evidence_refs || [])
    )
  );
  if (winbackEvidence.length > 0 && Number(clientForecast?.probability_14d || 0) >= 0.65) {
    const template = buildSuggestedTemplate(KAG_TEMPLATE_KEYS.UPSELL, {
      client_name: context.client_name || "коллеги",
      need_signal: "есть риск охлаждения клиента",
      expected_value: "возврат фокуса на ценность и удержание",
    });
    recs.push(
      recommendationEnvelope({
        category: "winback",
        priority: 5,
        due_date: addDaysIso(now, 1),
        owner_role: "account_manager",
        title: "Запустить winback-интервенцию",
        rationale: "По похожим кейсам наблюдался рост client risk с последующим churn сигналом.",
        why_now: `P(client_risk,14d)=${Number(clientForecast?.probability_14d || 0).toFixed(2)} и есть подтверждающие паттерны.`,
        expected_impact: "Снижение вероятности churn и сохранение проекта в активной фазе.",
        evidence_refs: winbackEvidence,
        links: evidenceToLinks(winbackEvidence),
        suggested_template_key: KAG_TEMPLATE_KEYS.UPSELL,
        suggested_template: template,
        signal_snapshot: { waiting_on_client_days: waitingSignal },
        forecast_snapshot: { client_risk: clientForecast },
        dedupe_key: dedupeKey("winback", {
          p14: Number(clientForecast?.probability_14d || 0).toFixed(2),
        }),
        ...computeEvidenceGate(winbackEvidence, gatePolicy),
      })
    );
  }

  const publishable = recs
    .filter((item) => Array.isArray(item.evidence_refs) && item.evidence_refs.length > 0)
    .sort((a, b) => b.priority - a.priority);
  if (return_meta) {
    return {
      recommendations: publishable,
      dropped_without_evidence: Math.max(0, recs.length - publishable.length),
      generated_total: recs.length,
    };
  }
  return publishable;
}

async function fetchSignals(pool, scope) {
  const { rows } = await pool.query(
    `
      SELECT signal_key, value, status, details, evidence_refs
      FROM kag_signals
      WHERE project_id = $1
        AND account_scope_id = $2
    `,
    [scope.projectId, scope.accountScopeId]
  );
  return rows;
}

async function fetchScores(pool, scope) {
  const { rows } = await pool.query(
    `
      SELECT score_type, score, level, factors, evidence_refs
      FROM kag_scores
      WHERE project_id = $1
        AND account_scope_id = $2
    `,
    [scope.projectId, scope.accountScopeId]
  );
  return rows;
}

async function fetchForecasts(pool, scope) {
  const { rows } = await pool.query(
    `
      SELECT
        risk_type,
        probability_7d,
        probability_14d,
        probability_30d,
        expected_time_to_risk_days,
        confidence,
        top_drivers,
        similar_cases,
        evidence_refs,
        generated_at
      FROM kag_risk_forecasts
      WHERE project_id = $1
        AND account_scope_id = $2
        AND publishable = true
    `,
    [scope.projectId, scope.accountScopeId]
  );
  return rows;
}

async function fetchProjectContext(pool, scope) {
  const [projectRow, accountRow] = await Promise.all([
    pool.query(
      `
        SELECT id, name
        FROM projects
        WHERE id = $1
        LIMIT 1
      `,
      [scope.projectId]
    ),
    pool.query(
      `
        SELECT name
        FROM crm_accounts
        WHERE project_id = $1
          AND account_scope_id = $2
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [scope.projectId, scope.accountScopeId]
    ),
  ]);
  return {
    project_name: projectRow.rows[0]?.name || "project",
    client_name: accountRow.rows[0]?.name || "client",
  };
}

async function upsertRecommendationsV2(pool, scope, recommendations = []) {
  if (!recommendations.length) return 0;
  const payload = recommendations.map((item) => ({
    category: item.category,
    priority: item.priority,
    due_date: item.due_date || null,
    owner_role: item.owner_role || null,
    status: item.status || "new",
    title: String(item.title || "").slice(0, 500),
    rationale: String(item.rationale || "").slice(0, 4000),
    why_now: String(item.why_now || "").slice(0, 2000) || null,
    expected_impact: String(item.expected_impact || "").slice(0, 2000) || null,
    evidence_refs: item.evidence_refs || [],
    links: item.links || [],
    suggested_template_key: String(item.suggested_template_key || "").slice(0, 200),
    suggested_template: String(item.suggested_template || "").slice(0, 12000),
    signal_snapshot: item.signal_snapshot || {},
    forecast_snapshot: item.forecast_snapshot || {},
    dedupe_key: String(item.dedupe_key || "").slice(0, 200),
    evidence_count: clampInt(item.evidence_count, 0, 0, 1000),
    evidence_quality_score: clamp(Number(item.evidence_quality_score || 0), 0, 1),
    evidence_gate_status: String(item.evidence_gate_status || "hidden"),
    evidence_gate_reason: item.evidence_gate_reason ? String(item.evidence_gate_reason).slice(0, 200) : null,
  }));

  const result = await pool.query(
    `
      INSERT INTO recommendations_v2(
        project_id,
        account_scope_id,
        category,
        priority,
        due_date,
        owner_role,
        status,
        title,
        rationale,
        why_now,
        expected_impact,
        evidence_refs,
        links,
        suggested_template_key,
        suggested_template,
        signal_snapshot,
        forecast_snapshot,
        dedupe_key,
        evidence_count,
        evidence_quality_score,
        evidence_gate_status,
        evidence_gate_reason,
        updated_at
      )
      SELECT
        $1::uuid,
        $2::uuid,
        x.category,
        x.priority,
        x.due_date::date,
        x.owner_role,
        x.status,
        x.title,
        x.rationale,
        x.why_now,
        x.expected_impact,
        x.evidence_refs,
        x.links,
        x.suggested_template_key,
        x.suggested_template,
        x.signal_snapshot,
        x.forecast_snapshot,
        x.dedupe_key,
        x.evidence_count,
        x.evidence_quality_score,
        x.evidence_gate_status,
        x.evidence_gate_reason,
        now()
      FROM jsonb_to_recordset($3::jsonb) AS x(
        category text,
        priority int,
        due_date text,
        owner_role text,
        status text,
        title text,
        rationale text,
        why_now text,
        expected_impact text,
        evidence_refs jsonb,
        links jsonb,
        suggested_template_key text,
        suggested_template text,
        signal_snapshot jsonb,
        forecast_snapshot jsonb,
        dedupe_key text,
        evidence_count int,
        evidence_quality_score numeric,
        evidence_gate_status text,
        evidence_gate_reason text
      )
      ON CONFLICT (project_id, dedupe_key)
      DO UPDATE SET
        account_scope_id = EXCLUDED.account_scope_id,
        category = EXCLUDED.category,
        priority = EXCLUDED.priority,
        due_date = EXCLUDED.due_date,
        owner_role = EXCLUDED.owner_role,
        status = CASE
          WHEN recommendations_v2.status IN ('done', 'dismissed') THEN recommendations_v2.status
          ELSE EXCLUDED.status
        END,
        title = EXCLUDED.title,
        rationale = EXCLUDED.rationale,
        why_now = EXCLUDED.why_now,
        expected_impact = EXCLUDED.expected_impact,
        evidence_refs = EXCLUDED.evidence_refs,
        links = EXCLUDED.links,
        suggested_template_key = EXCLUDED.suggested_template_key,
        suggested_template = EXCLUDED.suggested_template,
        signal_snapshot = EXCLUDED.signal_snapshot,
        forecast_snapshot = EXCLUDED.forecast_snapshot,
        evidence_count = EXCLUDED.evidence_count,
        evidence_quality_score = EXCLUDED.evidence_quality_score,
        evidence_gate_status = EXCLUDED.evidence_gate_status,
        evidence_gate_reason = EXCLUDED.evidence_gate_reason,
        updated_at = now()
    `,
    [scope.projectId, scope.accountScopeId, JSON.stringify(payload)]
  );
  return result.rowCount || 0;
}

export async function refreshRecommendationsV2(pool, scope, options = {}) {
  const run = await startProcessRun(pool, scope, "recommendations_refresh", {
    source: "system",
    payload: {
      project_id: scope.projectId,
    },
  });
  try {
  const [signals, scores, forecasts, similarCases, context] = await Promise.all([
    fetchSignals(pool, scope),
    fetchScores(pool, scope),
    fetchForecasts(pool, scope),
    findSimilarCases(pool, scope, { project_id: scope.projectId, window_days: 14, top_k: 5 }),
    fetchProjectContext(pool, scope),
  ]);
  const llmTopN = clampInt(process.env.RECOMMENDATIONS_V2_LLM_TOP_N, 3, 0, 20);
  const llmTemplateGenerator = buildTopNTemplateGenerator(options.llmGenerateTemplate || null, llmTopN);
  const generation = await generateRecommendationsV2FromInputs({
    signals,
    scores,
    forecasts,
    similarCases,
    now: options.now || new Date(),
    llmGenerateTemplate: llmTemplateGenerator,
    context,
    return_meta: true,
  });
  const recommendations = generation.recommendations;
  const touched = await upsertRecommendationsV2(pool, scope, recommendations);
  if (generation.dropped_without_evidence > 0) {
    await warnProcess(pool, scope, "recommendations_refresh", "Recommendations dropped by evidence gating", {
      payload: {
        dropped_without_evidence: generation.dropped_without_evidence,
      },
    });
  }
  const result = {
    touched,
    generated: recommendations.length,
    recommendations,
    similar_cases_top3: similarCases.slice(0, 3),
    dropped_without_evidence: generation.dropped_without_evidence,
  };
  await finishProcessRun(pool, scope, run, {
    counters: {
      signals: signals.length,
      scores: scores.length,
      forecasts: forecasts.length,
      generated_total: generation.generated_total,
      published: recommendations.length,
      dropped_without_evidence: generation.dropped_without_evidence,
      llm_top_n: llmTopN,
    },
    payload: {
      touched,
    },
  });
  return result;
  } catch (error) {
    await failProcessRun(pool, scope, run, error, {});
    throw error;
  }
}

export async function listRecommendationsV2(pool, scope, options = {}) {
  const status = String(options.status || "").trim().toLowerCase();
  const limit = clampInt(options.limit, 100, 1, 1000);
  const allProjects = String(options.all_projects || "").trim().toLowerCase() === "true";
  const includeHidden = String(options.include_hidden || "").trim().toLowerCase() === "true";

  if (allProjects) {
    const { rows } = await pool.query(
      `
        SELECT
          r.id,
          r.project_id,
          p.name AS project_name,
          r.category,
          r.priority,
          r.due_date,
          r.owner_role,
          r.status,
          r.title,
          r.rationale,
          r.why_now,
          r.expected_impact,
          r.evidence_refs,
          r.links,
          r.suggested_template_key,
          r.suggested_template,
          r.helpful_feedback,
          r.feedback_note,
          r.signal_snapshot,
          r.forecast_snapshot,
          r.evidence_count,
          r.evidence_quality_score,
          r.evidence_gate_status,
          r.evidence_gate_reason,
          r.first_shown_at,
          r.last_shown_at,
          r.shown_count,
          r.acknowledged_at,
          r.dismissed_at,
          r.completed_at,
          r.created_at,
          r.updated_at
        FROM recommendations_v2 AS r
        JOIN projects AS p ON p.id = r.project_id
        WHERE r.account_scope_id = $1
          AND ($2 = '' OR r.status = $2)
          AND ($3::boolean = true OR r.evidence_gate_status = 'visible')
        ORDER BY r.priority DESC, r.updated_at DESC
        LIMIT $4
      `,
      [scope.accountScopeId, status, includeHidden, limit]
    );
    return rows.map((row) => ({
      ...row,
      project_badge_color: hashColor(row.project_id),
    }));
  }

  const { rows } = await pool.query(
    `
      SELECT
        id,
        project_id,
        category,
        priority,
        due_date,
        owner_role,
        status,
        title,
        rationale,
        why_now,
        expected_impact,
        evidence_refs,
        links,
        suggested_template_key,
        suggested_template,
        helpful_feedback,
        feedback_note,
        signal_snapshot,
        forecast_snapshot,
        evidence_count,
        evidence_quality_score,
        evidence_gate_status,
        evidence_gate_reason,
        first_shown_at,
        last_shown_at,
        shown_count,
        acknowledged_at,
        dismissed_at,
        completed_at,
        created_at,
        updated_at
      FROM recommendations_v2
      WHERE project_id = $1
        AND account_scope_id = $2
        AND ($3 = '' OR status = $3)
        AND ($4::boolean = true OR evidence_gate_status = 'visible')
      ORDER BY priority DESC, updated_at DESC
      LIMIT $5
    `,
    [scope.projectId, scope.accountScopeId, status, includeHidden, limit]
  );
  return rows;
}

export async function updateRecommendationV2Status(pool, scope, id, status, options = {}) {
  const normalized = String(status || "").trim().toLowerCase();
  const allProjects = String(options.all_projects || "").trim().toLowerCase() === "true";
  if (!["new", "acknowledged", "done", "dismissed"].includes(normalized)) {
    throw new Error("invalid_recommendation_v2_status");
  }
  const { rows } = await pool.query(
    allProjects
      ? `
      UPDATE recommendations_v2
      SET status = $3,
          acknowledged_at = CASE WHEN $3 = 'acknowledged' THEN now() ELSE acknowledged_at END,
          completed_at = CASE WHEN $3 = 'done' THEN now() ELSE completed_at END,
          dismissed_at = CASE WHEN $3 = 'dismissed' THEN now() ELSE dismissed_at END,
          updated_at = now()
      WHERE id = $1
        AND account_scope_id = $2
      RETURNING *
    `
      : `
      UPDATE recommendations_v2
      SET status = $4,
          acknowledged_at = CASE WHEN $4 = 'acknowledged' THEN now() ELSE acknowledged_at END,
          completed_at = CASE WHEN $4 = 'done' THEN now() ELSE completed_at END,
          dismissed_at = CASE WHEN $4 = 'dismissed' THEN now() ELSE dismissed_at END,
          updated_at = now()
      WHERE id = $1
        AND project_id = $2
        AND account_scope_id = $3
      RETURNING *
    `,
    allProjects ? [id, scope.accountScopeId, normalized] : [id, scope.projectId, scope.accountScopeId, normalized]
  );
  return rows[0] || null;
}

export async function markRecommendationsV2Shown(pool, scope, recommendationIds = [], options = {}) {
  const allProjects = String(options.all_projects || "").trim().toLowerCase() === "true";
  const ids = Array.from(
    new Set(
      (Array.isArray(recommendationIds) ? recommendationIds : [])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    )
  );
  if (!ids.length) return [];

  const result = await pool.query(
    allProjects
      ? `
        UPDATE recommendations_v2
        SET
          shown_count = shown_count + 1,
          first_shown_at = COALESCE(first_shown_at, now()),
          last_shown_at = now(),
          updated_at = now()
        WHERE account_scope_id = $1
          AND id = ANY($2::uuid[])
        RETURNING id, project_id, category, status, shown_count, evidence_refs
      `
      : `
        UPDATE recommendations_v2
        SET
          shown_count = shown_count + 1,
          first_shown_at = COALESCE(first_shown_at, now()),
          last_shown_at = now(),
          updated_at = now()
        WHERE project_id = $1
          AND account_scope_id = $2
          AND id = ANY($3::uuid[])
        RETURNING id, project_id, category, status, shown_count, evidence_refs
      `,
    allProjects ? [scope.accountScopeId, ids] : [scope.projectId, scope.accountScopeId, ids]
  );
  return result.rows;
}

export async function updateRecommendationV2Feedback(pool, scope, id, helpful, note, options = {}) {
  const normalizedHelpful = String(helpful || "").trim().toLowerCase();
  const allProjects = String(options.all_projects || "").trim().toLowerCase() === "true";
  if (!["helpful", "not_helpful", "unknown"].includes(normalizedHelpful)) {
    throw new Error("invalid_recommendation_v2_feedback");
  }
  const { rows } = await pool.query(
    allProjects
      ? `
      UPDATE recommendations_v2
      SET helpful_feedback = $3,
          feedback_note = $4,
          updated_at = now()
      WHERE id = $1
        AND account_scope_id = $2
      RETURNING *
    `
      : `
      UPDATE recommendations_v2
      SET helpful_feedback = $4,
          feedback_note = $5,
          updated_at = now()
      WHERE id = $1
        AND project_id = $2
        AND account_scope_id = $3
      RETURNING *
    `,
    allProjects
      ? [id, scope.accountScopeId, normalizedHelpful, String(note || "").trim().slice(0, 2000) || null]
      : [id, scope.projectId, scope.accountScopeId, normalizedHelpful, String(note || "").trim().slice(0, 2000) || null]
  );
  return rows[0] || null;
}

export function buildLoopsDraftPayloadFromAttioContact(person = {}) {
  const email = String(person.email || "").trim().toLowerCase();
  if (!email) return null;
  return {
    email,
    first_name: String(person.full_name || "")
      .trim()
      .split(/\s+/)[0] || null,
    full_name: String(person.full_name || "").trim() || null,
    role: String(person.role || "").trim() || null,
    external_id: String(person.external_id || "").trim() || null,
    account_external_id: String(person.account_external_id || "").trim() || null,
    source_refs: [
      {
        attio_record_id: String(person.external_id || "").trim() || null,
        source_table: "attio_people_raw",
        source_pk: String(person.external_id || "").trim() || null,
      },
    ],
    send: false,
  };
}
