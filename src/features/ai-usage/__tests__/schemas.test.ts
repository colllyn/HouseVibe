// ============================================================
// AI Usage Schemas — Unit Tests
// Owner: ai-deepseek-engineer
// Contract: P3-AI-017
// ============================================================

import { describe, expect, it } from "vitest";
import {
  UsageQuerySchema,
  UpdateUserLimitsSchema,
  PeriodEnum,
  GroupByEnum,
} from "../schemas";

// ============================================================
// PeriodEnum
// ============================================================

describe("PeriodEnum", () => {
  it("accepts 'today'", () => {
    expect(PeriodEnum.safeParse("today").success).toBe(true);
  });

  it("accepts '7d'", () => {
    expect(PeriodEnum.safeParse("7d").success).toBe(true);
  });

  it("accepts '30d'", () => {
    expect(PeriodEnum.safeParse("30d").success).toBe(true);
  });

  it("rejects unknown period", () => {
    expect(PeriodEnum.safeParse("90d").success).toBe(false);
  });

  it("rejects empty string", () => {
    expect(PeriodEnum.safeParse("").success).toBe(false);
  });
});

// ============================================================
// GroupByEnum
// ============================================================

describe("GroupByEnum", () => {
  it.each(["user", "workspace", "feature", "model", "status"] as const)(
    "accepts '%s'",
    (val) => {
      expect(GroupByEnum.safeParse(val).success).toBe(true);
    },
  );

  it("rejects unknown group by", () => {
    expect(GroupByEnum.safeParse("color").success).toBe(false);
  });
});

// ============================================================
// UsageQuerySchema
// ============================================================

describe("UsageQuerySchema", () => {
  it("uses defaults when empty", () => {
    const result = UsageQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.period).toBe("today");
      expect(result.data.groupBy).toBe("feature");
    }
  });

  it("parses valid period and groupBy", () => {
    const result = UsageQuerySchema.safeParse({ period: "7d", groupBy: "user" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.period).toBe("7d");
      expect(result.data.groupBy).toBe("user");
    }
  });

  it("rejects invalid period", () => {
    const result = UsageQuerySchema.safeParse({ period: "invalid" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid groupBy", () => {
    const result = UsageQuerySchema.safeParse({ groupBy: "invalid" });
    expect(result.success).toBe(false);
  });

  it("rejects extra fields (strict)", () => {
    const result = UsageQuerySchema.safeParse({ period: "today", groupBy: "feature", extra: true });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// UpdateUserLimitsSchema
// ============================================================

describe("UpdateUserLimitsSchema", () => {
  it("accepts daily_request_limit only", () => {
    const result = UpdateUserLimitsSchema.safeParse({ daily_request_limit: 50 });
    expect(result.success).toBe(true);
  });

  it("accepts daily_cost_limit_usd only", () => {
    const result = UpdateUserLimitsSchema.safeParse({ daily_cost_limit_usd: 5.0 });
    expect(result.success).toBe(true);
  });

  it("accepts both fields", () => {
    const result = UpdateUserLimitsSchema.safeParse({
      daily_request_limit: 100,
      daily_cost_limit_usd: 20.0,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty body", () => {
    const result = UpdateUserLimitsSchema.safeParse({});
    expect(result.success).toBe(true); // both fields optional → empty is valid
  });

  it("rejects negative request limit", () => {
    const result = UpdateUserLimitsSchema.safeParse({ daily_request_limit: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects zero request limit (min 1)", () => {
    const result = UpdateUserLimitsSchema.safeParse({ daily_request_limit: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects zero cost limit (min 0.01)", () => {
    const result = UpdateUserLimitsSchema.safeParse({ daily_cost_limit_usd: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects negative cost limit", () => {
    const result = UpdateUserLimitsSchema.safeParse({ daily_cost_limit_usd: -5 });
    expect(result.success).toBe(false);
  });

  it("rejects request limit over 10000", () => {
    const result = UpdateUserLimitsSchema.safeParse({ daily_request_limit: 10001 });
    expect(result.success).toBe(false);
  });

  it("rejects cost limit over 10000", () => {
    const result = UpdateUserLimitsSchema.safeParse({ daily_cost_limit_usd: 10000.01 });
    expect(result.success).toBe(false);
  });

  it("rejects extra fields (strict)", () => {
    const result = UpdateUserLimitsSchema.safeParse({
      daily_request_limit: 50,
      extra_field: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer request limit", () => {
    const result = UpdateUserLimitsSchema.safeParse({ daily_request_limit: 10.5 });
    expect(result.success).toBe(false);
  });
});
