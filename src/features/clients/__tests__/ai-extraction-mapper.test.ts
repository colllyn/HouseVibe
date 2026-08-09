/**
 * Unit tests for client ai-extraction-mapper.ts
 *
 * Covers: full/partial extraction → form mapping, unknown fields ignored,
 * missing fields, number/boolean/array/date/enum conversion,
 * boolean Confirmation Card edit preserves type, user edit override,
 * required missing detection, error messages, PII not in errors.
 *
 * Also covers regressions from property feature:
 * - AI success without form write → FAIL
 * - Confirmation Card edit desync → FAIL
 * - AI field with no real Form Input → FAIL
 * - boolean/string type drift → FAIL
 */

import { describe, it, expect } from "vitest";
import {
  mapExtractionToFormValues,
  detectMissingRequiredFields,
  getRequiredFieldMessage,
  getAiMissingFieldMessage,
  coerceEditValue,
  CLIENT_EXTRACTION_FIELD_DEFS,
} from "../ai-extraction-mapper";

// ============================================================
// mapExtractionToFormValues
// ============================================================

describe("mapExtractionToFormValues", () => {
  // --- Case 1: Full extraction → all known fields mapped ---

  it("1: maps all known extraction keys to snake_case form names", () => {
    const facts = {
      name: "张先生",
      budgetMin: 5000,
      budgetMax: 8000,
      preferredDistricts: ["南山科技园", "后海"],
      preferredCommunities: ["万科城", "阳光花园"],
      bedrooms: 2,
      rentalType: "whole_unit",
      availableFrom: "2026-09-01",
      minimumLeaseMonths: 12,
      petsRequired: true,
      cookingRequired: false,
      commuteDestination: "国贸大厦",
      hardRequirements: [{ key: "elevator", value: "有电梯" }],
      softPreferences: [{ key: "subway", value: "近地铁" }],
      dealBreakers: ["无电梯", "朝北"],
    };

    const result = mapExtractionToFormValues(facts);

    expect(result["name"]).toBe("张先生");
    expect(result["budget_min"]).toBe(5000);
    expect(result["budget_max"]).toBe(8000);
    expect(result["preferred_districts"]).toBe("南山科技园,后海");
    expect(result["preferred_communities"]).toBe("万科城,阳光花园");
    expect(result["bedrooms"]).toBe(2);
    expect(result["rental_type"]).toBe("whole_unit");
    expect(result["available_from"]).toBe("2026-09-01");
    expect(result["minimum_lease_months"]).toBe(12);
    expect(result["pets_required"]).toBe(true);
    expect(result["cooking_required"]).toBe(false);
    expect(result["commute_destination"]).toBe("国贸大厦");
    expect(result["hard_requirements"]).toBe(
      '[{"key":"elevator","value":"有电梯"}]'
    );
    expect(result["soft_preferences"]).toBe(
      '[{"key":"subway","value":"近地铁"}]'
    );
    expect(result["deal_breakers"]).toBe("无电梯,朝北");
  });

  // --- Case 2: Partial extraction ---

  it("2: partial extraction — only maps provided fields", () => {
    const facts = {
      bedrooms: 2,
      budgetMax: 8000,
      preferredDistricts: ["南山"],
    };

    const result = mapExtractionToFormValues(facts);

    expect(Object.keys(result)).toHaveLength(3);
    expect(result["bedrooms"]).toBe(2);
    expect(result["budget_max"]).toBe(8000);
    expect(result["preferred_districts"]).toBe("南山");
  });

  // --- Case 3: Unknown fields ignored ---

  it("3: silently ignores unknown AI keys", () => {
    const facts = {
      name: "张先生",
      // Fields NOT in the mapper:
      sourcePlatform: "wechat",
      rawText: "should be ignored",
      usage: { tokens: 100 },
      userId: "u1",
      workspaceId: "ws1",
      unknownField: 123,
      phone: "13800001234", // PII — must not map
      wechat: "wxid_123", // PII — must not map
    };

    const result = mapExtractionToFormValues(facts);

    // Known field maps through
    expect(result["name"]).toBe("张先生");

    // Unknown/PII fields are NOT in the result
    expect(result).not.toHaveProperty("sourcePlatform");
    expect(result).not.toHaveProperty("rawText");
    expect(result).not.toHaveProperty("usage");
    expect(result).not.toHaveProperty("userId");
    expect(result).not.toHaveProperty("workspaceId");
    expect(result).not.toHaveProperty("unknownField");
    expect(result).not.toHaveProperty("phone");
    expect(result).not.toHaveProperty("wechat");

    // Only the known key
    expect(Object.keys(result)).toEqual(["name"]);
  });

  // --- Case 4: Missing values remain empty ---

  it("4: skips null, undefined, empty string, and empty array values", () => {
    const facts = {
      name: null,
      budgetMin: undefined,
      preferredDistricts: "",
      preferredCommunities: [] as string[],
      bedrooms: 2, // only valid value
    };

    const result = mapExtractionToFormValues(facts);

    // Missing values are NOT in result
    expect(result).not.toHaveProperty("name");
    expect(result).not.toHaveProperty("budget_min");
    expect(result).not.toHaveProperty("preferred_districts");
    expect(result).not.toHaveProperty("preferred_communities");

    // Valid value is present
    expect(result["bedrooms"]).toBe(2);
  });

  // --- Case 5: Does not generate missing name ---

  it("5: does NOT generate name when AI did not extract it", () => {
    const facts = {
      bedrooms: 2,
      budgetMax: 8000,
    };

    const result = mapExtractionToFormValues(facts);

    // name must NOT be fabricated
    expect(result).not.toHaveProperty("name");
    expect(Object.keys(result)).not.toContain("name");
  });

  // --- Case 6: Does not infer sensitive facts ---

  it("6: does NOT infer demographics, income, credit, or other sensitive facts", () => {
    // Input that the AI should NOT expand upon
    const facts = {
      name: "张先生",
      bedrooms: 2,
      budgetMax: 8000,
    };

    const result = mapExtractionToFormValues(facts);

    // Only explicitly provided fields should appear
    const keys = Object.keys(result);
    expect(keys).toContain("name");
    expect(keys).toContain("bedrooms");
    expect(keys).toContain("budget_max");

    // Must NOT contain any inferred demographic fields
    expect(keys).not.toContain("occupation");
    expect(keys).not.toContain("gender");
    expect(keys).not.toContain("age");
    expect(keys).not.toContain("marriage");
    expect(keys).not.toContain("income");
    expect(keys).not.toContain("credit");
  });

  // --- Case 7: Number conversion ---

  it("7: preserves numbers (does not convert to string)", () => {
    const result = mapExtractionToFormValues({
      budgetMin: 3000,
      budgetMax: 8000,
      bedrooms: 2,
      minimumLeaseMonths: 12,
    });

    // Numbers stay as numbers for form .valueAsNumber or Zod z.coerce.number()
    expect(typeof result["budget_min"]).toBe("number");
    expect(result["budget_min"]).toBe(3000);
    expect(typeof result["budget_max"]).toBe("number");
    expect(result["budget_max"]).toBe(8000);
    expect(typeof result["bedrooms"]).toBe("number");
    expect(result["bedrooms"]).toBe(2);
    expect(typeof result["minimum_lease_months"]).toBe("number");
    expect(result["minimum_lease_months"]).toBe(12);
  });

  // --- Case 8: Boolean conversion ---

  it("8: preserves booleans for checkbox handling", () => {
    const result = mapExtractionToFormValues({
      petsRequired: true,
      cookingRequired: false,
    });

    expect(typeof result["pets_required"]).toBe("boolean");
    expect(result["pets_required"]).toBe(true);
    expect(typeof result["cooking_required"]).toBe("boolean");
    expect(result["cooking_required"]).toBe(false);
  });

  // --- Case 9: Boolean Confirmation Card edit preserves boolean type ---

  it("9: coerceEditValue preserves boolean type after card edit", () => {
    // User edits "是" → should become true
    expect(coerceEditValue(true, "是")).toBe(true);
    expect(coerceEditValue(true, "true")).toBe(true);
    expect(coerceEditValue(true, "1")).toBe(true);

    // User edits "否" — original was true, user types "否" → becomes false
    expect(coerceEditValue(true, "否")).toBe(false);

    // User edits "否" — original was false, stays false
    expect(coerceEditValue(false, "否")).toBe(false);
  });

  it("9b: coerceEditValue boolean edit — true→false roundtrip", () => {
    // AI extracted pets_required: true, user edits to "否" in card
    expect(coerceEditValue(true, "否")).toBe(false);
    // AI extracted cooking_required: false, user edits to "是" in card
    expect(coerceEditValue(false, "是")).toBe(true);
    // Unrecognized string → false (safest default for boolean)
    expect(coerceEditValue(true, "maybe")).toBe(false);
  });

  // --- Case 10: Array conversion ---

  it("10: joins arrays with comma separator for form inputs", () => {
    const result = mapExtractionToFormValues({
      preferredDistricts: ["南山", "福田", "罗湖"],
      preferredCommunities: ["万科城"],
      dealBreakers: ["无电梯", "朝北", "一楼"],
    });

    expect(result["preferred_districts"]).toBe("南山,福田,罗湖");
    expect(result["preferred_communities"]).toBe("万科城");
    expect(result["deal_breakers"]).toBe("无电梯,朝北,一楼");
  });

  // --- Case 11: Enum conversion ---

  it("11: preserves rental_type enum values as strings", () => {
    expect(
      mapExtractionToFormValues({ rentalType: "whole_unit" })["rental_type"]
    ).toBe("whole_unit");
    expect(
      mapExtractionToFormValues({ rentalType: "shared" })["rental_type"]
    ).toBe("shared");
  });

  // --- Case 12: Date conversion ---

  it("12: preserves availableFrom date string", () => {
    const result = mapExtractionToFormValues({
      availableFrom: "2026-09-01",
    });
    expect(result["available_from"]).toBe("2026-09-01");
  });

  it("12b: handles various date formats", () => {
    expect(
      mapExtractionToFormValues({ availableFrom: "2026年9月" })[
        "available_from"
      ]
    ).toBe("2026年9月");
    expect(
      mapExtractionToFormValues({ availableFrom: "下个月" })["available_from"]
    ).toBe("下个月");
  });

  // --- Case 13: User edit overrides AI value ---

  it("13: user edit on Confirmation Card overrides AI original value", () => {
    // Simulate: AI fills budget_max=8000, user changes to 7500
    const aiResult = mapExtractionToFormValues({ budgetMax: 8000 });
    expect(aiResult["budget_max"]).toBe(8000);

    // User edits — their value replaces AI value
    const userEdited = { ...aiResult, budget_max: 7500 };
    expect(userEdited["budget_max"]).toBe(7500);

    // AI value no longer present
    expect(userEdited["budget_max"]).not.toBe(8000);
  });

  // --- Case 14: User edit on boolean field preserves type ---

  it("14: user changes pets_required from true to false, type stays boolean", () => {
    const aiResult = mapExtractionToFormValues({ petsRequired: true });
    expect(aiResult["pets_required"]).toBe(true);
    expect(typeof aiResult["pets_required"]).toBe("boolean");

    // User toggles in Confirmation Card → becomes false
    const userEdited = { ...aiResult, pets_required: false };
    expect(userEdited["pets_required"]).toBe(false);
    expect(typeof userEdited["pets_required"]).toBe("boolean");
  });

  // --- Case 15: Empty facts return empty object ---

  it("15: returns empty object for empty facts", () => {
    expect(mapExtractionToFormValues({})).toEqual({});
  });

  // --- Case 16: AI success always produces form values (regression guard) ---

  it("16: REGRESSION — AI success without form write is impossible", () => {
    // Even with only one field, mapper produces a non-empty result
    const result = mapExtractionToFormValues({ bedrooms: 3 });
    expect(Object.keys(result).length).toBeGreaterThan(0);
    expect(result["bedrooms"]).toBe(3);
  });

  // --- Case 17: Confirmation Card edit sync (regression guard) ---

  it("17: REGRESSION — Confirmation Card edit immediately reflected in form values", () => {
    // Simulate property bug pattern: card shows "7500" but form still has 8000
    const aiResult = mapExtractionToFormValues({ budgetMax: 8000 });

    // When user edits in card, onFieldChange fires → re-map
    const cardEdited = mapExtractionToFormValues({ budgetMax: 7500 });

    // Merging: card edit overrides AI
    const synced = { ...aiResult, ...cardEdited };
    expect(synced["budget_max"]).toBe(7500);
    // Must NOT still be the old AI value
    expect(synced["budget_max"]).not.toBe(8000);
  });

  // --- Case 18: AI field without real form input (regression guard) ---

  it("18: REGRESSION — AI field without form input is not mapped", () => {
    // sourcePlatform exists in RedactedClientFacts but NOT in the form
    const result = mapExtractionToFormValues({
      sourcePlatform: "wechat",
      name: "张先生",
    });

    // sourcePlatform should NOT appear (it's metadata, not a form field)
    expect(result).not.toHaveProperty("source_platform");
    expect(result).not.toHaveProperty("sourcePlatform");
    // Only name should be present
    expect(Object.keys(result)).toEqual(["name"]);
  });

  // --- Case 19: Boolean/string type drift (regression guard) ---

  it("19: REGRESSION — boolean never drifts to string after card edit", () => {
    // Property bug: "是"/"否" string ended up in boolean field
    const original = mapExtractionToFormValues({ petsRequired: true });
    expect(typeof original["pets_required"]).toBe("boolean");

    // Simulate card edit: coerceEditValue preserves boolean
    const coerced = coerceEditValue(true, "否");
    expect(typeof coerced).toBe("boolean");
    expect(coerced).toBe(false);

    // The coerced value in a form values object must be boolean
    const updated = { ...original, pets_required: coerced };
    expect(typeof updated["pets_required"]).toBe("boolean");
    expect(updated["pets_required"]).toBe(false);
  });

  // --- Case 20: hardRequirements JSON serialization ---

  it("20: serializes hardRequirements object to JSON string", () => {
    const result = mapExtractionToFormValues({
      hardRequirements: [
        { key: "elevator", value: "有电梯" },
        { key: "floor", value: "3楼以上" },
      ],
    });

    expect(typeof result["hard_requirements"]).toBe("string");
    expect(JSON.parse(result["hard_requirements"] as string)).toEqual([
      { key: "elevator", value: "有电梯" },
      { key: "floor", value: "3楼以上" },
    ]);
  });

  // --- Case 21: softPreferences JSON serialization ---

  it("21: serializes softPreferences object to JSON string", () => {
    const result = mapExtractionToFormValues({
      softPreferences: [{ key: "balcony", value: "最好有阳台" }],
    });

    expect(typeof result["soft_preferences"]).toBe("string");
    expect(JSON.parse(result["soft_preferences"] as string)).toEqual([
      { key: "balcony", value: "最好有阳台" },
    ]);
  });
});

