/**
 * Matching Schema Unit Tests
 *
 * Validates that API response schemas correctly parse valid data
 * and reject malformed/incomplete responses to prevent client crashes.
 */

import { describe, it, expect } from "vitest";
import {
  ClientListResponseSchema,
  MatchListResponseSchema,
  EnrichedMatchItemSchema,
  ApiErrorResponseSchema,
} from "@/features/matching/schemas";

// =============================================================================
// ClientListResponseSchema
// =============================================================================

describe("ClientListResponseSchema", () => {
  it("accepts valid client list response", () => {
    const valid = {
      data: {
        clients: [{ id: "uuid-1", name: "张三" }],
        total: 1,
        page: 1,
        limit: 100,
      },
      error: null,
    };
    expect(ClientListResponseSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts empty client list", () => {
    const valid = {
      data: { clients: [], total: 0, page: 1, limit: 100 },
      error: null,
    };
    expect(ClientListResponseSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects response where data is an array (old bug pattern)", () => {
    const invalid = {
      data: [{ id: "uuid-1", name: "张三" }],
      error: null,
    };
    expect(ClientListResponseSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects response where data is null", () => {
    const invalid = {
      data: null,
      error: { code: "ERROR", message: "fail" },
    };
    expect(ClientListResponseSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects response with missing clients array", () => {
    const invalid = {
      data: { total: 0, page: 1, limit: 100 },
      error: null,
    };
    expect(ClientListResponseSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects response where data key is absent", () => {
    const invalid = { error: null };
    expect(ClientListResponseSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects response where client item is missing id", () => {
    const invalid = {
      data: {
        clients: [{ name: "no-id" }],
        total: 1,
        page: 1,
        limit: 100,
      },
      error: null,
    };
    expect(ClientListResponseSchema.safeParse(invalid).success).toBe(false);
  });
});

// =============================================================================
// EnrichedMatchItemSchema
// =============================================================================

describe("EnrichedMatchItemSchema", () => {
  it("accepts full valid match item (client view)", () => {
    const valid = {
      id: "match-uuid",
      propertyId: "prop-uuid",
      propertyTitle: "阳光花园",
      propertyDistrict: "天河区",
      propertyCommunity: "珠江新城",
      score: 85,
      matchLevel: "excellent",
      matchedReasons: [
        { code: "budget", label: "预算匹配", scoreContribution: 30, detail: "在预算范围内" },
      ],
      unmatchedReasons: [],
      needsConfirmation: [],
      status: "active",
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
    };
    expect(EnrichedMatchItemSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts minimal valid match item", () => {
    const minimal = {
      id: "match-uuid",
      score: 50,
      matchLevel: "fair",
      status: "active",
    };
    expect(EnrichedMatchItemSchema.safeParse(minimal).success).toBe(true);
  });

  it("accepts null district/community", () => {
    const withNulls = {
      id: "match-uuid",
      propertyId: "prop-uuid",
      propertyTitle: "未知房源",
      propertyDistrict: null,
      propertyCommunity: null,
      score: 30,
      matchLevel: "low",
      status: "active",
    };
    expect(EnrichedMatchItemSchema.safeParse(withNulls).success).toBe(true);
  });

  it("accepts property-view match item with clientName", () => {
    const propertyView = {
      id: "match-uuid",
      clientId: "client-uuid",
      clientName: "张三",
      score: 75,
      matchLevel: "good",
      status: "active",
    };
    expect(EnrichedMatchItemSchema.safeParse(propertyView).success).toBe(true);
  });

  it("rejects missing required id", () => {
    expect(
      EnrichedMatchItemSchema.safeParse({ score: 50, matchLevel: "fair", status: "active" }).success
    ).toBe(false);
  });

  it("rejects missing score", () => {
    expect(
      EnrichedMatchItemSchema.safeParse({ id: "x", matchLevel: "fair", status: "active" }).success
    ).toBe(false);
  });

  it("rejects invalid matchLevel", () => {
    expect(
      EnrichedMatchItemSchema.safeParse({ id: "x", score: 50, matchLevel: "perfect", status: "active" }).success
    ).toBe(false);
  });

  it("rejects invalid status", () => {
    expect(
      EnrichedMatchItemSchema.safeParse({ id: "x", score: 50, matchLevel: "fair", status: "deleted" }).success
    ).toBe(false);
  });

  it("rejects negative score", () => {
    expect(
      EnrichedMatchItemSchema.safeParse({ id: "x", score: -1, matchLevel: "low", status: "active" }).success
    ).toBe(false);
  });

  it("rejects score above 100", () => {
    expect(
      EnrichedMatchItemSchema.safeParse({ id: "x", score: 150, matchLevel: "excellent", status: "active" }).success
    ).toBe(false);
  });
});

// =============================================================================
// MatchListResponseSchema
// =============================================================================

describe("MatchListResponseSchema", () => {
  it("accepts valid match list response", () => {
    const valid = {
      data: [
        {
          id: "match-1",
          propertyId: "prop-1",
          propertyTitle: "阳光花园",
          score: 85,
          matchLevel: "excellent",
          status: "active",
        },
      ],
      error: null,
    };
    expect(MatchListResponseSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts empty match list", () => {
    const valid = { data: [], error: null };
    expect(MatchListResponseSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects response where data is an object instead of array", () => {
    const invalid = {
      data: { matches: [], total: 0 },
      error: null,
    };
    expect(MatchListResponseSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects response where data is null", () => {
    const invalid = { data: null, error: null };
    expect(MatchListResponseSchema.safeParse(invalid).success).toBe(false);
  });
});

// =============================================================================
// ApiErrorResponseSchema
// =============================================================================

describe("ApiErrorResponseSchema", () => {
  it("accepts valid error response", () => {
    const valid = {
      data: null,
      error: { code: "UNAUTHENTICATED", message: "未登录" },
    };
    expect(ApiErrorResponseSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts 403 error", () => {
    const valid = {
      data: null,
      error: { code: "WORKSPACE_ACCESS_DENIED", message: "无权限" },
    };
    expect(ApiErrorResponseSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts 404 error", () => {
    const valid = {
      data: null,
      error: { code: "RESOURCE_NOT_FOUND", message: "客户不存在" },
    };
    expect(ApiErrorResponseSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts 500 error", () => {
    const valid = {
      data: null,
      error: { code: "INTERNAL_ERROR", message: "服务器错误" },
    };
    expect(ApiErrorResponseSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects error response with missing code", () => {
    const invalid = {
      data: null,
      error: { message: "no code" },
    };
    expect(ApiErrorResponseSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects error response where data is not null", () => {
    const invalid = {
      data: { something: "here" },
      error: { code: "ERR", message: "msg" },
    };
    expect(ApiErrorResponseSchema.safeParse(invalid).success).toBe(false);
  });
});
