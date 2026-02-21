import { z } from "zod";

// ---------------------------------------------------------------------------
// Reusable primitives
// ---------------------------------------------------------------------------

const trimmedString = (min = 1, max = 500) =>
  z.string().transform((s) => s.trim()).pipe(z.string().min(min).max(max));

const optionalTrimmedString = (max = 500) =>
  z.string().transform((s) => s.trim()).pipe(z.string().max(max)).optional().or(z.literal("")).transform((v) => v || null);

const evidenceRefs = z.array(z.any()).optional().default([]);

const positiveNumber = (max = 1_000_000_000) =>
  z.coerce.number().min(0).max(max).default(0);

const probability = z.coerce.number().min(0).max(1).default(0.1);

const accountStageEnum = z.enum(["active", "inactive", "prospect"]);
const opportunityStageEnum = z.enum(["discovery", "qualified", "proposal", "negotiation", "won", "lost"]);

// ---------------------------------------------------------------------------
// 7.1  CRM schemas
// ---------------------------------------------------------------------------

export const CreateAccountSchema = z.object({
  name: trimmedString(2, 300),
  domain: optionalTrimmedString(300),
  external_ref: optionalTrimmedString(500),
  stage: z.string().trim().toLowerCase().pipe(accountStageEnum).default("prospect"),
  owner_user_id: z.string().uuid().optional().nullable().default(null),
  owner_username: optionalTrimmedString(200),
  evidence_refs: evidenceRefs,
});

export const CreateOpportunitySchema = z.object({
  title: trimmedString(1, 500),
  account_id: trimmedString(1, 200),
  next_step: trimmedString(4, 1000),
  stage: z.string().trim().toLowerCase().pipe(opportunityStageEnum).default("discovery"),
  probability,
  amount_estimate: positiveNumber(),
  expected_close_date: z.string().optional().default(null as unknown as string).nullable(),
  owner_user_id: z.string().uuid().optional().nullable().default(null),
  owner_username: optionalTrimmedString(200),
  evidence_refs: evidenceRefs,
});

export const UpdateStageSchema = z.object({
  stage: z.string().trim().toLowerCase().pipe(opportunityStageEnum),
  reason: optionalTrimmedString(1000),
  evidence_refs: evidenceRefs,
});

// ---------------------------------------------------------------------------
// 7.2  Offers schemas
// ---------------------------------------------------------------------------

export const CreateOfferSchema = z.object({
  title: trimmedString(1, 500),
  account_id: z.string().optional().default(null as unknown as string).nullable(),
  opportunity_id: z.string().optional().default(null as unknown as string).nullable(),
  currency: z.string().trim().toUpperCase().max(6).default("USD"),
  subtotal: positiveNumber(),
  discount_pct: z.coerce.number().min(0).max(100).default(0),
  evidence_refs: evidenceRefs,
});

export const ApproveOfferSchema = z.object({
  comment: optionalTrimmedString(2000),
  evidence_refs: evidenceRefs,
});

// ---------------------------------------------------------------------------
// 7.2  Outbound schemas
// ---------------------------------------------------------------------------

const outboundChannel = z.enum(["email", "chatwoot", "telegram"]);

export const CreateOutboundDraftSchema = z.object({
  channel: outboundChannel,
  recipient_ref: trimmedString(1, 500),
  idempotency_key: trimmedString(1, 500),
  payload: z.object({}).passthrough().optional().default({}),
  dedupe_key: optionalTrimmedString(500),
  max_retries: z.coerce.number().int().min(0).max(20).optional().default(5),
  evidence_refs: evidenceRefs,
});

export const OptOutSchema = z.object({
  contact_global_id: trimmedString(1, 500),
  channel: outboundChannel,
  opted_out: z.coerce.boolean().default(false),
  stop_on_reply: z.coerce.boolean().optional(),
  frequency_window_hours: z.coerce.number().int().min(0).optional(),
  frequency_cap: z.coerce.number().int().min(0).optional(),
  mark_inbound: z.coerce.boolean().optional().default(false),
});

