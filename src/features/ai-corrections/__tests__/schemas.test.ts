// ============================================================
// AI Corrections Schemas — Unit Tests
// Owner: ai-deepseek-engineer
// Contract: P3-AI-019
// ============================================================

import { describe, expect, it } from "vitest";
import {
  CorrectionsQuerySchema,
  CorrectionsSummarySchema,
  TopFieldSchema,
  ValueMappingSchema,
  FeedbackByFeatureSchema,
  CorrectionByPromptSchema,
  PreferenceEffectivenessSchema,
} from "../schemas";

// ============================================================
// CorrectionsQuerySchema
// ============================================================

describe("CorrectionsQuerySchema", () => {
  it("uses defaults when empty", () => {
    const result = CorrectionsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.days).toBe(30);
      expect(result.data.feature).toBeUndefined();
    }
  });

  it("parses valid feature and days", () => {
    const result = CorrectionsQuerySchema.safeParse({ feature: "content_factory", days: "14" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.feature).toBe("content_factory");
      expect(result.data.days).toBe(14);
    }
  });

  it("coerces days string to number", () => {
    const result = CorrectionsQuerySchema.safeParse({ days: "7" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.days).toBe(7);
    }
  });

  it("rejects days < 1", () => {
    const result = CorrectionsQuerySchema.safeParse({ days: "0" });
    expect(result.success).toBe(false);
  });

  it("rejects days > 365", () => {
    const result = CorrectionsQuerySchema.safeParse({ days: "400" });
    expect(result.success).toBe(false);
  });

  it("rejects extra fields (strict)", () => {
    const result = CorrectionsQuerySchema.safeParse({ days: "7", extra: true });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// TopFieldSchema
// ============================================================

describe("TopFieldSchema", () => {
  it("accepts valid top field", () => {
    const result = TopFieldSchema.safeParse({
      field: "price",
      count: 42,
      lastCorrectedAt: "2026-08-06T10:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null lastCorrectedAt", () => {
    const result = TopFieldSchema.safeParse({
      field: "description",
      count: 5,
      lastCorrectedAt: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing field name", () => {
    const result = TopFieldSchema.safeParse({ count: 5, lastCorrectedAt: null });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// ValueMappingSchema
// ============================================================

describe("ValueMappingSchema", () => {
  it("accepts valid value mapping", () => {
    const result = ValueMappingSchema.safeParse({
      field: "price",
      examples: [
        { originalValue: "5000", correctedValue: "5500" },
        { originalValue: null, correctedValue: "new value" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty examples array", () => {
    const result = ValueMappingSchema.safeParse({
      field: "price",
      examples: [],
    });
    expect(result.success).toBe(true);
  });

  it("accepts null values in examples", () => {
    const result = ValueMappingSchema.safeParse({
      field: "description",
      examples: [
        { originalValue: null, correctedValue: null },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing field name", () => {
    const result = ValueMappingSchema.safeParse({
      examples: [{ originalValue: "5000", correctedValue: "5500" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing examples array", () => {
    const result = ValueMappingSchema.safeParse({ field: "price" });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// FeedbackByFeatureSchema
// ============================================================

describe("FeedbackByFeatureSchema", () => {
  it("accepts valid feedback stats", () => {
    const result = FeedbackByFeatureSchema.safeParse({
      feature: "content_factory",
      total: 100,
      withFeedback: 80,
      negativeFeedback: 15,
      negativeRate: 18.8,
      avgScore: 3.8,
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative counts", () => {
    const result = FeedbackByFeatureSchema.safeParse({
      feature: "content_factory",
      total: -1,
      withFeedback: 80,
      negativeFeedback: 15,
      negativeRate: 18.8,
      avgScore: 3.8,
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// CorrectionsSummarySchema (full response)
// ============================================================

describe("CorrectionsSummarySchema", () => {
  const validSummary = {
    period: { days: 30, feature: null },
    totals: {
      total_corrections: 150,
      active_users: 12,
      affected_entities: 45,
      feedback_count: 80,
      avg_feedback_score: 3.5,
      negative_feedback_count: 20,
      negative_feedback_users: 8,
    },
    topCorrectedFields: [
      { field: "price", count: 42, lastCorrectedAt: "2026-08-05T00:00:00Z" },
      { field: "description", count: 30, lastCorrectedAt: "2026-08-04T00:00:00Z" },
    ],
    valueMappings: [
      {
        field: "price",
        examples: [
          { originalValue: "5000", correctedValue: "5500" },
          { originalValue: "3000", correctedValue: "3200" },
        ],
      },
    ],
    feedbackByFeature: [
      { feature: "content_factory", total: 100, withFeedback: 80, negativeFeedback: 15, negativeRate: 18.8, avgScore: 3.8 },
    ],
    correctionByPrompt: [
      { promptVersion: "1", totalCorrections: 80, uniqueUsers: 8, avgFieldsChanged: 2.5 },
      { promptVersion: "2", totalCorrections: 70, uniqueUsers: 6, avgFieldsChanged: 1.8 },
    ],
    preferenceEffectiveness: [
      { hasPreferences: true, userCount: 5, avgCorrectionsPerUser: 8.5, avgFeedbackScore: 4.2 },
      { hasPreferences: false, userCount: 7, avgCorrectionsPerUser: 15.3, avgFeedbackScore: 3.1 },
    ],
  };

  it("accepts valid full summary", () => {
    const result = CorrectionsSummarySchema.safeParse(validSummary);
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const { totals: _totals, ...rest } = validSummary;
    const result = CorrectionsSummarySchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("accepts empty topCorrectedFields array", () => {
    const result = CorrectionsSummarySchema.safeParse({
      ...validSummary,
      topCorrectedFields: [],
    });
    expect(result.success).toBe(true);
  });

  it("accepts zero values in totals", () => {
    const result = CorrectionsSummarySchema.safeParse({
      ...validSummary,
      totals: {
        total_corrections: 0,
        active_users: 0,
        affected_entities: 0,
        feedback_count: 0,
        avg_feedback_score: 0,
        negative_feedback_count: 0,
        negative_feedback_users: 0,
      },
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================
// CorrectionByPromptSchema
// ============================================================

describe("CorrectionByPromptSchema", () => {
  it("accepts valid prompt correction stats", () => {
    const result = CorrectionByPromptSchema.safeParse({
      promptVersion: "3",
      totalCorrections: 50,
      uniqueUsers: 10,
      avgFieldsChanged: 2.3,
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================
// PreferenceEffectivenessSchema
// ============================================================

describe("PreferenceEffectivenessSchema", () => {
  it("accepts valid preference stats", () => {
    const result = PreferenceEffectivenessSchema.safeParse({
      hasPreferences: true,
      userCount: 5,
      avgCorrectionsPerUser: 8.5,
      avgFeedbackScore: 4.2,
    });
    expect(result.success).toBe(true);
  });
});