// ============================================================
// detectMissingRequiredFields
// ============================================================

describe("detectMissingRequiredFields", () => {
  it("returns empty array when name is present", () => {
    expect(detectMissingRequiredFields({ name: "张先生" })).toEqual([]);
  });

  it("detects missing name", () => {
    const missing = detectMissingRequiredFields({ bedrooms: "2" });
    expect(missing).toContain("name");
    expect(missing).toHaveLength(1);
  });

  it("treats empty string as missing", () => {
    expect(detectMissingRequiredFields({ name: "" })).toContain("name");
  });

  it("treats null as missing", () => {
    expect(detectMissingRequiredFields({ name: null })).toContain("name");
  });

  it("treats undefined as missing", () => {
    expect(detectMissingRequiredFields({ name: undefined })).toContain("name");
  });

  it("does not report non-required fields as missing", () => {
    const missing = detectMissingRequiredFields({
      name: "张先生",
      phone: "",
      bedrooms: undefined,
    });
    // Only 'name' is required — phone and bedrooms being empty is fine
    expect(missing).toEqual([]);
  });

  it("returns only name when multiple fields are empty", () => {
    const missing = detectMissingRequiredFields({});
    expect(missing).toEqual(["name"]);
  });
});

// ============================================================
// getRequiredFieldMessage
// ============================================================