// ---------------------------------------------------------------------------
// 7.3  Auth schemas
// ---------------------------------------------------------------------------

export const LoginSchema = z.object({
  username: trimmedString(1, 200),
  password: z.string().min(1, "Password is required"),
});

// ---------------------------------------------------------------------------
// 7.3  Project schemas
// ---------------------------------------------------------------------------

export const CreateProjectSchema = z.object({
  name: trimmedString(2, 160),
  account_scope_key: optionalTrimmedString(200),
  account_scope_name: z.string().trim().max(160).default("Project account scope"),
});

// ---------------------------------------------------------------------------
// 7.3  LightRAG schemas
// ---------------------------------------------------------------------------

export const LightRagQuerySchema = z.object({
  query: trimmedString(1, 4000),
  topK: z.coerce.number().int().min(1).max(50).optional().default(10),
  sourceLimit: z.coerce.number().int().min(1).max(25).optional(),
  sourceFilter: z.array(z.string()).optional().nullable().default(null),
  date_from: z.coerce.date().optional().nullable().default(null),
  date_to: z.coerce.date().optional().nullable().default(null),
});

export const LightRagFeedbackSchema = z.object({
  query_run_id: z.coerce.number().int().positive("Valid query_run_id is required"),
  rating: z.coerce.number().int().refine((v) => [-1, 0, 1].includes(v), { message: "Rating must be -1, 0, or 1" }),
  comment: optionalTrimmedString(2000),
});

export const SearchSchema = z.object({
  query: trimmedString(1, 4000),
  topK: z.coerce.number().int().min(1).max(50).optional().default(10),
  sourceLimit: z.coerce.number().int().min(1).max(25).optional(),
  date_from: z.coerce.date().optional().nullable().default(null),
  date_to: z.coerce.date().optional().nullable().default(null),
});

// ---------------------------------------------------------------------------
// 7.3  Search Analytics schemas (Iter 45)
// ---------------------------------------------------------------------------

export const SearchAnalyticsTrackSchema = z.object({
  query: trimmedString(1, 4000),
  result_count: z.coerce.number().int().min(0).max(10000).optional().default(0),
  filters: z.object({}).passthrough().optional().default({}),
  clicked_result_id: optionalTrimmedString(500),
  clicked_source_type: optionalTrimmedString(100),
  event_type: z.enum(["search", "click", "suggestion"]).optional().default("search"),
  duration_ms: z.coerce.number().int().min(0).max(300000).optional().nullable(),
});

export const SearchAnalyticsSummarySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional().default(30),
  top_queries_limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

// ---------------------------------------------------------------------------
// 10.1 Metrics & Criteria API contracts (Iter 66.3)
// ---------------------------------------------------------------------------

const metricValueTypeEnum = z.enum(["numeric", "text", "boolean", "json"]);
const metricAggregationTypeEnum = z.enum([
  "sum",
  "avg",
  "count",
  "last",
  "max",
  "min",
  "ratio",
  "distinct_count",
]);
const metricSubjectTypeEnum = z.enum(["project", "employee", "crm_account", "crm_opportunity", "system"]);
const metricDimensionTypeEnum = z.enum(["text", "number", "boolean", "date", "timestamp", "enum", "json"]);
const sortOrderEnum = z.enum(["asc", "desc"]);

const isoDateTimeString = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Expected ISO datetime string" });

export const MetricDefinitionDimensionSchema = z.object({
  dimension_key: trimmedString(1, 100),
  dimension_type: metricDimensionTypeEnum,
  required: z.coerce.boolean().optional().default(false),
  allowed_values: z.array(z.string()).optional().nullable().default(null),
  metadata: z.object({}).passthrough().optional().default({}),
});

export const MetricDefinitionUpsertSchema = z.object({
  schema_version: z.literal(1).optional().default(1),
  metric_key: trimmedString(3, 150),
  version: z.coerce.number().int().min(1).optional(),
  promote_new_version: z.coerce.boolean().optional().default(false),
  name: trimmedString(2, 200),
  description: optionalTrimmedString(2000),
  unit: optionalTrimmedString(50),
  value_type: metricValueTypeEnum,
  aggregation_type: metricAggregationTypeEnum,
  source: optionalTrimmedString(200),
  enabled: z.coerce.boolean().optional().default(true),
  metadata: z.object({}).passthrough().optional().default({}),
  dimensions: z.array(MetricDefinitionDimensionSchema).optional().default([]),
});

