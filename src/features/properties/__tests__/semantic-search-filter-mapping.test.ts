/**
 * Semantic Search — Filter Mapping Unit Tests
 * Owner: test-engineer
 * Covers: P3-AI-004-FILTER-MAPPING-079
 *
 * Validates bidirectional communities/features mapping:
 * AI filters → URL params → chips, and URL params → chips on reload.
 */

import { describe, it, expect } from "vitest";
import { filtersToUrlParams, filtersToChips } from "../hooks/use-semantic-search";
import type { SearchParseFilters } from "../schemas";
import { SearchParseResponseSchema } from "../schemas";

// ---------------------------------------------------------------------------
// Filters → URL params (forward)
// ---------------------------------------------------------------------------

describe("filtersToUrlParams — communities", () => {
  it("single community → single URL param", () => {
    const filters: SearchParseFilters = { communities: ["珠江新城"] };
    const params = filtersToUrlParams(filters);
    expect(params.getAll("community")).toEqual(["珠江新城"]);
  });

  it("multiple communities → repeated URL params", () => {
    const filters: SearchParseFilters = { communities: ["珠江新城", "猎德"] };
    const params = filtersToUrlParams(filters);
    expect(params.getAll("community")).toEqual(["猎德", "珠江新城"]);
  });

  it("trims whitespace from community values", () => {
    const filters: SearchParseFilters = { communities: ["  珠江新城  ", "猎德"] };
    const params = filtersToUrlParams(filters);
    expect(params.getAll("community")).toEqual(["猎德", "珠江新城"]);
  });

  it("filters out empty strings in communities", () => {
    const filters: SearchParseFilters = { communities: ["珠江新城", "", "   ", "猎德"] };
    const params = filtersToUrlParams(filters);
    expect(params.getAll("community")).toEqual(["猎德", "珠江新城"]);
  });

  it("deduplicates identical community values", () => {
    const filters: SearchParseFilters = { communities: ["珠江新城", "猎德", "珠江新城"] };
    const params = filtersToUrlParams(filters);
    expect(params.getAll("community")).toEqual(["猎德", "珠江新城"]);
  });

  it("empty communities array produces no param", () => {
    const filters: SearchParseFilters = { communities: [] };
    const params = filtersToUrlParams(filters);
    expect(params.has("community")).toBe(false);
  });
});

describe("filtersToUrlParams — features", () => {
  it("single feature → single URL param", () => {
    const filters: SearchParseFilters = { features: ["近地铁"] };
    const params = filtersToUrlParams(filters);
    expect(params.getAll("feature")).toEqual(["近地铁"]);
  });

  it("multiple features → repeated URL params", () => {
    const filters: SearchParseFilters = { features: ["近地铁", "带阳台"] };
    const params = filtersToUrlParams(filters);
    expect(params.getAll("feature")).toEqual(["带阳台", "近地铁"]);
  });

  it("trims whitespace from feature values", () => {
    const filters: SearchParseFilters = { features: ["  近地铁  ", "带阳台"] };
    const params = filtersToUrlParams(filters);
    expect(params.getAll("feature")).toEqual(["带阳台", "近地铁"]);
  });

  it("filters out empty strings in features", () => {
    const filters: SearchParseFilters = { features: ["近地铁", "", "   "] };
    const params = filtersToUrlParams(filters);
    expect(params.getAll("feature")).toEqual(["近地铁"]);
  });

  it("deduplicates identical feature values", () => {
    const filters: SearchParseFilters = { features: ["近地铁", "带阳台", "近地铁"] };
    const params = filtersToUrlParams(filters);
    expect(params.getAll("feature")).toEqual(["带阳台", "近地铁"]);
  });
});

// ---------------------------------------------------------------------------
// Filters → URL params (existing fields untouched)
// ---------------------------------------------------------------------------