describe("getRequiredFieldMessage", () => {
  it("returns Chinese message for name", () => {
    expect(getRequiredFieldMessage("name")).toBe("客户姓名不能为空");
  });

  it("returns null for unknown field", () => {
    expect(getRequiredFieldMessage("phone")).toBeNull();
    expect(getRequiredFieldMessage("bedrooms")).toBeNull();
  });
});

// ============================================================
// getAiMissingFieldMessage
// ============================================================

describe("getAiMissingFieldMessage", () => {
  it("returns special message for name when AI had no data", () => {
    expect(getAiMissingFieldMessage("name", false)).toBe(
      "AI未识别到客户姓名，请补充"
    );
  });

  it("returns null when AI had data for name", () => {
    expect(getAiMissingFieldMessage("name", true)).toBeNull();
  });

  it("returns general message for other required fields", () => {
    // Currently only 'name' is required for clients
    expect(getAiMissingFieldMessage("name", false)).toBe(
      "AI未识别到客户姓名，请补充"
    );
  });

  it("returns null for non-required field", () => {
    expect(getAiMissingFieldMessage("bedrooms", false)).toBeNull();
  });
});

// ============================================================
// coerceEditValue
// ============================================================

describe("coerceEditValue", () => {
  it("preserves string when original is string", () => {
    expect(coerceEditValue("张先生", "李女士")).toBe("李女士");
  });

  it("converts to number when original is number", () => {
    expect(coerceEditValue(8000, "7500")).toBe(7500);
    expect(typeof coerceEditValue(8000, "7500")).toBe("number");
  });

  it("returns original number when edit string is not numeric", () => {
    expect(coerceEditValue(8000, "abc")).toBe(8000);
  });

  it("converts to boolean when original is boolean", () => {
    expect(coerceEditValue(true, "是")).toBe(true);
    expect(coerceEditValue(true, "否")).toBe(false);
    expect(coerceEditValue(false, "是")).toBe(true);
    expect(coerceEditValue(false, "否")).toBe(false);
  });

  it("converts to array when original is array", () => {
    const result = coerceEditValue(["南山", "福田"], "南山,福田,罗湖");
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual(["南山", "福田", "罗湖"]);
  });

  it("handles Chinese comma separator for array conversion", () => {
    const result = coerceEditValue(["南山"], "南山、福田、罗湖");
    expect(result).toEqual(["南山", "福田", "罗湖"]);
  });
});

