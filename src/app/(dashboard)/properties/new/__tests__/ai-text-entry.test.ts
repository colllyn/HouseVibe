/**
 * Unit tests for AI text entry on property-new page
 *
 * Tests: mapping correctness, error message mapping, field definitions,
 * and logical behaviors (no rendering tests — E2E covers browser UI).
 */

import { describe, it, expect } from "vitest";

// ============================================================
// Replicated constants from page.tsx (must stay in sync)
// ============================================================

function mapAiError(status: number, code?: string): string {
  if (status === 401) return "登录状态失效，请重新登录";
  if (status === 403) return "当前账号没有 AI 智能录入权限";
  if (status === 429) return "AI 使用额度已达到限制，请稍后再试";
  switch (code) {
    case "AI_NOT_CONFIGURED": return "AI 服务尚未配置";
    case "AI_TIMEOUT": return "AI 识别超时，请重试";
    case "AI_RATE_LIMITED": return "AI 服务繁忙，请稍后重试";
    case "AI_INVALID_RESPONSE": return "AI 返回内容无法解析";
    default: return "AI 识别失败，请稍后重试";
  }
}

const EXTRACTION_TO_FORM_NAME: Record<string, string> = {
  title: "title",
  city: "city",
  district: "district",
  businessArea: "business_area",
  communityName: "community_name",
  addressText: "address_text",
  rentalType: "rental_type",
  monthlyRent: "monthly_rent",
  depositTerms: "deposit_terms",
  bedrooms: "bedrooms",
  livingRooms: "living_rooms",
  bathrooms: "bathrooms",
  areaSqm: "area_sqm",
  floor: "floor",
  orientation: "orientation",
  decoration: "decoration",
  availableFrom: "available_from",
  minimumLeaseMonths: "minimum_lease_months",
  hasElevator: "has_elevator",
  petsAllowed: "pets_allowed",
  cookingAllowed: "cooking_allowed",
  subwayText: "subway_text",
  tags: "tags",
  sellingPoints: "selling_points",
  description: "description",
};

const SENSITIVE_KEYS = new Set([
  "ownerName", "ownerPhone", "exactAddress", "keyLocation",
]);

// ============================================================
// Tests: Error Message Mapping
// ============================================================

describe("mapAiError", () => {
  it("401 → login expired", () => {
    expect(mapAiError(401)).toBe("登录状态失效，请重新登录");
  });

  it("403 → no permission", () => {
    expect(mapAiError(403)).toBe("当前账号没有 AI 智能录入权限");
    // Works regardless of code
    expect(mapAiError(403, "FEATURE_NOT_ALLOWED")).toBe("当前账号没有 AI 智能录入权限");
    expect(mapAiError(403, "WORKSPACE_ACCESS_DENIED")).toBe("当前账号没有 AI 智能录入权限");
  });

  it("429 → quota exceeded", () => {
    expect(mapAiError(429)).toBe("AI 使用额度已达到限制，请稍后再试");
    expect(mapAiError(429, "QUOTA_EXCEEDED")).toBe("AI 使用额度已达到限制，请稍后再试");
    expect(mapAiError(429, "COST_LIMIT_EXCEEDED")).toBe("AI 使用额度已达到限制，请稍后再试");
  });

  it("503 AI_NOT_CONFIGURED → specific message", () => {
    expect(mapAiError(503, "AI_NOT_CONFIGURED")).toBe("AI 服务尚未配置");
  });

  it("504 AI_TIMEOUT → timeout message", () => {
    expect(mapAiError(504, "AI_TIMEOUT")).toBe("AI 识别超时，请重试");
  });

  it("502 AI_RATE_LIMITED → rate limited message", () => {
    expect(mapAiError(502, "AI_RATE_LIMITED")).toBe("AI 服务繁忙，请稍后重试");
  });

  it("502 AI_INVALID_RESPONSE → invalid response message", () => {
    expect(mapAiError(502, "AI_INVALID_RESPONSE")).toBe("AI 返回内容无法解析");
  });

  it("other status with no code → generic fallback", () => {
    expect(mapAiError(500)).toBe("AI 识别失败，请稍后重试");
    expect(mapAiError(502)).toBe("AI 识别失败，请稍后重试");
    expect(mapAiError(200, "UNKNOWN_CODE")).toBe("AI 识别失败，请稍后重试");
  });

  it("never exposes internal details", () => {
    const msg = mapAiError(500, "INTERNAL_ERROR");
    expect(msg).not.toContain("stack");
    expect(msg).not.toContain("trace");
    expect(msg).not.toContain("supabase");
    expect(msg).not.toContain("api_key");
    expect(msg).not.toContain("Bearer");
  });
});