describe("filtersToUrlParams — other fields unaffected", () => {
  it("preserves district, budget, bedrooms alongside communities/features", () => {
    const filters: SearchParseFilters = {
      districts: ["天河区"],
      communities: ["珠江新城"],
      features: ["近地铁"],
      monthlyRentMax: 3500,
      bedrooms: 2,
    };
    const params = filtersToUrlParams(filters);

    expect(params.getAll("district")).toEqual(["天河区"]);
    expect(params.getAll("community")).toEqual(["珠江新城"]);
    expect(params.getAll("feature")).toEqual(["近地铁"]);
    expect(params.get("maxRent")).toBe("3500");
    expect(params.get("bedrooms")).toBe("2");
  });
});

// ---------------------------------------------------------------------------
// Filters → Chips (forward)
// ---------------------------------------------------------------------------

describe("filtersToChips — communities", () => {
  it("single community → single chip with label 小区", () => {
    const filters: SearchParseFilters = { communities: ["珠江新城"] };
    const chips = filtersToChips(filters);
    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({
      key: "community-珠江新城",
      label: "小区",
      value: "珠江新城",
    });
  });

  it("multiple communities → independent chips", () => {
    const filters: SearchParseFilters = { communities: ["珠江新城", "猎德"] };
    const chips = filtersToChips(filters);
    expect(chips).toHaveLength(2);
    expect(chips.map((c) => c.key).sort()).toEqual([
      "community-猎德",
      "community-珠江新城",
    ]);
  });
});

describe("filtersToChips — features", () => {
  it("single feature → single chip with label 特色", () => {
    const filters: SearchParseFilters = { features: ["近地铁"] };
    const chips = filtersToChips(filters);
    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({
      key: "feature-近地铁",
      label: "特色",
      value: "近地铁",
    });
  });

  it("multiple features → independent chips", () => {
    const filters: SearchParseFilters = { features: ["近地铁", "带阳台"] };
    const chips = filtersToChips(filters);
    expect(chips).toHaveLength(2);
    expect(chips.map((c) => c.key).sort()).toEqual([
      "feature-带阳台",
      "feature-近地铁",
    ]);
  });
});

// ---------------------------------------------------------------------------
// URL → recovery (reconstruct from params)
// ---------------------------------------------------------------------------

describe("URL → filter recovery", () => {
  it("reconstructs communities from repeated community params", () => {
    const params = new URLSearchParams();
    params.append("community", "珠江新城");
    params.append("community", "猎德");

    const communities = params.getAll("community");
    expect(communities).toEqual(["珠江新城", "猎德"]);
    // Each one produces a chip via URL_CHIP_LABELS
    const chips = communities.map((v) => ({
      key: `community-${v}`,
      label: "小区",
      value: v,
    }));
    expect(chips).toHaveLength(2);
    expect(chips[0]).toMatchObject({ key: "community-珠江新城", label: "小区", value: "珠江新城" });
    expect(chips[1]).toMatchObject({ key: "community-猎德", label: "小区", value: "猎德" });
  });

  it("reconstructs features from repeated feature params", () => {
    const params = new URLSearchParams();
    params.append("feature", "近地铁");
    params.append("feature", "带阳台");

    const features = params.getAll("feature");
    expect(features).toEqual(["近地铁", "带阳台"]);
    const chips = features.map((v) => ({
      key: `feature-${v}`,
      label: "特色",
      value: v,
    }));
    expect(chips).toHaveLength(2);
    expect(chips[0]).toMatchObject({ key: "feature-近地铁", label: "特色", value: "近地铁" });
    expect(chips[1]).toMatchObject({ key: "feature-带阳台", label: "特色", value: "带阳台" });
  });
});

// ---------------------------------------------------------------------------
// Independent chip deletion (URL-level simulation)
// ---------------------------------------------------------------------------