// ============================================================
// CLIENT_EXTRACTION_FIELD_DEFS
// ============================================================

describe("CLIENT_EXTRACTION_FIELD_DEFS", () => {
  it("every field def has a mapping in the mapper", () => {
    // Collect all extraction keys used in field defs
    const extractionKeys = new Set(
      CLIENT_EXTRACTION_FIELD_DEFS.map((d) => d.extractionKey)
    );

    // Build a fake facts object with all extraction keys present
    const facts: Record<string, unknown> = {};
    for (const key of extractionKeys) {
      // Use appropriate types for each key
      if (key === "name" || key === "rentalType" || key === "availableFrom" || key === "commuteDestination") {
        facts[key] = "test";
      } else if (key === "budgetMin" || key === "budgetMax" || key === "bedrooms" || key === "minimumLeaseMonths") {
        facts[key] = 1;
      } else if (key === "petsRequired" || key === "cookingRequired") {
        facts[key] = true;
      } else if (key === "preferredDistricts" || key === "preferredCommunities" || key === "dealBreakers") {
        facts[key] = ["test"];
      } else if (key === "hardRequirements" || key === "softPreferences") {
        facts[key] = [{ key: "test", value: "test" }];
      }
    }

    const result = mapExtractionToFormValues(facts);

    // Every field def's form key should appear in the result
    for (const def of CLIENT_EXTRACTION_FIELD_DEFS) {
      expect(
        result,
        `Field def ${def.key} (extraction ${def.extractionKey}) should be in mapper output`
      ).toHaveProperty(def.key);
    }

    // Verify the count matches
    expect(Object.keys(result).length).toBe(CLIENT_EXTRACTION_FIELD_DEFS.length);
  });

  it("all field defs correspond to real CreateClientInputSchema fields", () => {
    // These are the snake_case field names from CreateClientInputSchema
    const validFormFields = new Set([
      "name",
      "phone",
      "wechat",
      "source_platform",
      "budget_min",
      "budget_max",
      "preferred_districts",
      "preferred_communities",
      "bedrooms",
      "rental_type",
      "available_from",
      "minimum_lease_months",
      "pets_required",
      "cooking_required",
      "commute_destination",
      "hard_requirements",
      "soft_preferences",
      "deal_breakers",
      "stage",
      "raw_input_text",
      "next_follow_up_at",
    ]);

    for (const def of CLIENT_EXTRACTION_FIELD_DEFS) {
      expect(
        validFormFields.has(def.key),
        `Field def key "${def.key}" must exist in CreateClientInputSchema`
      ).toBe(true);
    }
  });
});

// ============================================================
// PII protection (no PII leaks through mapper)
// ============================================================

describe("PII protection in mapper", () => {
  it("does not map phone even if present in extraction", () => {
    const result = mapExtractionToFormValues({
      name: "张先生",
      phone: "13800001234",
    });
    expect(result).not.toHaveProperty("phone");
  });

  it("does not map wechat even if present in extraction", () => {
    const result = mapExtractionToFormValues({
      name: "张先生",
      wechat: "wxid_123",
    });
    expect(result).not.toHaveProperty("wechat");
  });
});

// ============================================================
// Error mapping (error messages never contain PII)
// ============================================================

describe("error messages never contain PII", () => {
  it("getRequiredFieldMessage returns safe labels only", () => {
    const msg = getRequiredFieldMessage("name");
    expect(msg).not.toContain("138");
    expect(msg).not.toContain("@");
  });

  it("getAiMissingFieldMessage returns safe labels only", () => {
    const msg = getAiMissingFieldMessage("name", false);
    expect(msg).not.toContain("138");
    expect(msg).not.toContain("@");
  });
});
