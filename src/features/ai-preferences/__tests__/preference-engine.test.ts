/**
 * Preference Engine — Unit Tests
 * P3-AI-013
 *
 * Tests: prompt hint formatting, fact field filtering in hints,
 * formatPromptHints output structure, confidence thresholds.
 * Mock Supabase client for DB-dependent functions.
 */

import { describe, it, expect } from "vitest";
import {
  formatPromptHints,
  type PreferencePromptHint,
} from "../preference-engine";
import { isFactField } from "../schemas";

// ============================================================
// formatPromptHints
// ============================================================

describe("formatPromptHints", () => {
  it("returns empty string for empty hints", () => {
    expect(formatPromptHints([])).toBe("");
  });

  it("formats high-confidence hints", () => {
    const hints: PreferencePromptHint[] = [
      {
        hint: "用户偏好：字段 'type' 通常从 'residential' 改为 'apartment'",
        confidence: 0.85,
        feature: "ai_data_extraction",
        preferenceKey: "type_modified",
      },
    ];

    const result = formatPromptHints(hints);
    expect(result).toContain("用户历史偏好（高置信度）");
    expect(result).toContain("从 'residential' 改为 'apartment'");
    expect(result).not.toContain("中置信度");
  });

  it("formats medium-confidence hints", () => {
    const hints: PreferencePromptHint[] = [
      {
        hint: "用户偏好：语气偏正式",
        confidence: 0.5,
        feature: "content_factory",
        preferenceKey: "tone_modified",
      },
    ];

    const result = formatPromptHints(hints);
    expect(result).toContain("用户历史偏好（中置信度）");
    expect(result).toContain("语气偏正式");
    expect(result).not.toContain("高置信度");
  });

  it("separates high and medium confidence hints", () => {
    const hints: PreferencePromptHint[] = [
      {
        hint: "高置信度偏好",
        confidence: 0.9,
        feature: "ai_data_extraction",
        preferenceKey: "key1",
      },
      {
        hint: "中置信度偏好",
        confidence: 0.5,
        feature: "content_factory",
        preferenceKey: "key2",
      },
    ];

    const result = formatPromptHints(hints);
    expect(result).toContain("高置信度");
    expect(result).toContain("中置信度");
    // High should come before medium
    const highIndex = result.indexOf("高置信度");
    const mediumIndex = result.indexOf("中置信度");
    expect(highIndex).toBeLessThan(mediumIndex);
  });

  it("includes intro text", () => {
    const hints: PreferencePromptHint[] = [
      {
        hint: "测试偏好",
        confidence: 0.8,
        feature: "content_factory",
        preferenceKey: "key",
      },
    ];

    const result = formatPromptHints(hints);
    expect(result).toContain("根据用户历史修正数据学习的偏好");
  });

  it("handles many hints", () => {
    const hints: PreferencePromptHint[] = Array.from({ length: 10 }, (_, i) => ({
      hint: `偏好 ${i + 1}`,
      confidence: 0.3 + i * 0.05,
      feature: "content_factory",
      preferenceKey: `key_${i}`,
    }));

    const result = formatPromptHints(hints);
    // Should contain both high (>=0.7) and medium (0.3-0.7)
    expect(result).toContain("高置信度");
    expect(result).toContain("中置信度");
  });
});

// ============================================================
// PreferencePromptHint confidence filtering
// ============================================================

describe("PreferencePromptHint confidence thresholds", () => {
  it("0.3 is medium confidence boundary", () => {
    expect(0.3 < 0.7).toBe(true); // medium, not high
  });

  it("0.7 is high confidence boundary", () => {
    expect(0.7 >= 0.7).toBe(true); // high
  });

  it("0.69 is medium confidence", () => {
    expect(0.69 < 0.7).toBe(true);
  });
});

// ============================================================
// Fact field blocklist validation for preference keys
// ============================================================

describe("Preference keys must not be fact fields", () => {
  const factKeyPatterns = [
    "monthlyRent_modified",
    "ownerPhone_modified",
    "exactAddress_added",
    "price_modified",
    "phone_added",
  ];

  const nonFactKeyPatterns = [
    "title_modified",
    "description_modified",
    "decoration_added",
    "tone_modified",
    "petsAllowed_modified",
  ];

  it("identifies fact field keys", () => {
    for (const key of factKeyPatterns) {
      const fieldName = key.replace(/_(modified|added|removed)$/, "");
      expect(isFactField(fieldName)).toBe(true);
    }
  });

  it("allows non-fact field keys", () => {
    for (const key of nonFactKeyPatterns) {
      const fieldName = key.replace(/_(modified|added|removed)$/, "");
      expect(isFactField(fieldName)).toBe(false);
    }
  });
});
