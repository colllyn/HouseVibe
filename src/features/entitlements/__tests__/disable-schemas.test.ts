import { describe, it, expect } from "vitest";
import { DisableEntitlementInputSchema } from "@/features/entitlements/schemas";

describe("DisableEntitlementInputSchema", () => {
  const validInput = {
    userId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    feature: "content_factory",
  };

  it("accepts valid input", () => {
    const result = DisableEntitlementInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("accepts valid input with reason", () => {
    const result = DisableEntitlementInputSchema.safeParse({
      ...validInput,
      reason: "测试禁用",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid userId", () => {
    const result = DisableEntitlementInputSchema.safeParse({
      ...validInput,
      userId: "bad",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid feature", () => {
    const result = DisableEntitlementInputSchema.safeParse({
      ...validInput,
      feature: "bad_feature",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty object", () => {
    const result = DisableEntitlementInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects null", () => {
    const result = DisableEntitlementInputSchema.safeParse(null);
    expect(result.success).toBe(false);
  });

  it("rejects missing userId", () => {
    const result = DisableEntitlementInputSchema.safeParse({
      feature: "content_factory",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing feature", () => {
    const result = DisableEntitlementInputSchema.safeParse({
      userId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    });
    expect(result.success).toBe(false);
  });

  it("rejects reason longer than 500 characters", () => {
    const result = DisableEntitlementInputSchema.safeParse({
      ...validInput,
      reason: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("accepts reason exactly 500 characters", () => {
    const result = DisableEntitlementInputSchema.safeParse({
      ...validInput,
      reason: "a".repeat(500),
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid input without reason (optional)", () => {
    const { feature: f, userId: u } = validInput;
    const result = DisableEntitlementInputSchema.safeParse({ userId: u, feature: f });
    expect(result.success).toBe(true);
  });

  it("content_factory as feature passes validation", () => {
    const result = DisableEntitlementInputSchema.safeParse({
      userId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      feature: "content_factory",
    });
    expect(result.success).toBe(true);
  });
});
