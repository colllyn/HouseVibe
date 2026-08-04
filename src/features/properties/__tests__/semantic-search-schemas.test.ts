import { describe, it, expect } from "vitest";
import {
  SearchParseInputSchema,
  SearchParseFiltersSchema,
  SearchParseResponseSchema,
} from "../schemas";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("SearchParseInputSchema", () => {
  it("accepts a valid query with requestId", () => {
    const result = SearchParseInputSchema.safeParse({
      query: "3500以内、天河、能养猫的一房",
      requestId: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });

  it("trims whitespace from query", () => {
    const result = SearchParseInputSchema.safeParse({
      query: "  天河区  ",
      requestId: VALID_UUID,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query).toBe("天河区");
    }
  });

  it("rejects empty query after trim", () => {
    const result = SearchParseInputSchema.safeParse({
      query: "   ",
      requestId: VALID_UUID,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty string query", () => {
    const result = SearchParseInputSchema.safeParse({
      query: "",
      requestId: VALID_UUID,
    });
    expect(result.success).toBe(false);
  });

  it("accepts query at exactly 500 characters", () => {
    const query = "天".repeat(500); // 天 x 500
    const result = SearchParseInputSchema.safeParse({ query, requestId: VALID_UUID });
    expect(result.success).toBe(true);
  });

  it("rejects query at 501 characters", () => {
    const query = "天".repeat(501); // 天 x 501
    const result = SearchParseInputSchema.safeParse({ query, requestId: VALID_UUID });
    expect(result.success).toBe(false);
  });

  it("rejects query that is only ASCII special characters", () => {
    const result = SearchParseInputSchema.safeParse({
      query: "!@#$%^&*()",
      requestId: VALID_UUID,
    });
    expect(result.success).toBe(false);
  });

  it("rejects query that is only CJK punctuation", () => {
    // Only Chinese punctuation marks
    const result = SearchParseInputSchema.safeParse({
      query: "，。！？；：", // Fullwidth punctuation
      requestId: VALID_UUID,
    });
    expect(result.success).toBe(false);
  });

  it("rejects query that is only spaces and punctuation", () => {
    const result = SearchParseInputSchema.safeParse({
      query: "   ,.!  ",
      requestId: VALID_UUID,
    });
    expect(result.success).toBe(false);
  });

  it("accepts query with mixed text and punctuation", () => {
    const result = SearchParseInputSchema.safeParse({
      query: "3500以内、天河区！",
      requestId: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid requestId not UUID", () => {
    const result = SearchParseInputSchema.safeParse({
      query: "天河区",
      requestId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing requestId", () => {
    const result = SearchParseInputSchema.safeParse({
      query: "天河区",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing query", () => {
    const result = SearchParseInputSchema.safeParse({
      requestId: VALID_UUID,
    });
    expect(result.success).toBe(false);
  });

  it("accepts English query text", () => {
    const result = SearchParseInputSchema.safeParse({
      query: "apartment near subway",
      requestId: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });
});

describe("SearchParseFiltersSchema", () => {
  it("accepts a complete valid filters object", () => {
    const result = SearchParseFiltersSchema.safeParse({
      districts: ["天河区"],
      monthlyRentMax: 3500,
      bedrooms: 1,
      petsAllowed: true,
      sortBy: "updated_at",
      sortOrder: "desc",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty filters object", () => {
    const result = SearchParseFiltersSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts multiple districts", () => {
    const result = SearchParseFiltersSchema.safeParse({
      districts: ["天河区", "海珠区", "越秀区"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts all optional fields", () => {
    const result = SearchParseFiltersSchema.safeParse({
      districts: ["天河区"],
      communities: ["阳光花园"],
      monthlyRentMin: 2000,
      monthlyRentMax: 5000,
      bedrooms: 2,
      livingRooms: 1,
      rentalType: "whole_unit",
      petsAllowed: false,
      cookingAllowed: true,
      hasElevator: true,
      availableBefore: "2026-09-01",
      features: ["阳台", "空调"],
      subwayText: "距3号线步行5分钟",
      sortBy: "monthly_rent_asc",
      sortOrder: "asc",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid rentalType", () => {
    const result = SearchParseFiltersSchema.safeParse({
      rentalType: "invalid_type",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative bedrooms", () => {
    const result = SearchParseFiltersSchema.safeParse({
      bedrooms: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer bedrooms", () => {
    const result = SearchParseFiltersSchema.safeParse({
      bedrooms: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid sortBy", () => {
    const result = SearchParseFiltersSchema.safeParse({
      sortBy: "invalid_sort",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid sortOrder", () => {
    const result = SearchParseFiltersSchema.safeParse({
      sortOrder: "random",
    });
    expect(result.success).toBe(false);
  });
});

describe("SearchParseResponseSchema", () => {
  it("accepts a valid 200 response", () => {
    const result = SearchParseResponseSchema.safeParse({
      data: {
        filters: {
          districts: ["天河区"],
          monthlyRentMax: 3500,
          bedrooms: 1,
          petsAllowed: true,
        },
        parsedQuery: "预算3500以内，天河区，一房，允许养宠物",
        unrecognizedTerms: [],
        requestId: VALID_UUID,
      },
      error: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid error response", () => {
    const result = SearchParseResponseSchema.safeParse({
      data: null,
      error: {
        code: "FEATURE_NOT_ALLOWED",
        message: "需要 semantic_search 权限",
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts response with unrecognizedTerms", () => {
    const result = SearchParseResponseSchema.safeParse({
      data: {
        filters: {},
        parsedQuery: "some query",
        unrecognizedTerms: ["近地铁", "安静"],
        requestId: VALID_UUID,
      },
      error: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects response with missing filters in data", () => {
    const result = SearchParseResponseSchema.safeParse({
      data: {
        parsedQuery: "test",
        unrecognizedTerms: [],
        requestId: VALID_UUID,
      },
      error: null,
    });
    expect(result.success).toBe(false);
  });

  // P3-AI-004-FINAL-CLOSE-078: new contract tests
  it("accepts { data: { filters }, error: null }", () => {
    const result = SearchParseResponseSchema.safeParse({
      data: { filters: {} },
      error: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts success with parsedQuery inside filters", () => {
    // parsedQuery and unrecognizedTerms live inside filters (from AI provider)
    const result = SearchParseResponseSchema.safeParse({
      data: {
        filters: {
          districts: ["天河区"],
          parsedQuery: "预算3500以内，天河区",
          unrecognizedTerms: [],
        },
      },
      error: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts { error: { code, message } } (data absent)", () => {
    const result = SearchParseResponseSchema.safeParse({
      error: { code: "TEST", message: "test error" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing filters in data.success", () => {
    const result = SearchParseResponseSchema.safeParse({
      data: {},
      error: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-null error with non-object data", () => {
    const result = SearchParseResponseSchema.safeParse({
      data: "string instead of object",
      error: { code: "ERR", message: "err" },
    });
    expect(result.success).toBe(false);
  });
});