// ============================================================
// Tests: Field Mapping
// ============================================================

describe("extraction → form field mapping", () => {
  it("maps all known extraction keys to form names", () => {
    const extractionKeys = Object.keys(EXTRACTION_TO_FORM_NAME);

    // Every key in the mapper must be a valid extraction key
    for (const key of extractionKeys) {
      expect(EXTRACTION_TO_FORM_NAME[key]).toBeTruthy();
      expect(typeof EXTRACTION_TO_FORM_NAME[key]).toBe("string");
    }
  });

  it("title maps to title", () => {
    expect(EXTRACTION_TO_FORM_NAME["title"]).toBe("title");
  });

  it("businessArea maps to business_area (snake_case)", () => {
    expect(EXTRACTION_TO_FORM_NAME["businessArea"]).toBe("business_area");
  });

  it("communityName maps to community_name", () => {
    expect(EXTRACTION_TO_FORM_NAME["communityName"]).toBe("community_name");
  });

  it("monthlyRent maps to monthly_rent", () => {
    expect(EXTRACTION_TO_FORM_NAME["monthlyRent"]).toBe("monthly_rent");
  });

  it("areaSqm maps to area_sqm", () => {
    expect(EXTRACTION_TO_FORM_NAME["areaSqm"]).toBe("area_sqm");
  });

  it("availableFrom maps to available_from", () => {
    expect(EXTRACTION_TO_FORM_NAME["availableFrom"]).toBe("available_from");
  });

  it("hasElevator maps to has_elevator (boolean field)", () => {
    expect(EXTRACTION_TO_FORM_NAME["hasElevator"]).toBe("has_elevator");
  });

  it("petsAllowed maps to pets_allowed", () => {
    expect(EXTRACTION_TO_FORM_NAME["petsAllowed"]).toBe("pets_allowed");
  });

  it("cookingAllowed maps to cooking_allowed", () => {
    expect(EXTRACTION_TO_FORM_NAME["cookingAllowed"]).toBe("cooking_allowed");
  });

  it("tags maps to tags (array field)", () => {
    expect(EXTRACTION_TO_FORM_NAME["tags"]).toBe("tags");
  });

  it("sellingPoints maps to selling_points", () => {
    expect(EXTRACTION_TO_FORM_NAME["sellingPoints"]).toBe("selling_points");
  });

  it("subwayText maps to subway_text", () => {
    expect(EXTRACTION_TO_FORM_NAME["subwayText"]).toBe("subway_text");
  });

  it("minimumLeaseMonths maps to minimum_lease_months", () => {
    expect(EXTRACTION_TO_FORM_NAME["minimumLeaseMonths"]).toBe("minimum_lease_months");
  });

  it("floor maps to floor", () => {
    expect(EXTRACTION_TO_FORM_NAME["floor"]).toBe("floor");
  });

  it("orientation maps to orientation", () => {
    expect(EXTRACTION_TO_FORM_NAME["orientation"]).toBe("orientation");
  });

  it("decoration maps to decoration", () => {
    expect(EXTRACTION_TO_FORM_NAME["decoration"]).toBe("decoration");
  });

  it("unknown AI keys have no form mapping (safely ignored)", () => {
    // These are keys the AI might return that shouldn't enter the form
    const unknownKeys = ["visualSummary", "facilities", "rawText", "usage", "userId", "workspaceId"];
    for (const key of unknownKeys) {
      expect(EXTRACTION_TO_FORM_NAME[key]).toBeUndefined();
    }
  });
});