export const MetricsIngestObservationSchema = z.object({
  metric_key: trimmedString(1, 150),
  subject_type: metricSubjectTypeEnum,
  subject_id: z.string().uuid(),
  observed_at: isoDateTimeString,
  value_numeric: z.coerce.number().optional().nullable().default(null),
  value_text: optionalTrimmedString(4000),
  dimensions: z.object({}).passthrough().optional().default({}),
  quality_flags: z.object({}).passthrough().optional().default({}),
  source: optionalTrimmedString(200),
  source_event_id: optionalTrimmedString(500),
  is_backfill: z.coerce.boolean().optional().default(false),
});

export const MetricsIngestSchema = z.object({
  schema_version: z.literal(1).optional().default(1),
  idempotency_key: trimmedString(1, 255),
  observations: z.array(MetricsIngestObservationSchema).min(1).max(2000),
});

export const MetricsQuerySchema = z.object({
  schema_version: z.coerce.number().int().optional().default(1),
  metric_key: optionalTrimmedString(150),
  subject_type: metricSubjectTypeEnum.optional().nullable().default(null),
  subject_id: z.string().uuid().optional().nullable().default(null),
  date_from: isoDateTimeString.optional().nullable().default(null),
  date_to: isoDateTimeString.optional().nullable().default(null),
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
  offset: z.coerce.number().int().min(0).optional().default(0),
  sort_by: z.enum(["observed_at", "ingested_at", "created_at"]).optional().default("observed_at"),
  sort_order: sortOrderEnum.optional().default("desc"),
});

export const MetricsExportSchema = z.object({
  schema_version: z.coerce.number().int().optional().default(1),
  format: z.enum(["json", "csv"]).optional().default("json"),
  metric_key: optionalTrimmedString(150),
  subject_type: metricSubjectTypeEnum.optional().nullable().default(null),
  subject_id: z.string().uuid().optional().nullable().default(null),
  date_from: isoDateTimeString.optional().nullable().default(null),
  date_to: isoDateTimeString.optional().nullable().default(null),
  limit: z.coerce.number().int().min(1).max(5000).optional().default(1000),
  offset: z.coerce.number().int().min(0).optional().default(0),
  sort_by: z.enum(["observed_at", "ingested_at", "created_at"]).optional().default("observed_at"),
  sort_order: sortOrderEnum.optional().default("desc"),
});

export const CriteriaEvaluateItemSchema = z.object({
  criteria_key: trimmedString(1, 150),
  subject_type: metricSubjectTypeEnum,
  subject_id: z.string().uuid(),
  metric_values: z.object({}).passthrough().optional().default({}),
  thresholds: z.object({}).passthrough().optional().default({}),
  evidence_refs: evidenceRefs,
});

export const CriteriaEvaluateSchema = z.object({
  schema_version: z.literal(1).optional().default(1),
  run_key: optionalTrimmedString(200),
  trigger_source: optionalTrimmedString(100).default("api"),
  evaluations: z.array(CriteriaEvaluateItemSchema).min(1).max(200),
});

// ---------------------------------------------------------------------------
// 9.1  Signals & Identity schemas
// ---------------------------------------------------------------------------

export const SignalStatusSchema = z.object({
  status: z.enum(["proposed", "accepted", "dismissed", "done"]),
});

export const NbaStatusSchema = z.object({
  status: z.enum(["proposed", "accepted", "dismissed", "done", "cancelled"]),
});

export const IdentityPreviewSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
});

export const IdentitySuggestionApplySchema = z.object({
  suggestion_ids: z.array(z.string()).default([]),
});

// ---------------------------------------------------------------------------
// 9.2  Recommendation schemas
// ---------------------------------------------------------------------------

