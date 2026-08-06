// ============================================================
// AI Corrections Admin — Zod Schemas
// Owner: ai-deepseek-engineer
// Contract: P3-AI-019
// ============================================================

import { z } from "zod";

// ============================================================
// Query params
// ============================================================

export const CorrectionsQuerySchema = z.object({
  feature: z.string().optional(),
  days: z.coerce.number().int().min(1).max(365).default(30),
}).strict();

export type CorrectionsQuery = z.infer<typeof CorrectionsQuerySchema>;

// ============================================================
// Response types
// ============================================================

export const TopFieldSchema = z.object({
  field: z.string(),
  count: z.number().int().min(0),
  lastCorrectedAt: z.string().nullable(),
});

export const ValueMappingSchema = z.object({
  field: z.string(),
  examples: z.array(z.object({
    originalValue: z.string().nullable(),
    correctedValue: z.string().nullable(),
  })),
});

export const FeedbackByFeatureSchema = z.object({
  feature: z.string(),
  total: z.number().int().min(0),
  withFeedback: z.number().int().min(0),
  negativeFeedback: z.number().int().min(0),
  negativeRate: z.number().min(0),
  avgScore: z.number().min(0),
});

export const CorrectionByPromptSchema = z.object({
  promptVersion: z.string(),
  totalCorrections: z.number().int().min(0),
  uniqueUsers: z.number().int().min(0),
  avgFieldsChanged: z.number().min(0),
});

export const PreferenceEffectivenessSchema = z.object({
  hasPreferences: z.boolean(),
  userCount: z.number().int().min(0),
  avgCorrectionsPerUser: z.number().min(0),
  avgFeedbackScore: z.number().min(0),
});

export const CorrectionsSummarySchema = z.object({
  period: z.object({
    days: z.number().int(),
    feature: z.string().nullable(),
  }),
  totals: z.object({
    total_corrections: z.number().int().min(0),
    active_users: z.number().int().min(0),
    affected_entities: z.number().int().min(0),
    feedback_count: z.number().int().min(0),
    avg_feedback_score: z.number().min(0),
    negative_feedback_count: z.number().int().min(0),
    negative_feedback_users: z.number().int().min(0),
  }),
  topCorrectedFields: z.array(TopFieldSchema),
  valueMappings: z.array(ValueMappingSchema),
  feedbackByFeature: z.array(FeedbackByFeatureSchema),
  correctionByPrompt: z.array(CorrectionByPromptSchema),
  preferenceEffectiveness: z.array(PreferenceEffectivenessSchema),
});

export type CorrectionsSummary = z.infer<typeof CorrectionsSummarySchema>;
