const TEMPLATE_LIBRARY: Record<string, string> = {
  waiting_on_client_follow_up: [
    "Тема: Нужен апрув по этапу {{stage_name}}",
    "",
    "Привет, {{client_name}}!",
    "",
    "Мы ждём вашего подтверждения по этапу «{{stage_name}}» уже {{waiting_days}} дн.",
    "Чтобы не сдвигать дедлайн, подтвердите, пожалуйста, один из вариантов:",
    "1) Апрув текущей версии;",
    "2) Комментарии правок;",
    "3) Короткий 15-мин созвон для фиксации решения.",
    "",
    "Спасибо! Мы готовы сразу перейти к следующему шагу.",
  ].join("\n"),
  scope_creep_change_request: [
    "Тема: Фиксация изменений по scope (CR)",
    "",
    "Привет, {{client_name}}!",
    "",
    "За последнюю неделю мы зафиксировали {{out_of_scope_count}} запроса(ов) вне согласованного scope.",
    "Чтобы сохранить сроки и прозрачность бюджета, предлагаем оформить Change Request:",
    "- описание изменений;",
    "- влияние на сроки;",
    "- влияние на бюджет;",
    "- обновлённый план поставки.",
    "",
    "После подтверждения сразу обновим roadmap.",
  ].join("\n"),
  delivery_risk_escalation: [
    "Тема: Эскалация delivery-рисков по проекту {{project_name}}",
    "",
    "Команда,",
    "",
    "Обнаружен риск по поставке:",
    "- активных blockers: {{blockers_count}};",
    "- средний возраст blockers: {{blockers_age_days}} дн.;",
    "- просрочка этапа: {{stage_overdue_days}} дн.",
    "",
    "Предлагаемые действия:",
    "1) Рескоп на 48 часов с owner по каждому blocker;",
    "2) Перепланировать критический путь;",
    "3) Эскалация зависимостей на клиента/партнёров.",
  ].join("\n"),
  finance_risk_review: [
    "Тема: Финансовый риск — пересмотр маржи",
    "",
    "Привет, {{client_name}}!",
    "",
    "Сигналы показывают отклонение от финансового плана:",
    "- burn rate: {{burn_rate}}x от плана;",
    "- margin risk: {{margin_risk_pct}}%.",
    "",
    "Предлагаем синхрон на 30 минут, чтобы согласовать:",
    "1) приоритизацию объёма работ;",
    "2) варианты оптимизации затрат;",
    "3) обновлённый финансовый baseline.",
  ].join("\n"),
  upsell_offer_pitch: [
    "Тема: Предложение по расширению ценности проекта",
    "",
    "Привет, {{client_name}}!",
    "",
    "По текущим задачам видим устойчивый потенциал для расширения:",
    "- выявленная потребность: {{need_signal}};",
    "- ожидаемый эффект: {{expected_value}}.",
    "",
    "Готовы отправить компактный оффер с вариантами (Base / Plus / Pro) и оценкой ROI.",
    "Если удобно, пришлём сегодня до конца дня.",
  ].join("\n"),
};

function sanitizeTemplateValue(value: unknown) {
  return String(value ?? "")
    .replace(/\r/g, "")
    .trim();
}

function renderTemplate(templateBody: string, variables: Record<string, unknown> = {}) {
  let rendered = String(templateBody || "");
  for (const [key, value] of Object.entries(variables || {})) {
    const token = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
    rendered = rendered.replace(token, sanitizeTemplateValue(value));
  }
  return rendered;
}

export function getTemplateByKey(templateKey: string) {
  return TEMPLATE_LIBRARY[templateKey] || "";
}

export function buildSuggestedTemplate(templateKey: string, variables: Record<string, unknown> = {}) {
  const body = getTemplateByKey(templateKey);
  if (!body) return "";
  return renderTemplate(body, variables);
}

export async function generateTemplate({
  templateKey,
  variables = {},
  llmGenerateTemplate = null,
}: {
  templateKey: string;
  variables?: Record<string, unknown>;
  llmGenerateTemplate?: ((params: {
    templateKey: string;
    variables: Record<string, unknown>;
    fallback: string;
  }) => Promise<string | null> | string | null) | null;
}) {
  const fallback = buildSuggestedTemplate(templateKey, variables);
  if (!llmGenerateTemplate) return fallback;

  const generated = await llmGenerateTemplate({
    templateKey,
    variables,
    fallback,
  });
  const normalized = String(generated || "").trim();
  return normalized || fallback;
}

export const KAG_TEMPLATE_KEYS = Object.freeze({
  WAITING: "waiting_on_client_follow_up",
  SCOPE_CREEP: "scope_creep_change_request",
  DELIVERY: "delivery_risk_escalation",
  FINANCE: "finance_risk_review",
  UPSELL: "upsell_offer_pitch",
});

export const DEFAULT_TEMPLATES = Object.freeze(TEMPLATE_LIBRARY);
