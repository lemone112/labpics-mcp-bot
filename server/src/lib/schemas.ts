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
});

// ---------------------------------------------------------------------------
// 9.1  Signals & Identity schemas
// ---------------------------------------------------------------------------

export const SignalStatusSchema = z.object({
  status: z.string().trim().toLowerCase().min(1, "status is required"),
});

export const NbaStatusSchema = z.object({
  status: z.string().trim().toLowerCase().min(1, "status is required"),
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
  project_ids: z.array(z.string()).optional().default([]),
});

export const UpsellStatusSchema = z.object({
  status: z.string().trim().toLowerCase().min(1, "status is required"),
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
