// ============================================================
// AI Fixtures Zod Validation
// Owner: ai-deepseek-engineer
// Purpose: Ensure prompt examples always pass their Zod schemas.
//   If a fixture fails, the prompt is guaranteed to show an
//   invalid example to the model — this test catches drift early.
// ============================================================

import { describe, it, expect } from "vitest";
import {
  PropertySearchFilterSchema,
  PropertyExtractionOutputSchema,
  ClientExtractionOutputSchema,
  ContentGenerationOutputSchema,
} from "../schemas";
import {
  SEARCH_FILTER_FIXTURE,
  SEARCH_FILTER_MINIMAL_FIXTURE,
  XIAOHONGSHU_FIXTURE,
  DOUYIN_FIXTURE,
  WECHAT_MOMENTS_FIXTURE,
} from "../fixtures";

describe("Prompt fixtures pass Zod schemas", () => {
  // ==========================================================
  // parsePropertySearch fixtures
  // ==========================================================
  describe("PropertySearchFilterSchema", () => {
    it("SEARCH_FILTER_FIXTURE passes strict() validation", () => {
      const result = PropertySearchFilterSchema.safeParse(SEARCH_FILTER_FIXTURE);
      expect(result.success).toBe(true);
    });

    it("SEARCH_FILTER_MINIMAL_FIXTURE passes strict() validation", () => {
      const result = PropertySearchFilterSchema.safeParse(SEARCH_FILTER_MINIMAL_FIXTURE);
      expect(result.success).toBe(true);
    });

    it("SEARCH_FILTER_MINIMAL_FIXTURE has required parsedQuery", () => {
      const result = PropertySearchFilterSchema.parse(SEARCH_FILTER_MINIMAL_FIXTURE);
      expect(result.parsedQuery).toBe("广州租房");
      expect(result.unrecognizedTerms).toEqual([]);
    });
  });

  // ==========================================================
  // generateContent fixtures — all platforms
  // ==========================================================
  describe("ContentGenerationOutputSchema", () => {
    it("XIAOHONGSHU_FIXTURE passes discriminated union", () => {
      const result = ContentGenerationOutputSchema.safeParse(XIAOHONGSHU_FIXTURE);
      if (!result.success) {
        console.error(
          "XIAOHONGSHU_FIXTURE Zod errors:",
          JSON.stringify(result.error.issues, null, 2)
        );
      }
      expect(result.success).toBe(true);
    });

    it("DOUYIN_FIXTURE passes discriminated union", () => {
      const result = ContentGenerationOutputSchema.safeParse(DOUYIN_FIXTURE);
      if (!result.success) {
        console.error(
          "DOUYIN_FIXTURE Zod errors:",
          JSON.stringify(result.error.issues, null, 2)
        );
      }
      expect(result.success).toBe(true);
    });

    it("WECHAT_MOMENTS_FIXTURE passes discriminated union", () => {
      const result = ContentGenerationOutputSchema.safeParse(WECHAT_MOMENTS_FIXTURE);
      if (!result.success) {
        console.error(
          "WECHAT_MOMENTS_FIXTURE Zod errors:",
          JSON.stringify(result.error.issues, null, 2)
        );
      }
      expect(result.success).toBe(true);
    });

    // ==========================================================
    // Xiaohongshu fixture field-by-field assertions
    // ==========================================================
    it("XIAOHONGSHU_FIXTURE has correct imageSequence shape", () => {
      const parsed = ContentGenerationOutputSchema.parse(XIAOHONGSHU_FIXTURE);
      if (parsed.platform !== "xiaohongshu") throw new Error("wrong platform");

      expect(parsed.imageSequence).toHaveLength(2);
      expect(parsed.imageSequence[0]).toEqual({
        order: 1,
        description: expect.any(String),
        suggestedMediaType: "photo",
      });
    });

    it("XIAOHONGSHU_FIXTURE has correct factsUsed shape", () => {
      const parsed = ContentGenerationOutputSchema.parse(XIAOHONGSHU_FIXTURE);
      if (parsed.platform !== "xiaohongshu") throw new Error("wrong platform");

      expect(parsed.factsUsed.length).toBeGreaterThan(0);
      expect(parsed.factsUsed[0]).toEqual({
        field: expect.any(String),
        value: expect.any(String),
      });
    });

    it("XIAOHONGSHU_FIXTURE requiresFactReview is boolean", () => {
      const parsed = ContentGenerationOutputSchema.parse(XIAOHONGSHU_FIXTURE);
      if (parsed.platform !== "xiaohongshu") throw new Error("wrong platform");

      expect(typeof parsed.requiresFactReview).toBe("boolean");
    });

    it("XIAOHONGSHU_FIXTURE has factualSummary", () => {
      const parsed = ContentGenerationOutputSchema.parse(XIAOHONGSHU_FIXTURE);
      if (parsed.platform !== "xiaohongshu") throw new Error("wrong platform");

      expect(parsed.factualSummary).toBeTruthy();
      expect(typeof parsed.factualSummary).toBe("string");
    });

    // ==========================================================
    // Douyin fixture field-by-field
    // ==========================================================
    it("DOUYIN_FIXTURE has correct shots shape", () => {
      const parsed = ContentGenerationOutputSchema.parse(DOUYIN_FIXTURE);
      if (parsed.platform !== "douyin") throw new Error("wrong platform");

      expect(parsed.shots).toHaveLength(2);
      expect(parsed.shots[0]).toEqual({
        order: 1,
        durationSeconds: expect.any(Number),
        description: expect.any(String),
        visualSuggestion: expect.any(String),
      });
    });

    // ==========================================================
    // WeChat Moments fixture field-by-field
    // ==========================================================
    it("WECHAT_MOMENTS_FIXTURE has copyOptions", () => {
      const parsed = ContentGenerationOutputSchema.parse(WECHAT_MOMENTS_FIXTURE);
      if (parsed.platform !== "wechat_moments") throw new Error("wrong platform");

      expect(parsed.copyOptions.length).toBeGreaterThan(0);
      expect(parsed.requiresFactReview).toBe(false);
    });

    // ==========================================================
    // Extra fields still rejected (strict() enforcement)
    // ==========================================================
    it("SEARCH_FILTER_FIXTURE with extra field fails strict()", () => {
      const withExtra = { ...SEARCH_FILTER_FIXTURE, injectedField: "bad" };
      const result = PropertySearchFilterSchema.safeParse(withExtra);
      expect(result.success).toBe(false);
    });

    // ContentGenerationOutputSchema uses discriminatedUnion without .strict(),
    // so extra fields pass through — this is by contract (§11.5: only
    // PropertySearchFilterSchema requires strict). Verify the fixture still
    // parses correctly regardless.
    it("XIAOHONGSHU_FIXTURE with extra field still parses (non-strict by contract)", () => {
      const withExtra = { ...XIAOHONGSHU_FIXTURE, injectedField: "bad" };
      const result = ContentGenerationOutputSchema.safeParse(withExtra);
      // Non-strict: extra fields are ignored, not rejected
      expect(result.success).toBe(true);
    });
  });

  // ==========================================================
  // Other schemas also validated
  // ==========================================================
  describe("Extraction schemas", () => {
    it("PropertyExtractionOutputSchema is a valid Zod schema", () => {
      // Verify schema exists and can at least parse a valid shape
      const result = PropertyExtractionOutputSchema.safeParse({
        data: { title: "test" },
        missingFields: [],
        uncertainFields: [],
        rawText: "test",
        usage: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 },
      });
      expect(result.success).toBe(true);
    });

    it("ClientExtractionOutputSchema is a valid Zod schema", () => {
      const result = ClientExtractionOutputSchema.safeParse({
        data: { name: "test" },
        missingFields: [],
        uncertainFields: [],
        rawText: "test",
        usage: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 },
      });
      expect(result.success).toBe(true);
    });
  });
});
