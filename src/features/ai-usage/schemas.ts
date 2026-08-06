// ============================================================
// AI Usage Admin — Zod Schemas
// Owner: ai-deepseek-engineer
// Contract: P3-AI-017
// ============================================================

import { z } from "zod";

// ============================================================
// Query params
// ============================================================

export const PeriodEnum = z.enum(["today", "7d", "30d"]);
export type Period = z.infer<typeof PeriodEnum>;

export const GroupByEnum = z.enum(["user", "workspace", "feature", "model", "status"]);
export type GroupBy = z.infer<typeof GroupByEnum>;

export const UsageQuerySchema = z.object({
  period: PeriodEnum.default("today"),
  groupBy: GroupByEnum.default("feature"),
}).strict();

export type UsageQuery = z.infer<typeof UsageQuerySchema>;

// ============================================================
// Usage stat aggregates
// ============================================================

export const UsageStatSchema = z.object({
  key: z.string(),
  label: z.string(),
  total_tokens: z.number().int().min(0),
  input_tokens: z.number().int().min(0),
  output_tokens: z.number().int().min(0),
  estimated_cost_usd: z.number().min(0),
  total_requests: z.number().int().min(0),
  succeeded: z.number().int().min(0),
  failed: z.number().int().min(0),
  rejected_compliance: z.number().int().min(0),
  blocked_by_cost_limit: z.number().int().min(0),
  avg_cost_per_request: z.number().min(0),
});

export type UsageStat = z.infer<typeof UsageStatSchema>;

export const UsageSummarySchema = z.object({
  period: PeriodEnum,
  groupBy: GroupByEnum,
  totals: z.object({
    total_tokens: z.number().int().min(0),
    total_cost_usd: z.number().min(0),
    total_requests: z.number().int().min(0),
    succeeded: z.number().int().min(0),
    failed: z.number().int().min(0),
    rejected_compliance: z.number().int().min(0),
    blocked_by_cost_limit: z.number().int().min(0),
  }),
  text: z.object({
    total_tokens: z.number().int().min(0),
    total_cost_usd: z.number().min(0),
    total_requests: z.number().int().min(0),
  }),
  vision: z.object({
    total_tokens: z.number().int().min(0),
    total_cost_usd: z.number().min(0),
    total_requests: z.number().int().min(0),
  }),
  groups: z.array(UsageStatSchema),
  userCount: z.number().int().min(0),
  avgCostPerUser: z.number().min(0),
});

export type UsageSummary = z.infer<typeof UsageSummarySchema>;

// ============================================================
// User limits management
// ============================================================

export const UpdateUserLimitsSchema = z.object({
  daily_request_limit: z.number().int().min(1).max(10000).optional(),
  daily_cost_limit_usd: z.number().min(0.01).max(10000).optional(),
}).strict();

export type UpdateUserLimits = z.infer<typeof UpdateUserLimitsSchema>;

export const UserLimitsSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  feature: z.string(),
  daily_request_limit: z.number().int().nullable(),
  daily_cost_limit_usd: z.number().nullable(),
  status: z.enum(["active", "blocked"]),
  blocked_at: z.string().nullable(),
  blocked_reason: z.string().nullable(),
  manually_restored_at: z.string().nullable(),
});

export type UserLimits = z.infer<typeof UserLimitsSchema>;

// ============================================================
// API response wrappers
// ============================================================

export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema.nullable(),
    error: z.object({
      code: z.string(),
      message: z.string(),
    }).nullable(),
  });

export type ApiResponse<T> = {
  data: T | null;
  error: { code: string; message: string } | null;
};