const allProjectsFlag = z.preprocess(
  (v) => String(v || "").trim().toLowerCase() === "true",
  z.boolean().default(false)
);

export const RecommendationsShownSchema = z.object({
  recommendation_ids: z.array(z.string()).default([]),
  all_projects: allProjectsFlag,
});

export const RecommendationStatusSchema = z.object({
  status: z.string().trim().toLowerCase().min(1, "status is required"),
  all_projects: allProjectsFlag,
});

export const RecommendationFeedbackSchema = z.object({
  helpful: z.string().trim().toLowerCase().default("unknown"),
  note: optionalTrimmedString(2000),
  all_projects: allProjectsFlag,
});

export const RecommendationActionSchema = z.object({
  action_type: z.string().trim().min(1, "action_type is required"),
  action_payload: z.object({}).passthrough().optional().default({}),
  all_projects: allProjectsFlag,
});

export const RecommendationActionRetrySchema = z.object({
  all_projects: allProjectsFlag,
});

// ---------------------------------------------------------------------------
// 9.3  Connectors & Jobs schemas
// ---------------------------------------------------------------------------

export const ConnectorRetrySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional().default(20),
});

export const AnalyticsRefreshSchema = z.object({
  period_days: z.coerce.number().int().min(1).max(120).optional().default(30),
});

// ---------------------------------------------------------------------------
// 9.4  Outbound, Continuity & Upsell schemas
// ---------------------------------------------------------------------------

export const OutboundApproveSchema = z.object({
  evidence_refs: evidenceRefs,
});

export const OutboundProcessSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(20),
});

export const LoopsSyncSchema = z.object({
  project_ids: z.array(z.string().uuid()).optional().default([]),
});

export const UpsellStatusSchema = z.object({
  status: z.enum(["proposed", "accepted", "dismissed", "converted"]),
});

export const ContinuityApplySchema = z.object({
  action_ids: z.array(z.string()).default([]),
});

// ---------------------------------------------------------------------------
// Inferred types (use these in service/route signatures)
// ---------------------------------------------------------------------------

export type CreateAccountInput = z.infer<typeof CreateAccountSchema>;
export type CreateOpportunityInput = z.infer<typeof CreateOpportunitySchema>;
export type UpdateStageInput = z.infer<typeof UpdateStageSchema>;
export type CreateOfferInput = z.infer<typeof CreateOfferSchema>;
export type ApproveOfferInput = z.infer<typeof ApproveOfferSchema>;
export type CreateOutboundDraftInput = z.infer<typeof CreateOutboundDraftSchema>;
export type OptOutInput = z.infer<typeof OptOutSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;
export type LightRagQueryInput = z.infer<typeof LightRagQuerySchema>;
export type LightRagFeedbackInput = z.infer<typeof LightRagFeedbackSchema>;
export type SearchInput = z.infer<typeof SearchSchema>;
export type SignalStatusInput = z.infer<typeof SignalStatusSchema>;
export type NbaStatusInput = z.infer<typeof NbaStatusSchema>;
export type IdentityPreviewInput = z.infer<typeof IdentityPreviewSchema>;
export type RecommendationActionInput = z.infer<typeof RecommendationActionSchema>;
export type ConnectorRetryInput = z.infer<typeof ConnectorRetrySchema>;
export type AnalyticsRefreshInput = z.infer<typeof AnalyticsRefreshSchema>;
export type SearchAnalyticsTrackInput = z.infer<typeof SearchAnalyticsTrackSchema>;
export type SearchAnalyticsSummaryInput = z.infer<typeof SearchAnalyticsSummarySchema>;
export type MetricDefinitionUpsertInput = z.infer<typeof MetricDefinitionUpsertSchema>;
export type MetricsIngestInput = z.infer<typeof MetricsIngestSchema>;
export type MetricsQueryInput = z.infer<typeof MetricsQuerySchema>;
export type MetricsExportInput = z.infer<typeof MetricsExportSchema>;
export type CriteriaEvaluateInput = z.infer<typeof CriteriaEvaluateSchema>;
