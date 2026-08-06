/**
 * AI Preferences Schemas — Unit Tests
 * P3-AI-013
 *
 * Tests: Zod schema validation, fact field blocklist, filtering
 */

import { describe, it, expect } from "vitest";
import {
  PreferenceStatusEnum,
  PreferenceValueSchema,
  UserPreferenceSchema,
  TogglePreferenceRequestSchema,
  FACT_FIELD_BLOCKLIST,
  isFactField,
  filterFactFields,
} from "../schemas";

// ============================================================
// PreferenceStatusEnum
// ============================================================

describe("PreferenceStatusEnum", () => {
  it("accepts 'active'", () => {
    expect(PreferenceStatusEnum.safeParse("active").success).toBe(true);
  });

  it("accepts 'disabled'", () => {
    expect(PreferenceStatusEnum.safeParse("disabled").success).toBe(true);
  });

  it("rejects invalid status", () => {
    expect(PreferenceStatusEnum.safeParse("deleted").success).toBe(false);
  });

  it("rejects non-string", () => {
    expect(PreferenceStatusEnum.safeParse(123).success).toBe(false);
  });

  it("rejects empty string", () => {
    expect(PreferenceStatusEnum.safeParse("").success).toBe(false);
  });
});

// ============================================================
// PreferenceValueSchema
// ============================================================

describe("PreferenceValueSchema", () => {
  it("accepts valid preference value", () => {
    const result = PreferenceValueSchema.safeParse({
      correctionDirection: "modified",
      originalPattern: "residential",
      preferredPattern: "apartment",
      hint: "用户偏好：字段 'type' 通常从 'residential' 改为 'apartment'",
    });
    expect(result.success).toBe(true);
  });

  it("accepts minimal preference value", () => {
    const result = PreferenceValueSchema.safeParse({
      correctionDirection: "added",
      hint: "用户偏好：字段需要补充",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid correctionDirection", () => {
    const result = PreferenceValueSchema.safeParse({
      correctionDirection: "unchanged",
      hint: "test",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing hint", () => {
    const result = PreferenceValueSchema.safeParse({
      correctionDirection: "modified",
    });
    expect(result.success).toBe(false);
  });

  it("accepts null original/preferred pattern", () => {
    const result = PreferenceValueSchema.safeParse({
      correctionDirection: "removed",
      originalPattern: null,
      preferredPattern: null,
      hint: "test",
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================
// UserPreferenceSchema
// ============================================================

describe("UserPreferenceSchema", () => {
  const validPref = {
    id: "00000000-0000-0000-0000-000000000001",
    feature: "content_factory" as const,
    preferenceKey: "type_modified",
    preferenceValue: {
      correctionDirection: "modified" as const,
      originalPattern: "residential",
      preferredPattern: "apartment",
      hint: "偏好提示",
    },
    evidenceCount: 5,
    confidence: 0.8,
    status: "active" as const,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  it("accepts valid preference", () => {
    const result = UserPreferenceSchema.safeParse(validPref);
    expect(result.success).toBe(true);
  });

  it("rejects negative evidence count", () => {
    const result = UserPreferenceSchema.safeParse({
      ...validPref,
      evidenceCount: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects confidence over 1.0", () => {
    const result = UserPreferenceSchema.safeParse({
      ...validPref,
      confidence: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects confidence under 0", () => {
    const result = UserPreferenceSchema.safeParse({
      ...validPref,
      confidence: -0.1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing id", () => {
    const { id: _id, ...withoutId } = validPref;
    const result = UserPreferenceSchema.safeParse(withoutId);
    expect(result.success).toBe(false);
  });

  it("rejects invalid feature", () => {
    const result = UserPreferenceSchema.safeParse({
      ...validPref,
      feature: "nonexistent_feature",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid features", () => {
    const features = [
      "ai_data_extraction",
      "semantic_search",
      "property_matching",
      "shared_property_pool",
      "content_factory",
    ];
    for (const feature of features) {
      const result = UserPreferenceSchema.safeParse({
        ...validPref,
        feature,
      });
      expect(result.success).toBe(true);
    }
  });
});

// ============================================================
// TogglePreferenceRequestSchema
// ============================================================

describe("TogglePreferenceRequestSchema", () => {
  it("accepts status: active", () => {
    expect(TogglePreferenceRequestSchema.safeParse({ status: "active" }).success).toBe(true);
  });

  it("accepts status: disabled", () => {
    expect(TogglePreferenceRequestSchema.safeParse({ status: "disabled" }).success).toBe(true);
  });

  it("rejects extra fields (strict)", () => {
    const result = TogglePreferenceRequestSchema.safeParse({
      status: "active",
      extra: "field",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing status", () => {
    expect(TogglePreferenceRequestSchema.safeParse({}).success).toBe(false);
  });
});

// ============================================================
// Fact field blocklist
// ============================================================

describe("FACT_FIELD_BLOCKLIST", () => {
  it("blocks monthlyRent", () => {
    expect(isFactField("monthlyRent")).toBe(true);
  });

  it("blocks ownerPhone", () => {
    expect(isFactField("ownerPhone")).toBe(true);
  });

  it("blocks exactAddress", () => {
    expect(isFactField("exactAddress")).toBe(true);
  });

  it("blocks snake_case variants", () => {
    expect(isFactField("monthly_rent")).toBe(true);
    expect(isFactField("owner_phone")).toBe(true);
    expect(isFactField("exact_address")).toBe(true);
  });

  it("blocks generic fields", () => {
    expect(isFactField("price")).toBe(true);
    expect(isFactField("phone")).toBe(true);
    expect(isFactField("address")).toBe(true);
  });

  it("allows non-fact fields", () => {
    expect(isFactField("title")).toBe(false);
    expect(isFactField("description")).toBe(false);
    expect(isFactField("decoration")).toBe(false);
    expect(isFactField("orientation")).toBe(false);
    expect(isFactField("petsAllowed")).toBe(false);
    expect(isFactField("facilities")).toBe(false);
    expect(isFactField("tags")).toBe(false);
  });

  it("has no duplicates between camelCase and snake_case", () => {
    const values = Array.from(FACT_FIELD_BLOCKLIST);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});

// ============================================================
// filterFactFields
// ============================================================

describe("filterFactFields", () => {
  it("removes fact fields from list", () => {
    const fields = ["title", "monthlyRent", "description", "ownerPhone"];
    const result = filterFactFields(fields);
    expect(result).toEqual(["title", "description"]);
  });

  it("returns empty array when all are fact fields", () => {
    const fields = ["monthlyRent", "ownerPhone", "exactAddress"];
    expect(filterFactFields(fields)).toEqual([]);
  });

  it("returns same array when no fact fields", () => {
    const fields = ["title", "description", "decoration"];
    expect(filterFactFields(fields)).toEqual(fields);
  });

  it("handles empty array", () => {
    expect(filterFactFields([])).toEqual([]);
  });
});