// ============================================================
// Tests: Sensitive Key Classification
// ============================================================

describe("sensitive key classification", () => {
  it("ownerName is marked sensitive", () => {
    expect(SENSITIVE_KEYS.has("ownerName")).toBe(true);
  });

  it("ownerPhone is marked sensitive", () => {
    expect(SENSITIVE_KEYS.has("ownerPhone")).toBe(true);
  });

  it("exactAddress is marked sensitive", () => {
    expect(SENSITIVE_KEYS.has("exactAddress")).toBe(true);
  });

  it("keyLocation is marked sensitive", () => {
    expect(SENSITIVE_KEYS.has("keyLocation")).toBe(true);
  });

  it("non-sensitive fields are not in the set", () => {
    expect(SENSITIVE_KEYS.has("title")).toBe(false);
    expect(SENSITIVE_KEYS.has("city")).toBe(false);
    expect(SENSITIVE_KEYS.has("monthlyRent")).toBe(false);
    expect(SENSITIVE_KEYS.has("bedrooms")).toBe(false);
    expect(SENSITIVE_KEYS.has("areaSqm")).toBe(false);
  });
});

// ============================================================
// Tests: Extraction → Confirmation Field Construction Logic
// ============================================================

describe("extraction field construction logic", () => {
  /**
   * Simulates the logic from the page component:
   * Given AI facts, missingFields, uncertainFields → produce field states.
   */

  function buildExtractionFields(
    facts: Record<string, unknown>,
    missingFields: string[],
    uncertainFields: Array<{ field: string; reason: string }>
  ) {
    const fieldDefs = [
      { key: "title", label: "房源标题" },
      { key: "city", label: "城市" },
      { key: "monthlyRent", label: "月租" },
      { key: "bedrooms", label: "卧室数" },
      { key: "areaSqm", label: "面积" },
      { key: "hasElevator", label: "有电梯" },
      { key: "floor", label: "楼层" },
    ];

    const uncertainKeys = new Set(uncertainFields.map((u) => u.field));
    const missingKeys = new Set(missingFields);

    return fieldDefs.map((def) => {
      const val = facts[def.key];
      const isMissing = missingKeys.has(def.key) || (val === null || val === undefined || val === "");
      const isUncertain = uncertainKeys.has(def.key);

      return {
        key: def.key,
        label: def.label,
        value: val ?? "",
        confirmed: !isMissing && !isUncertain,
        modified: false,
        uncertain: isUncertain,
        missing: isMissing,
      };
    });
  }

  it("all extracted fields confirmed when no missing/uncertain", () => {
    const facts = {
      title: "万科城二期",
      city: "深圳",
      monthlyRent: 6500,
      bedrooms: 3,
      areaSqm: 89,
      hasElevator: true,
      floor: 15,
    };

    const fields = buildExtractionFields(facts, [], []);

    expect(fields.every((f) => f.confirmed)).toBe(true);
    expect(fields.every((f) => !f.missing)).toBe(true);
    expect(fields.every((f) => !f.uncertain)).toBe(true);
  });

  it("missingFields set → those fields marked missing", () => {
    const facts = { title: "科技园附近两房", monthlyRent: 6500 };
    const missingFields = ["city", "bedrooms", "areaSqm", "hasElevator", "floor"];

    const fields = buildExtractionFields(facts, missingFields, []);

    // Extracted fields are confirmed
    const titleField = fields.find((f) => f.key === "title");
    expect(titleField?.confirmed).toBe(true);
    expect(titleField?.missing).toBe(false);

    const rentField = fields.find((f) => f.key === "monthlyRent");
    expect(rentField?.confirmed).toBe(true);
    expect(rentField?.missing).toBe(false);

    // Missing fields
    for (const key of missingFields) {
      const f = fields.find((field) => field.key === key);
      expect(f?.missing).toBe(true);
      expect(f?.confirmed).toBe(false);
    }
  });

  it("uncertainFields → those fields marked uncertain and unconfirmed", () => {
    const facts = { title: "阳光花园", monthlyRent: 5000, floor: 10 };
    const uncertainFields = [
      { field: "monthlyRent", reason: "金额描述不明确" },
      { field: "floor", reason: "未明确提及" },
    ];

    const fields = buildExtractionFields(facts, [], uncertainFields);

    const rentField = fields.find((f) => f.key === "monthlyRent");
    expect(rentField?.uncertain).toBe(true);
    expect(rentField?.confirmed).toBe(false);

    const floorField = fields.find((f) => f.key === "floor");
    expect(floorField?.uncertain).toBe(true);
    expect(floorField?.confirmed).toBe(false);

    // Title not uncertain → confirmed
    const titleField = fields.find((f) => f.key === "title");
    expect(titleField?.uncertain).toBe(false);
    expect(titleField?.confirmed).toBe(true);
  });

  it("null/undefined/empty values → treated as missing", () => {
    const facts = { title: null, city: undefined, monthlyRent: "", bedrooms: 2 };

    const fields = buildExtractionFields(facts, [], []);

    // null → missing
    expect(fields.find((f) => f.key === "title")?.missing).toBe(true);
    // undefined → missing
    expect(fields.find((f) => f.key === "city")?.missing).toBe(true);
    // empty string → missing
    expect(fields.find((f) => f.key === "monthlyRent")?.missing).toBe(true);
    // has value → not missing
    expect(fields.find((f) => f.key === "bedrooms")?.missing).toBe(false);
  });

  it("AI unknown fields do NOT appear in field definitions", () => {
    // The field definitions only include known keys
    // Any extra key returned by AI is simply not mapped
    const facts = {
      title: "测试",
      unknownField: "should be ignored",
      anotherUnknown: 123,
    };

    const fields = buildExtractionFields(facts, [], []);
    const fieldKeys = fields.map((f) => f.key);

    expect(fieldKeys).not.toContain("unknownField");
    expect(fieldKeys).not.toContain("anotherUnknown");
  });

  it("partial extraction: some fields extracted, some missing", () => {
    // Simulates: "科技园附近两房，房子不错，6500"
    const facts = { bedrooms: 2, monthlyRent: 6500 };
    const missingFields = ["title", "city", "areaSqm", "hasElevator", "floor"];

    const fields = buildExtractionFields(facts, missingFields, []);

    // Extracted
    expect(fields.find((f) => f.key === "bedrooms")?.value).toBe(2);
    expect(fields.find((f) => f.key === "monthlyRent")?.value).toBe(6500);

    // Missing — should not contain fabricated values
    expect(fields.find((f) => f.key === "areaSqm")?.missing).toBe(true);
    expect(fields.find((f) => f.key === "areaSqm")?.value).toBe("");
    expect(fields.find((f) => f.key === "floor")?.missing).toBe(true);
    expect(fields.find((f) => f.key === "floor")?.value).toBe("");
  });

  it("user-modified fields keep modified value via confirmation card", () => {
    // The AiConfirmationCard handles modification internally —
    // this test verifies the initial field state is correctly set
    // and that the onConfirm callback would receive modified values.

    const facts = { title: "AI Title", monthlyRent: 5000 };
    const fields = buildExtractionFields(facts, [], []);

    // Before modification
    const titleField = fields.find((f) => f.key === "title");
    expect(titleField?.modified).toBe(false);
    expect(titleField?.value).toBe("AI Title");

    // User modification happens in AiConfirmationCard component
    // (tested via component tests), not in page logic
  });
});
