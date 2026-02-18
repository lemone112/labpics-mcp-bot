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

// ---------------------------------------------------------------------------
// 7.1  CRM schemas
// ---------------------------------------------------------------------------

export const CreateAccountSchema = z.object({
  name: trimmedString(2, 300),
  domain: optionalTrimmedString(300),
  stage: z.string().trim().toLowerCase().default("prospect"),
  owner_username: optionalTrimmedString(200),
  evidence_refs: evidenceRefs,
});

export const CreateOpportunitySchema = z.object({
  title: trimmedString(1, 500),
  account_id: trimmedString(1, 200),
  next_step: trimmedString(4, 1000),
  stage: z.string().trim().toLowerCase().default("discovery"),
  probability,
  amount_estimate: positiveNumber(),
  expected_close_date: z.string().optional().default(null).nullable(),
  owner_username: optionalTrimmedString(200),
  evidence_refs: evidenceRefs,
});

export const UpdateStageSchema = z.object({
  stage: z.string().trim().toLowerCase().min(1, "stage is required"),
  reason: optionalTrimmedString(1000),
  evidence_refs: evidenceRefs,
});

// ---------------------------------------------------------------------------
// 7.2  Offers schemas
// ---------------------------------------------------------------------------

export const CreateOfferSchema = z.object({
  title: trimmedString(1, 500),
  account_id: z.string().optional().default(null).nullable(),
  opportunity_id: z.string().optional().default(null).nullable(),
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
  payload: z.record(z.any()).optional().default({}),
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
