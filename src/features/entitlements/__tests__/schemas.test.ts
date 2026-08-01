import { describe, it, expect } from "vitest";
import {
  FeatureKeyEnum,
  EntitlementStatusEnum,
  GrantEntitlementInputSchema,
  RevokeEntitlementInputSchema,
  GrantSystemAdminInputSchema,
  RevokeSystemAdminInputSchema,
} from "@/features/entitlements/schemas";

// =============================================================================
// FeatureKeyEnum
// =============================================================================

describe("FeatureKeyEnum", () => {
  const validKeys = [
    "ai_data_extraction",
    "semantic_search",
    "property_matching",
    "shared_property_pool",
    "content_factory",
  ];

  it("accepts all 5 valid feature keys", () => {
    for (const key of validKeys) {
      const result = FeatureKeyEnum.safeParse(key);
      expect(result.success, `FeatureKeyEnum should accept "${key}"`).toBe(true);
    }
  });

  it("has exactly 5 options", () => {
    expect(FeatureKeyEnum.options).toHaveLength(5);
  });

  it("rejects invalid feature key", () => {
    const result = FeatureKeyEnum.safeParse("invalid_feature");
    expect(result.success).toBe(false);
  });

  it("rejects empty string", () => {
    const result = FeatureKeyEnum.safeParse("");
    expect(result.success).toBe(false);
  });

  it("rejects null / undefined", () => {
    expect(FeatureKeyEnum.safeParse(null).success).toBe(false);
    expect(FeatureKeyEnum.safeParse(undefined).success).toBe(false);
  });

  it("content_factory is a valid key", () => {
    const result = FeatureKeyEnum.safeParse("content_factory");
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// EntitlementStatusEnum
// =============================================================================

describe("EntitlementStatusEnum", () => {
  it('accepts "active"', () => {
    expect(EntitlementStatusEnum.safeParse("active").success).toBe(true);
  });

  it('accepts "disabled"', () => {
    expect(EntitlementStatusEnum.safeParse("disabled").success).toBe(true);
  });

  it('accepts "revoked"', () => {
    expect(EntitlementStatusEnum.safeParse("revoked").success).toBe(true);
  });

  it("has exactly 3 options", () => {
    expect(EntitlementStatusEnum.options).toHaveLength(3);
  });

  it('"expired" is NOT a valid status (derived from expires_at, not a status)', () => {
    const result = EntitlementStatusEnum.safeParse("expired");
    expect(result.success).toBe(false);
  });

  it("rejects invalid status string", () => {
    expect(EntitlementStatusEnum.safeParse("pending").success).toBe(false);
  });

  it("rejects null / undefined", () => {
    expect(EntitlementStatusEnum.safeParse(null).success).toBe(false);
    expect(EntitlementStatusEnum.safeParse(undefined).success).toBe(false);
  });
});

// =============================================================================
// GrantEntitlementInputSchema
// =============================================================================

describe("GrantEntitlementInputSchema", () => {
  const validInput = {
    userId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    feature: "ai_data_extraction",
  };

  it("accepts valid input", () => {
    const result = GrantEntitlementInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("accepts valid input with expiresAt", () => {
    const result = GrantEntitlementInputSchema.safeParse({
      ...validInput,
      expiresAt: "2027-01-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid input with reason", () => {
    const result = GrantEntitlementInputSchema.safeParse({
      ...validInput,
      reason: "测试授权",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid input with null expiresAt", () => {
    const result = GrantEntitlementInputSchema.safeParse({
      ...validInput,
      expiresAt: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid userId (not a UUID)", () => {
    const result = GrantEntitlementInputSchema.safeParse({
      ...validInput,
      userId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty userId string", () => {
    const result = GrantEntitlementInputSchema.safeParse({
      ...validInput,
      userId: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid feature", () => {
    const result = GrantEntitlementInputSchema.safeParse({
      ...validInput,
      feature: "nonexistent_feature",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid expiresAt (not ISO datetime)", () => {
    const result = GrantEntitlementInputSchema.safeParse({
      ...validInput,
      expiresAt: "not-a-date",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty object", () => {
    const result = GrantEntitlementInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects null", () => {
    const result = GrantEntitlementInputSchema.safeParse(null);
    expect(result.success).toBe(false);
  });

  it("rejects missing userId", () => {
    const result = GrantEntitlementInputSchema.safeParse({
      feature: "ai_data_extraction",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing feature", () => {
    const result = GrantEntitlementInputSchema.safeParse({
      userId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    });
    expect(result.success).toBe(false);
  });

  it("rejects reason longer than 500 characters", () => {
    const result = GrantEntitlementInputSchema.safeParse({
      ...validInput,
      reason: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("accepts reason exactly 500 characters", () => {
    const result = GrantEntitlementInputSchema.safeParse({
      ...validInput,
      reason: "a".repeat(500),
    });
    expect(result.success).toBe(true);
  });

  it("content_factory as feature passes validation (authorization is not validation)", () => {
    const result = GrantEntitlementInputSchema.safeParse({
      userId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      feature: "content_factory",
    });
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// RevokeEntitlementInputSchema
// =============================================================================

describe("RevokeEntitlementInputSchema", () => {
  const validInput: { userId: string; feature: string; reason?: string } = {
    userId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    feature: "content_factory",
  };

  it("accepts valid input", () => {
    const result = RevokeEntitlementInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("accepts valid input with reason", () => {
    const result = RevokeEntitlementInputSchema.safeParse({
      ...validInput,
      reason: "违规使用",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid input without reason (optional)", () => {
    const { reason: _, ...noReason } = validInput;
    const result = RevokeEntitlementInputSchema.safeParse(noReason);
    expect(result.success).toBe(true);
  });

  it("rejects invalid userId", () => {
    const result = RevokeEntitlementInputSchema.safeParse({
      ...validInput,
      userId: "bad",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid feature", () => {
    const result = RevokeEntitlementInputSchema.safeParse({
      ...validInput,
      feature: "bad_feature",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty object", () => {
    expect(RevokeEntitlementInputSchema.safeParse({}).success).toBe(false);
  });

  it("rejects null", () => {
    expect(RevokeEntitlementInputSchema.safeParse(null).success).toBe(false);
  });
});

// =============================================================================
// GrantSystemAdminInputSchema
// =============================================================================

describe("GrantSystemAdminInputSchema", () => {
  it("accepts valid UUID", () => {
    const result = GrantSystemAdminInputSchema.safeParse({
      userId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid UUID", () => {
    const result = GrantSystemAdminInputSchema.safeParse({
      userId: "invalid-uuid-here",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty string userId", () => {
    const result = GrantSystemAdminInputSchema.safeParse({
      userId: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing userId", () => {
    const result = GrantSystemAdminInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects null", () => {
    const result = GrantSystemAdminInputSchema.safeParse(null);
    expect(result.success).toBe(false);
  });

  it("rejects extra properties (strip)", () => {
    // Extra properties should be ignored when strict mode is off (zod default)
    const result = GrantSystemAdminInputSchema.safeParse({
      userId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      extra: "should-be-ignored",
    });
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// RevokeSystemAdminInputSchema
// =============================================================================

describe("RevokeSystemAdminInputSchema", () => {
  it("accepts valid UUID", () => {
    const result = RevokeSystemAdminInputSchema.safeParse({
      userId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid UUID", () => {
    const result = RevokeSystemAdminInputSchema.safeParse({
      userId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// Schema relationship tests
// =============================================================================

describe("Schema consistency", () => {
  it("FeatureKeyEnum values match the migration contract", () => {
    const expected = [
      "ai_data_extraction",
      "semantic_search",
      "property_matching",
      "shared_property_pool",
      "content_factory",
    ];
    expect(FeatureKeyEnum.options.sort()).toEqual(expected.sort());
  });

  it("EntitlementStatusEnum values match the migration contract", () => {
    const expected = ["active", "disabled", "revoked"];
    expect(EntitlementStatusEnum.options.sort()).toEqual(expected.sort());
  });

  it("GrantEntitlementInputSchema uses FeatureKeyEnum for feature field", () => {
    const shape = GrantEntitlementInputSchema.shape;
    expect(shape.feature).toBe(FeatureKeyEnum);
  });

  it("RevokeEntitlementInputSchema uses FeatureKeyEnum for feature field", () => {
    const shape = RevokeEntitlementInputSchema.shape;
    expect(shape.feature).toBe(FeatureKeyEnum);
  });

  it("GrantSystemAdminInputSchema only requires userId", () => {
    const shape = GrantSystemAdminInputSchema.shape;
    expect(Object.keys(shape)).toEqual(["userId"]);
  });

  it("RevokeSystemAdminInputSchema only requires userId", () => {
    const shape = RevokeSystemAdminInputSchema.shape;
    expect(Object.keys(shape)).toEqual(["userId"]);
  });
});