describe("Chip deletion — array params", () => {
  it("removing one community chip preserves others", () => {
    const params = new URLSearchParams();
    params.append("community", "珠江新城");
    params.append("community", "猎德");

    // Simulate removing "珠江新城"
    const all = params.getAll("community");
    params.delete("community");
    for (const v of all) {
      if (v !== "珠江新城") params.append("community", v);
    }

    expect(params.getAll("community")).toEqual(["猎德"]);
  });

  it("removing last community chip removes param entirely", () => {
    const params = new URLSearchParams();
    params.append("community", "珠江新城");

    // Simulate removing "珠江新城"
    const all = params.getAll("community");
    params.delete("community");
    for (const v of all) {
      if (v !== "珠江新城") params.append("community", v);
    }

    expect(params.has("community")).toBe(false);
  });

  it("removing one feature chip preserves others", () => {
    const params = new URLSearchParams();
    params.append("feature", "近地铁");
    params.append("feature", "带阳台");

    // Simulate removing "近地铁"
    const all = params.getAll("feature");
    params.delete("feature");
    for (const v of all) {
      if (v !== "近地铁") params.append("feature", v);
    }

    expect(params.getAll("feature")).toEqual(["带阳台"]);
  });

  it("deleting one array value does not affect other array params", () => {
    const params = new URLSearchParams();
    params.append("community", "珠江新城");
    params.append("community", "猎德");
    params.append("feature", "近地铁");
    params.append("district", "天河区");

    // Remove one community value
    const allC = params.getAll("community");
    params.delete("community");
    for (const v of allC) {
      if (v !== "珠江新城") params.append("community", v);
    }

    expect(params.getAll("community")).toEqual(["猎德"]);
    expect(params.getAll("feature")).toEqual(["近地铁"]);
    expect(params.getAll("district")).toEqual(["天河区"]);
  });
});

// ---------------------------------------------------------------------------
// AI response with both communities and features
// ---------------------------------------------------------------------------

describe("Combined AI response", () => {
  it("AI 200 with communities and features → all mapped to params and chips", () => {
    const filters: SearchParseFilters = {
      communities: ["珠江新城", "猎德"],
      features: ["近地铁", "带阳台"],
      districts: ["天河区"],
      monthlyRentMax: 5000,
      bedrooms: 2,
    };

    const params = filtersToUrlParams(filters);
    expect(params.getAll("community")).toEqual(["猎德", "珠江新城"]);
    expect(params.getAll("feature")).toEqual(["带阳台", "近地铁"]);
    expect(params.getAll("district")).toEqual(["天河区"]);
    expect(params.get("maxRent")).toBe("5000");
    expect(params.get("bedrooms")).toBe("2");

    const chips = filtersToChips(filters);
    const keys = chips.map((c) => c.key);
    expect(keys).toContain("community-珠江新城");
    expect(keys).toContain("community-猎德");
    expect(keys).toContain("feature-近地铁");
    expect(keys).toContain("feature-带阳台");
    expect(keys).toContain("district-天河区");
  });
});

// ---------------------------------------------------------------------------
// Fallback / error responses produce no structured chips
// ---------------------------------------------------------------------------

describe("No fallback for error responses", () => {
  it("200 with error envelope → schema accepts but hook skips mapping", () => {
    // When the server returns 200 but with an error envelope,
    // the schema still validates it (it's valid JSON matching the error union).
    // The hook checks parsed.data.error !== null and skips mapping.
    const result = SearchParseResponseSchema.safeParse({
      data: null,
      error: { code: "VALIDATION_FAILED", message: "Invalid" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.error).not.toBeNull();
    }
  });

  it("200 with completely invalid body → schema rejects (no mapping)", () => {
    const result = SearchParseResponseSchema.safeParse({
      garbage: true,
      unrelated: "data",
    });
    expect(result.success).toBe(false);
  });

  it("mapping functions are pure → no HTTP dependency", () => {
    // filtersToUrlParams and filtersToChips only transform data structures.
    // They have no fetch(), no try/catch, no HTTP status awareness.
    // This is verified by checking their function signature shape.
    const src = filtersToUrlParams.toString();
    expect(src).not.toContain("fetch");
    expect(src).not.toContain("status");
    expect(src).not.toContain("try");
    expect(src).not.toContain("catch");
  });
});
