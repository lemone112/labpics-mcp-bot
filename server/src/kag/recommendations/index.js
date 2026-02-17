import crypto from "node:crypto";

import { SIGNAL_KEYS, mapSignalsByKey } from "../signals/index.js";
import { SCORE_TYPES } from "../scoring/index.js";
import { KAG_TEMPLATE_KEYS, generateTemplate } from "../templates/index.js";

const CATEGORY = Object.freeze({
  WAITING: "waiting_on_client",
  SCOPE: "scope_creep_change_request",
  DELIVERY: "delivery_risk",
  FINANCE: "finance_risk",
  UPSELL: "upsell_opportunity",
});

function dedupeEvidenceRefs(refs = [], limit = 30) {
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

function scoreByType(scores = []) {
  const map = {};
  for (const row of scores) {
    if (row?.score_type) map[row.score_type] = row;
  }
  return map;
}

function recommendationDedupeKey(category, context = {}) {
  const material = `${category}:${JSON.stringify(context)}`;
  return crypto.createHash("sha1").update(material).digest("hex");
}

function hasEvidence(evidenceRefs) {
  return Array.isArray(evidenceRefs) && evidenceRefs.length > 0;
}

function recentCount(timestamps = [], now = new Date(), days = 7) {
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  let count = 0;
  for (const item of timestamps) {
    const ts = new Date(item);
    if (Number.isFinite(ts.getTime()) && ts >= cutoff) count += 1;
  }
  return count;
}

function signalSnapshot(signal) {
  if (!signal) return {};
  return {
    signal_key: signal.signal_key,
    value: signal.value,
    status: signal.status,
    details: signal.details || {},
  };
}

function scoreSnapshot(score) {
  if (!score) return {};
  return {
    score_type: score.score_type,
    score: score.score,
    level: score.level,
  };
}

export async function generateRecommendations({
  signals = [],
  scores = [],
  state = {},
  now = new Date(),
  llmGenerateTemplate = null,
}) {
  const signalMap = mapSignalsByKey(signals);
  const scoreMap = scoreByType(scores);
  const recs = [];

  const waiting = signalMap[SIGNAL_KEYS.WAITING_ON_CLIENT_DAYS];
  const stage = signalMap[SIGNAL_KEYS.STAGE_OVERDUE];
  if (Number(waiting?.value || 0) >= 2) {
    const approvalPending = Boolean(stage?.details?.approval_pending);
    const evidence = dedupeEvidenceRefs([...(waiting?.evidence_refs || []), ...(stage?.evidence_refs || [])], 25);
    if (hasEvidence(evidence)) {
      const templateVariables = {
        client_name: state?.client_name || "коллеги",
        stage_name: stage?.details?.stage_name || state?.stage?.stage_name || "текущий этап",
        waiting_days: Number(waiting.value).toFixed(1),
      };
      recs.push({
        category: CATEGORY.WAITING,
        priority: Number(waiting.value) >= 4 || approvalPending ? 5 : 4,
        title: "Сделать follow-up по клиентскому апруву",
        rationale: approvalPending
          ? `Клиент не отвечает ${Number(waiting.value).toFixed(1)} дн., этап в ожидании апрува.`
          : `Клиент не отвечает ${Number(waiting.value).toFixed(1)} дн., растёт риск задержки.`,
        evidence_refs: evidence,
        suggested_template_key: KAG_TEMPLATE_KEYS.WAITING,
        suggested_template: await generateTemplate({
          templateKey: KAG_TEMPLATE_KEYS.WAITING,
          variables: templateVariables,
          llmGenerateTemplate,
        }),
        signal_snapshot: {
          waiting: signalSnapshot(waiting),
          stage: signalSnapshot(stage),
        },
        score_snapshot: {
          project_health: scoreSnapshot(scoreMap[SCORE_TYPES.PROJECT_HEALTH]),
          risk: scoreSnapshot(scoreMap[SCORE_TYPES.RISK]),
        },
        dedupe_key: recommendationDedupeKey(CATEGORY.WAITING, {
          waiting_days: Number(waiting.value || 0).toFixed(1),
          approval_pending: approvalPending,
        }),
      });
    }
  }

  const scope = signalMap[SIGNAL_KEYS.SCOPE_CREEP_RATE];
  const scopeRequests = Number(scope?.details?.scope_requests_7d || 0);
  if (Number(scope?.value || 0) >= 0.2 || scopeRequests >= 2) {
    const evidence = dedupeEvidenceRefs(scope?.evidence_refs || [], 25);
    if (hasEvidence(evidence)) {
      const templateVariables = {
        client_name: state?.client_name || "коллеги",
        out_of_scope_count: scopeRequests || Math.max(1, Math.round(Number(scope?.value || 0) * 10)),
      };
      recs.push({
        category: CATEGORY.SCOPE,
        priority: Number(scope?.value || 0) >= 0.35 || scopeRequests >= 3 ? 5 : 4,
        title: "Оформить Change Request по scope",
        rationale: `За 7 дней: ${scopeRequests} запрос(а/ов) вне scope; rate=${Number(scope?.value || 0).toFixed(2)}.`,
        evidence_refs: evidence,
        suggested_template_key: KAG_TEMPLATE_KEYS.SCOPE_CREEP,
        suggested_template: await generateTemplate({
          templateKey: KAG_TEMPLATE_KEYS.SCOPE_CREEP,
          variables: templateVariables,
          llmGenerateTemplate,
        }),
        signal_snapshot: {
          scope_creep_rate: signalSnapshot(scope),
        },
        score_snapshot: {
          project_health: scoreSnapshot(scoreMap[SCORE_TYPES.PROJECT_HEALTH]),
          risk: scoreSnapshot(scoreMap[SCORE_TYPES.RISK]),
        },
        dedupe_key: recommendationDedupeKey(CATEGORY.SCOPE, {
          scope_requests_7d: scopeRequests,
          scope_creep_rate: Number(scope?.value || 0).toFixed(2),
        }),
      });
    }
  }

  const blockers = signalMap[SIGNAL_KEYS.BLOCKERS_AGE];
  const blockersCount = Number(blockers?.details?.open_blockers || 0);
  const stageOverdue = Number(stage?.value || 0);
  if ((blockersCount > 3 && Number(blockers?.value || 0) > 5) || stageOverdue > 1) {
    const evidence = dedupeEvidenceRefs([...(blockers?.evidence_refs || []), ...(stage?.evidence_refs || [])], 25);
    if (hasEvidence(evidence)) {
      const templateVariables = {
        project_name: state?.project_name || "проект",
        blockers_count: blockersCount,
        blockers_age_days: Number(blockers?.value || 0).toFixed(1),
        stage_overdue_days: Number(stageOverdue || 0).toFixed(1),
      };
      recs.push({
        category: CATEGORY.DELIVERY,
        priority: blockersCount > 3 && Number(blockers?.value || 0) > 5 ? 5 : 4,
        title: "Снизить delivery-риск: перепланировать и эскалировать blockers",
        rationale:
          blockersCount > 0
            ? `Активных blockers: ${blockersCount}, средний возраст ${Number(blockers?.value || 0).toFixed(1)} дн.`
            : `Этап просрочен на ${Number(stageOverdue).toFixed(1)} дн., нужен пересмотр плана.`,
        evidence_refs: evidence,
        suggested_template_key: KAG_TEMPLATE_KEYS.DELIVERY,
        suggested_template: await generateTemplate({
          templateKey: KAG_TEMPLATE_KEYS.DELIVERY,
          variables: templateVariables,
          llmGenerateTemplate,
        }),
        signal_snapshot: {
          blockers_age: signalSnapshot(blockers),
          stage_overdue: signalSnapshot(stage),
        },
        score_snapshot: {
          project_health: scoreSnapshot(scoreMap[SCORE_TYPES.PROJECT_HEALTH]),
          risk: scoreSnapshot(scoreMap[SCORE_TYPES.RISK]),
        },
        dedupe_key: recommendationDedupeKey(CATEGORY.DELIVERY, {
          blockers_count: blockersCount,
          blockers_age_days: Number(blockers?.value || 0).toFixed(1),
          stage_overdue_days: Number(stageOverdue || 0).toFixed(1),
        }),
      });
    }
  }

  const burn = signalMap[SIGNAL_KEYS.BUDGET_BURN_RATE];
  const margin = signalMap[SIGNAL_KEYS.MARGIN_RISK];
  if (Number(burn?.value || 0) > 1.1 || Number(margin?.value || 0) >= 0.25) {
    const evidence = dedupeEvidenceRefs([...(burn?.evidence_refs || []), ...(margin?.evidence_refs || [])], 25);
    if (hasEvidence(evidence)) {
      const templateVariables = {
        client_name: state?.client_name || "коллеги",
        burn_rate: Number(burn?.value || 0).toFixed(2),
        margin_risk_pct: (Number(margin?.value || 0) * 100).toFixed(1),
      };
      recs.push({
        category: CATEGORY.FINANCE,
        priority: Number(burn?.value || 0) >= 1.2 || Number(margin?.value || 0) >= 0.4 ? 5 : 4,
        title: "Запустить финансовый review по марже и burn",
        rationale: `Burn rate=${Number(burn?.value || 0).toFixed(2)}x, margin risk=${(Number(margin?.value || 0) * 100).toFixed(1)}%.`,
        evidence_refs: evidence,
        suggested_template_key: KAG_TEMPLATE_KEYS.FINANCE,
        suggested_template: await generateTemplate({
          templateKey: KAG_TEMPLATE_KEYS.FINANCE,
          variables: templateVariables,
          llmGenerateTemplate,
        }),
        signal_snapshot: {
          budget_burn_rate: signalSnapshot(burn),
          margin_risk: signalSnapshot(margin),
        },
        score_snapshot: {
          risk: scoreSnapshot(scoreMap[SCORE_TYPES.RISK]),
          client_value: scoreSnapshot(scoreMap[SCORE_TYPES.CLIENT_VALUE]),
        },
        dedupe_key: recommendationDedupeKey(CATEGORY.FINANCE, {
          burn_rate: Number(burn?.value || 0).toFixed(2),
          margin_risk: Number(margin?.value || 0).toFixed(2),
        }),
      });
    }
  }

  const upsell = scoreMap[SCORE_TYPES.UPSELL_LIKELIHOOD];
  const needCount7d = recentCount(state?.needs?.events || [], now, 7);
  const needEvidence = dedupeEvidenceRefs(state?.needs?.evidence || [], 20);
  if (Number(upsell?.score || 0) >= 65 && needCount7d > 0) {
    const evidence = dedupeEvidenceRefs([...needEvidence, ...(upsell?.evidence_refs || [])], 25);
    if (hasEvidence(evidence)) {
      const templateVariables = {
        client_name: state?.client_name || "коллеги",
        need_signal: `обнаружено ${needCount7d} сигнал(а/ов) потребности за 7 дней`,
        expected_value: "ускорение time-to-value и снижение операционных рисков",
      };
      recs.push({
        category: CATEGORY.UPSELL,
        priority: Number(upsell.score) >= 80 ? 5 : 4,
        title: "Подготовить upsell-оффер на основе выявленной потребности",
        rationale: `Upsell likelihood=${Number(upsell.score).toFixed(1)} и есть подтверждённые сигналы потребности (${needCount7d}).`,
        evidence_refs: evidence,
        suggested_template_key: KAG_TEMPLATE_KEYS.UPSELL,
        suggested_template: await generateTemplate({
          templateKey: KAG_TEMPLATE_KEYS.UPSELL,
          variables: templateVariables,
          llmGenerateTemplate,
        }),
        signal_snapshot: {
          scope_creep_rate: signalSnapshot(signalMap[SIGNAL_KEYS.SCOPE_CREEP_RATE]),
        },
        score_snapshot: {
          upsell_likelihood: scoreSnapshot(upsell),
          client_value: scoreSnapshot(scoreMap[SCORE_TYPES.CLIENT_VALUE]),
        },
        dedupe_key: recommendationDedupeKey(CATEGORY.UPSELL, {
          upsell_likelihood: Number(upsell.score).toFixed(1),
          need_count_7d: needCount7d,
        }),
      });
    }
  }

  return recs.sort((a, b) => b.priority - a.priority);
}

export { CATEGORY as RECOMMENDATION_CATEGORY };
