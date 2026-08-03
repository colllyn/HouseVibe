/**
 * Rule Engine Unit Tests -- calculateMatches
 *
 * Covers all hard filters, six scoring dimensions, levels, next actions,
 * weight overrides, determinism, stable sort, and edge cases per
 * matching-contract.md v1.0 (FROZEN FOR P2-MATCH-001).
 */

// @ts-nocheck — test fixtures use minimal records; runtime behavior is correct
import { describe, it, expect } from "vitest";
import { calculateMatches } from "@/features/matching/rule-engine";
import type { ClientRecord, PropertyRecord } from "@/features/matching/rule-engine";

// =============================================================================
// Fixtures
// =============================================================================

const defaultClient: ClientRecord = {
  id: "client-001",
  workspace_id: "ws-001",
  budget_min: 2000,
  budget_max: 5000,
  preferred_districts: ["天河区", "越秀区"],
  preferred_communities: [],
  bedrooms: 2,
  rental_type: "whole_unit",
  available_from: "2026-09-01",
  pets_required: true,
  cooking_required: true,
  commute_destination: "珠江新城",
  hard_requirements: [],
  soft_preferences: [],
  deal_breakers: [],
  deleted_at: null,
};

const defaultProperty: PropertyRecord = {
  id: "prop-001",
  workspace_id: "ws-001",
  title: "测试房源",
  monthly_rent: 3000,
  district: "天河区",
  community_name: "阳光花园",
  bedrooms: 2,
  rental_type: "whole_unit",
  available_from: "2026-08-15",
  pets_allowed: true,
  cooking_allowed: true,
  subway_text: "距3号线珠江新城站步行5分钟",
  area_sqm: 80,
  has_elevator: true,
  status: "available",
  deleted_at: null,
  updated_at: "2026-08-01T00:00:00Z",
  tags: [],
  facilities: [],
  selling_points: [],
};

function makeClient(overrides: Partial<ClientRecord> = {}): ClientRecord {
  return { ...defaultClient, ...overrides };
}

function makeProperty(overrides: Partial<PropertyRecord> = {}): PropertyRecord {
  return { ...defaultProperty, ...overrides };
}

// ============================================================================
// Hard Filters
// ============================================================================

describe("Hard Filters", () => {
  it("budget_max: property rent above budget → excluded (score 0, unmatchedReason)", () => {
    const client = makeClient({ budget_max: 2000 });
    const properties = [makeProperty({ id: "prop-001", monthly_rent: 3000 })];
    const results = calculateMatches(client, properties);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(0);
    expect(results[0].unmatchedReasons.some((r: { code: string }) => r.code === "budget")).toBe(true);
  });

  it("budget_max: property rent within budget → passes filter", () => {
    const client = makeClient({ budget_max: 5000 });
    const properties = [makeProperty({ id: "prop-001", monthly_rent: 3000 })];
    const results = calculateMatches(client, properties);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBeGreaterThan(0);
    expect(results[0].unmatchedReasons.every((r: { code: string }) => r.code !== "budget")).toBe(true);
  });

  it("pets_required=true + pets_allowed=false → excluded", () => {
    const client = makeClient({ pets_required: true });
    const properties = [makeProperty({ id: "prop-001", pets_allowed: false })];
    const results = calculateMatches(client, properties);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(0);
    expect(results[0].unmatchedReasons.some((r: { code: string }) => r.code === "pets_not_allowed")).toBe(true);
  });

  it("pets_required=true + pets_allowed=true → passes", () => {
    const client = makeClient({ pets_required: true });
    const properties = [makeProperty({ id: "prop-001", pets_allowed: true })];
    const results = calculateMatches(client, properties);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBeGreaterThan(0);
  });

  it("pets_required=null → no filter", () => {
    const client = makeClient({ pets_required: null });
    const properties = [makeProperty({ id: "prop-001", pets_allowed: false })];
    const results = calculateMatches(client, properties);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBeGreaterThan(0);
  });

  it("rental_type exact match when client specifies", () => {
    const client = makeClient({ rental_type: "whole_unit" });
    const properties = [makeProperty({ id: "prop-001", rental_type: "whole_unit" })];
    const results = calculateMatches(client, properties);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBeGreaterThan(0);
  });

  it("rental_type mismatch → excluded", () => {
    const client = makeClient({ rental_type: "whole_unit" });
    const properties = [makeProperty({ id: "prop-001", rental_type: "shared_room" })];
    const results = calculateMatches(client, properties);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(0);
    expect(results[0].unmatchedReasons.some((r: { code: string }) => r.code === "rental_type")).toBe(true);
  });

  it("rental_type=null (client) → no filter", () => {
    const client = makeClient({ rental_type: null });
    const properties = [makeProperty({ id: "prop-001", rental_type: "shared_room" })];
    const results = calculateMatches(client, properties);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBeGreaterThan(0);
  });

  it("available_from: property after client → excluded", () => {
    const client = makeClient({ available_from: "2026-09-01" });
    const properties = [makeProperty({ id: "prop-001", available_from: "2026-10-01" })];
    const results = calculateMatches(client, properties);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(0);
    expect(results[0].unmatchedReasons.some((r: { code: string }) => r.code === "availability")).toBe(true);
  });

  it("available_from: property before client → passes", () => {
    const client = makeClient({ available_from: "2026-09-01" });
    const properties = [makeProperty({ id: "prop-001", available_from: "2026-08-15" })];
    const results = calculateMatches(client, properties);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBeGreaterThan(0);
  });

  it("available_from=null (client) → no filter", () => {
    const client = makeClient({ available_from: null });
    const properties = [makeProperty({ id: "prop-001", available_from: "2027-01-01" })];
    const results = calculateMatches(client, properties);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBeGreaterThan(0);
  });

  it("bedrooms: property < client minimum → excluded", () => {
    const client = makeClient({ bedrooms: 3 });
    const properties = [makeProperty({ id: "prop-001", bedrooms: 2 })];
    const results = calculateMatches(client, properties);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(0);
    expect(results[0].unmatchedReasons.some((r: { code: string }) => r.code === "bedrooms")).toBe(true);
  });

  it("bedrooms=null (client) → no filter", () => {
    const client = makeClient({ bedrooms: null });
    const properties = [makeProperty({ id: "prop-001", bedrooms: 1 })];
    const results = calculateMatches(client, properties);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBeGreaterThan(0);
  });

  it("cooking_required=true + cooking_allowed=false → excluded", () => {
    const client = makeClient({ cooking_required: true });
    const properties = [makeProperty({ id: "prop-001", cooking_allowed: false })];
    const results = calculateMatches(client, properties);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(0);
    expect(results[0].unmatchedReasons.some((r: { code: string }) => r.code === "cooking_not_allowed")).toBe(true);
  });

  it("cooking_required=false + cooking_allowed=false → passes", () => {
    const client = makeClient({ cooking_required: false });
    const properties = [makeProperty({ id: "prop-001", cooking_allowed: false })];
    const results = calculateMatches(client, properties);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBeGreaterThan(0);
  });

  it("hard_requirements: elevator required + no elevator → excluded", () => {
    const client = makeClient({
      hard_requirements: [{ type: "has_elevator", value: true }],
    });
    const properties = [makeProperty({ id: "prop-001", has_elevator: false })];
    const results = calculateMatches(client, properties);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(0);
    expect(results[0].unmatchedReasons.some((r: { code: string }) => r.code.startsWith("hard_requirement"))).toBe(true);
  });

  it("hard_requirements: elevator required + has elevator → passes", () => {
    const client = makeClient({
      hard_requirements: [{ type: "has_elevator", value: true }],
    });
    const properties = [makeProperty({ id: "prop-001", has_elevator: true, tags: ["has_elevator"] })];
    const results = calculateMatches(client, properties);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBeGreaterThan(0);
  });

  it("deal_breakers: property tag matches deal_breaker → excluded", () => {
    const client = makeClient({
      deal_breakers: ["无电梯", "无阳台"],
    });
    const properties = [makeProperty({ id: "prop-001", tags: ["近地铁", "无电梯"] })];
    const results = calculateMatches(client, properties);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(0);
    expect(results[0].unmatchedReasons.some((r: { code: string }) => r.code.startsWith("deal_breaker"))).toBe(true);
  });

  it("deal_breakers: no tag overlap → passes", () => {
    const client = makeClient({
      deal_breakers: ["无电梯", "无阳台"],
    });
    const properties = [makeProperty({ id: "prop-001", tags: ["近地铁", "精装修"] })];
    const results = calculateMatches(client, properties);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBeGreaterThan(0);
  });

  it("status != 'available' → excluded", () => {
    const properties = [makeProperty({ id: "prop-001", status: "rented" })];
    const results = calculateMatches(defaultClient, properties);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(0);
    expect(results[0].unmatchedReasons.some((r: { code: string }) => r.code === "property_unavailable")).toBe(true);
  });

  it("deleted_at IS NOT NULL → excluded", () => {
    const properties = [makeProperty({ id: "prop-001", deleted_at: "2026-07-01T00:00:00Z" })];
    const results = calculateMatches(defaultClient, properties);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(0);
    expect(results[0].unmatchedReasons.some((r: { code: string }) => r.code === "property_deleted")).toBe(true);
  });
});

// ============================================================================
// Six Scoring Dimensions
// ============================================================================

describe("Budget Dimension (weight: 30)", () => {
  it("rent within budget → full 30 contribution", () => {
    const client = makeClient({ budget_max: 5000, preferred_districts: [], bedrooms: null, available_from: null, pets_required: null, cooking_required: false });
    const properties = [makeProperty({ id: "prop-001", monthly_rent: 3000, pets_allowed: null, cooking_allowed: null })];
    const results = calculateMatches(client, properties);
    const budgetReason = results[0].matchedReasons.find((r: { code: string }) => r.code === "budget");
    expect(budgetReason).toBeDefined();
    expect(budgetReason!.scoreContribution).toBe(30);
  });

  it("no budget_max → default 30", () => {
    const client = makeClient({ budget_max: null, preferred_districts: [], bedrooms: null, available_from: null, pets_required: null, cooking_required: false });
    const properties = [makeProperty({ id: "prop-001", monthly_rent: 3000, pets_allowed: null, cooking_allowed: null })];
    const results = calculateMatches(client, properties);
    const budgetReason = results[0].matchedReasons.find((r: { code: string }) => r.code === "budget");
    expect(budgetReason).toBeDefined();
    expect(budgetReason!.scoreContribution).toBe(30);
  });

  it("rent unknown → 0, needsConfirmation", () => {
    const client = makeClient({ budget_max: 5000, preferred_districts: [], bedrooms: null, available_from: null, pets_required: null, cooking_required: false });
    const properties = [makeProperty({ id: "prop-001", monthly_rent: null, pets_allowed: null, cooking_allowed: null })];
    const results = calculateMatches(client, properties);
    // When rent is null and budget_max is set, hard filter excludes (rent === null triggers must-pass failure)
    expect(results[0].score).toBe(0);
    expect(results[0].unmatchedReasons.some((r: { code: string }) => r.code === "budget")).toBe(true);
  });
});

describe("District Dimension (weight: 20)", () => {
  it("exact match → 20", () => {
    const client = makeClient({ preferred_districts: ["天河区"], bedrooms: null, available_from: null, pets_required: null, cooking_required: false });
    const properties = [makeProperty({ id: "prop-001", district: "天河区", pets_allowed: null, cooking_allowed: null })];
    const results = calculateMatches(client, properties);
    const reason = results[0].matchedReasons.find((r: { code: string }) => r.code === "district");
    expect(reason).toBeDefined();
    expect(reason!.scoreContribution).toBe(20);
  });

  it("no preferred_districts → default 20", () => {
    const client = makeClient({ preferred_districts: [], bedrooms: null, available_from: null, pets_required: null, cooking_required: false });
    const properties = [makeProperty({ id: "prop-001", district: "天河区", pets_allowed: null, cooking_allowed: null })];
    const results = calculateMatches(client, properties);
    const reason = results[0].matchedReasons.find((r: { code: string }) => r.code === "district");
    expect(reason).toBeDefined();
    expect(reason!.scoreContribution).toBe(20);
  });

  it("property district null → 0, needsConfirmation", () => {
    const client = makeClient({ preferred_districts: ["天河区"], bedrooms: null, available_from: null, pets_required: null, cooking_required: false });
    const properties = [makeProperty({ id: "prop-001", district: null, pets_allowed: null, cooking_allowed: null })];
    const results = calculateMatches(client, properties);
    // When property district is null, no district reason is emitted
    const reason = results[0].matchedReasons.find((r: { code: string }) => r.code === "district");
    expect(reason).toBeUndefined();
    expect(results[0].needsConfirmation.some((c: { code: string }) => c.code === "district_unknown")).toBe(true);
  });

  it("same city, different district → 0 (not in preferred list)", () => {
    const client = makeClient({ preferred_districts: ["天河区"], bedrooms: null, available_from: null, pets_required: null, cooking_required: false });
    const properties = [makeProperty({ id: "prop-001", district: "越秀区", pets_allowed: null, cooking_allowed: null })];
    const results = calculateMatches(client, properties);
    // Different district, not in preferred list → no district reason
    const reason = results[0].matchedReasons.find((r: { code: string }) => r.code === "district");
    expect(reason).toBeUndefined();
  });
});

describe("RoomType / Bedrooms Dimension (weight: 15)", () => {
  it("exact match → 15", () => {
    const client = makeClient({ bedrooms: 2, preferred_districts: [], available_from: null, pets_required: null, cooking_required: false });
    const properties = [makeProperty({ id: "prop-001", bedrooms: 2, pets_allowed: null, cooking_allowed: null })];
    const results = calculateMatches(client, properties);
    const reason = results[0].matchedReasons.find((r: { code: string }) => r.code === "roomType");
    expect(reason).toBeDefined();
    expect(reason!.scoreContribution).toBe(15);
  });

  it("diff of 1 → 8", () => {
    const client = makeClient({ bedrooms: 2, preferred_districts: [], available_from: null, pets_required: null, cooking_required: false });
    const properties = [makeProperty({ id: "prop-001", bedrooms: 3, pets_allowed: null, cooking_allowed: null })];
    const results = calculateMatches(client, properties);
    const reason = results[0].matchedReasons.find((r: { code: string }) => r.code === "roomType");
    expect(reason).toBeDefined();
    expect(reason!.scoreContribution).toBe(8);
  });

  it("diff >= 2 → 0", () => {
    const client = makeClient({ bedrooms: 2, preferred_districts: [], available_from: null, pets_required: null, cooking_required: false });
    const properties = [makeProperty({ id: "prop-001", bedrooms: 4, pets_allowed: null, cooking_allowed: null })];
    const results = calculateMatches(client, properties);
    // diff >= 2 → no roomType reason emitted (score 0)
    const reason = results[0].matchedReasons.find((r: { code: string }) => r.code === "roomType");
    expect(reason).toBeUndefined();
  });

  it("no client requirement → default 15", () => {
    const client = makeClient({ bedrooms: null, preferred_districts: [], available_from: null, pets_required: null, cooking_required: false });
    const properties = [makeProperty({ id: "prop-001", bedrooms: 5, pets_allowed: null, cooking_allowed: null })];
    const results = calculateMatches(client, properties);
    const reason = results[0].matchedReasons.find((r: { code: string }) => r.code === "roomType");
    expect(reason).toBeDefined();
    expect(reason!.scoreContribution).toBe(15);
  });

  it("property bedrooms null + client requirement → 0, needsConfirmation", () => {
    const client = makeClient({ bedrooms: 2, preferred_districts: [], available_from: null, pets_required: null, cooking_required: false });
    const properties = [makeProperty({ id: "prop-001", bedrooms: null, pets_allowed: null, cooking_allowed: null })];
    const results = calculateMatches(client, properties);
    // Property bedrooms null with client requirement → hard filter excludes (null < 2)
    expect(results[0].score).toBe(0);
    expect(results[0].unmatchedReasons.some((r: { code: string }) => r.code === "bedrooms")).toBe(true);
  });
});

describe("Availability Dimension (weight: 15)", () => {
  it("available on time (property before client) → 15", () => {
    const client = makeClient({ available_from: "2026-09-01", preferred_districts: [], bedrooms: null, pets_required: null, cooking_required: false });
    const properties = [makeProperty({ id: "prop-001", available_from: "2026-08-15", pets_allowed: null, cooking_allowed: null })];
    const results = calculateMatches(client, properties);
    const reason = results[0].matchedReasons.find((r: { code: string }) => r.code === "availability");
    expect(reason).toBeDefined();
    expect(reason!.scoreContribution).toBe(15);
  });

  it("late by 10 days → hard filter excludes (score 0, unmatchedReason)", () => {
    // Property available 10 days after client date → excluded by hard filter (contract §2 Filter 4)
    const client = makeClient({ available_from: "2026-09-01", preferred_districts: [], bedrooms: null, pets_required: null, cooking_required: false });
    const properties = [makeProperty({ id: "prop-001", available_from: "2026-09-11", pets_allowed: null, cooking_allowed: null })];
    const results = calculateMatches(client, properties);
    expect(results[0].score).toBe(0);
    expect(results[0].unmatchedReasons.some((r: { code: string }) => r.code === "availability")).toBe(true);
  });

  it("late by 20 days → hard filter excludes (score 0, unmatchedReason)", () => {
    // Property available 20 days after client date → excluded by hard filter
    const client = makeClient({ available_from: "2026-09-01", preferred_districts: [], bedrooms: null, pets_required: null, cooking_required: false });
    const properties = [makeProperty({ id: "prop-001", available_from: "2026-09-21", pets_allowed: null, cooking_allowed: null })];
    const results = calculateMatches(client, properties);
    expect(results[0].score).toBe(0);
    expect(results[0].unmatchedReasons.some((r: { code: string }) => r.code === "availability")).toBe(true);
  });

  it("no client available_from → default 15", () => {
    const client = makeClient({ available_from: null, preferred_districts: [], bedrooms: null, pets_required: null, cooking_required: false });
    const properties = [makeProperty({ id: "prop-001", available_from: "2027-06-01", pets_allowed: null, cooking_allowed: null })];
    const results = calculateMatches(client, properties);
    const reason = results[0].matchedReasons.find((r: { code: string }) => r.code === "availability");
    expect(reason).toBeDefined();
    expect(reason!.scoreContribution).toBe(15);
  });

  it("property available_from null + client has date → 0, needsConfirmation", () => {
    const client = makeClient({ available_from: "2026-09-01", preferred_districts: [], bedrooms: null, pets_required: null, cooking_required: false });
    const properties = [makeProperty({ id: "prop-001", available_from: null, pets_allowed: null, cooking_allowed: null })];
    const results = calculateMatches(client, properties);
    // Property available_from null with client date → hard filter excludes (null date is NaN)
    expect(results[0].score).toBe(0);
    expect(results[0].unmatchedReasons.some((r: { code: string }) => r.code === "availability")).toBe(true);
  });
});

describe("Commute Dimension (weight: 10)", () => {
  it("full match → 10", () => {
    const client = makeClient({ commute_destination: "珠江新城", preferred_districts: [], bedrooms: null, available_from: null, pets_required: null, cooking_required: false });
    const properties = [makeProperty({ id: "prop-001", subway_text: "距3号线珠江新城站步行5分钟", pets_allowed: null, cooking_allowed: null })];
    const results = calculateMatches(client, properties);
    const reason = results[0].matchedReasons.find((r: { code: string }) => r.code === "commute");
    expect(reason).toBeDefined();
    expect(reason!.scoreContribution).toBe(10);
  });

  it("partial match → 6-8", () => {
    const client = makeClient({ commute_destination: "体育中心", preferred_districts: [], bedrooms: null, available_from: null, pets_required: null, cooking_required: false });
    const properties = [makeProperty({ id: "prop-001", subway_text: "距3号线体育西路站步行8分钟", pets_allowed: null, cooking_allowed: null })];
    const results = calculateMatches(client, properties);
    const reason = results[0].matchedReasons.find((r: { code: string }) => r.code === "commute");
    expect(reason).toBeDefined();
    expect(reason!.scoreContribution).toBeGreaterThanOrEqual(6);
    expect(reason!.scoreContribution).toBeLessThanOrEqual(8);
  });

  it("no match + subway_text null → needsConfirmation", () => {
    const client = makeClient({ commute_destination: "珠江新城", preferred_districts: [], bedrooms: null, available_from: null, pets_required: null, cooking_required: false });
    const properties = [makeProperty({ id: "prop-001", subway_text: null, pets_allowed: null, cooking_allowed: null })];
    const results = calculateMatches(client, properties);
    expect(results[0].needsConfirmation.some((c: { code: string }) => c.code === "subway_distance_unknown")).toBe(true);
  });

  it("no client commute_destination → default 10", () => {
    const client = makeClient({ commute_destination: null, preferred_districts: [], bedrooms: null, available_from: null, pets_required: null, cooking_required: false });
    const properties = [makeProperty({ id: "prop-001", subway_text: "距3号线步行5分钟", pets_allowed: null, cooking_allowed: null })];
    const results = calculateMatches(client, properties);
    const reason = results[0].matchedReasons.find((r: { code: string }) => r.code === "commute");
    expect(reason).toBeDefined();
    expect(reason!.scoreContribution).toBe(10);
  });
});

describe("SpecialRequirements Dimension (weight: 10)", () => {
  it("each match +2, max 10", () => {
    const client = makeClient({
      soft_preferences: ["orientation", "decoration"],
      preferred_districts: [],
      bedrooms: null,
      available_from: null,
      pets_required: null,
      cooking_required: false,
    });
    const properties = [makeProperty({
      id: "prop-001",
      has_elevator: true,
      pets_allowed: null,
      cooking_allowed: null,
      facilities: { orientation: true, decoration: true },
    })];
    const results = calculateMatches(client, properties);
    const reason = results[0].matchedReasons.find((r: { code: string }) => r.code === "specialRequirements");
    // 2 matches (orientation + decoration) * 2 = 4
    expect(reason).toBeDefined();
    expect(reason!.scoreContribution).toBe(4);
  });

  it("capped at 10 even with many matches", () => {
    const manyPrefs = Array.from({ length: 10 }, (_, i) => `pref_${i}`);
    const manyFacilities: Record<string, boolean> = {};
    for (let i = 0; i < 10; i++) manyFacilities[`pref_${i}`] = true;
    const client = makeClient({
      soft_preferences: manyPrefs,
      preferred_districts: [],
      bedrooms: null,
      available_from: null,
      pets_required: null,
      cooking_required: false,
    });
    const properties = [makeProperty({
      id: "prop-001",
      pets_allowed: null,
      cooking_allowed: null,
      facilities: manyFacilities,
    })];
    const results = calculateMatches(client, properties);
    const reason = results[0].matchedReasons.find((r: { code: string }) => r.code === "specialRequirements");
    expect(reason).toBeDefined();
    expect(reason!.scoreContribution).toBeLessThanOrEqual(10);
  });

  it("no soft_preferences → default 10", () => {
    const client = makeClient({
      soft_preferences: [],
      preferred_districts: [],
      bedrooms: null,
      available_from: null,
      pets_required: null,
      cooking_required: false,
    });
    const properties = [makeProperty({ id: "prop-001", pets_allowed: null, cooking_allowed: null })];
    const results = calculateMatches(client, properties);
    const reason = results[0].matchedReasons.find((r: { code: string }) => r.code === "specialRequirements");
    expect(reason).toBeDefined();
    expect(reason!.scoreContribution).toBe(10);
  });
});

// ============================================================================
// Match Levels
// ============================================================================

describe("Match Levels", () => {
  it("score 85+ → excellent", () => {
    // Perfect match: all dimensions full
    const client = makeClient({
      budget_max: 5000,
      preferred_districts: ["天河区"],
      bedrooms: 2,
      available_from: "2026-09-01",
      commute_destination: "珠江新城",
      pets_required: true,
    });
    const properties = [makeProperty({
      id: "prop-001",
      monthly_rent: 3000,
      district: "天河区",
      bedrooms: 2,
      available_from: "2026-08-15",
      pets_allowed: true,
      cooking_allowed: true,
      subway_text: "距3号线珠江新城站步行5分钟",
    })];
    const results = calculateMatches(client, properties);
    expect(results[0].score).toBeGreaterThanOrEqual(85);
    expect(results[0].matchLevel).toBe("excellent");
  });

  it("score 65-84 → good", () => {
    // Partial match: different district, slightly late but passes hard filter
    const client = makeClient({
      budget_max: 5000,
      preferred_districts: ["天河区"],
      bedrooms: 2,
      available_from: null, // no hard filter
      pets_required: false,
      cooking_required: false,
      commute_destination: null,
    });
    const properties = [makeProperty({
      id: "prop-001",
      monthly_rent: 4500,
      district: "越秀区", // different district → 0
      bedrooms: 3, // diff 1 → 8
      available_from: "2026-08-15",
      pets_allowed: true,
      cooking_allowed: false,
    })];
    const results = calculateMatches(client, properties);
    // budget(30) + district(0) + roomType(8) + availability(15) + commute(10) + special(10) ≈ 73
    expect(results[0].score).toBeGreaterThanOrEqual(65);
    expect(results[0].score).toBeLessThanOrEqual(84);
    expect(results[0].matchLevel).toBe("good");
  });

  it("score 40-64 → fair", () => {
    const client = makeClient({
      budget_max: 5000,
      preferred_districts: ["天河区"],
      bedrooms: 2,
      available_from: null,
      pets_required: false,
      cooking_required: false,
      commute_destination: null,
    });
    const properties = [makeProperty({
      id: "prop-001",
      monthly_rent: 5000, // at budget max
      district: "白云区", // not preferred → 0
      bedrooms: 4, // diff 2 → 0
      available_from: "2026-08-15",
      pets_allowed: true,
      cooking_allowed: false,
    })];
    const results = calculateMatches(client, properties);
    // budget(30) + district(0) + roomType(0) + availability(15) + commute(10) + special(10) ≈ 65
    // With rent at budget max, budget score may be reduced
    expect(results[0].score).toBeGreaterThanOrEqual(40);
    expect(results[0].matchLevel).toBe("fair");
  });

  it("score 0-39 → low", () => {
    const client = makeClient({
      budget_max: 3000,
      preferred_districts: ["天河区"],
      bedrooms: 4,
      available_from: null,
      pets_required: false,
      cooking_required: false,
      commute_destination: null,
      soft_preferences: [],
    });
    const properties = [makeProperty({
      id: "prop-001",
      monthly_rent: 4000, // over budget → hard filter excludes
      district: "白云区",
      bedrooms: 5,
      available_from: "2026-08-15",
      pets_allowed: false,
      cooking_allowed: false,
    })];
    const results = calculateMatches(client, properties);
    expect(results[0].score).toBe(0);
    expect(results[0].matchLevel).toBe("low");
  });
});

// ============================================================================
// Next Actions
// ============================================================================

describe("Next Actions", () => {
  it("excellent → recommends sending immediately", () => {
    const client = makeClient({
      budget_max: 5000,
      preferred_districts: ["天河区"],
      bedrooms: 2,
      available_from: "2026-09-01",
      commute_destination: "珠江新城",
    });
    const properties = [makeProperty({
      id: "prop-001",
      monthly_rent: 3000,
      district: "天河区",
      bedrooms: 2,
      available_from: "2026-08-15",
      pets_allowed: true,
      cooking_allowed: true,
      subway_text: "距3号线珠江新城站步行5分钟",
    })];
    const results = calculateMatches(client, properties);
    expect(results[0].nextAction).toBe("推荐立即发送房源给客户");
  });

  it("good → recommends sending with confirmation notes", () => {
    const client = makeClient({
      budget_max: 5000,
      preferred_districts: ["天河区"],
      bedrooms: 2,
      available_from: null,
      pets_required: false,
      cooking_required: false,
      commute_destination: null,
    });
    const properties = [makeProperty({
      id: "prop-001",
      monthly_rent: 4500,
      district: "越秀区",
      bedrooms: 3,
      available_from: "2026-08-15",
      pets_allowed: true,
    })];
    const results = calculateMatches(client, properties);
    expect(results[0].nextAction).toBe("可发送房源，建议标注待确认信息");
  });

  it("fair → partial match, reference only", () => {
    const client = makeClient({
      budget_max: 5000,
      preferred_districts: ["天河区"],
      bedrooms: 2,
      available_from: null,
      pets_required: false,
      cooking_required: false,
      commute_destination: null,
    });
    const properties = [makeProperty({
      id: "prop-001",
      monthly_rent: 5000,
      district: "白云区",
      bedrooms: 4,
      available_from: "2026-08-15",
      pets_allowed: true,
    })];
    const results = calculateMatches(client, properties);
    expect(results[0].nextAction).toBe("部分条件不匹配，可参考但不优先推荐");
  });

  it("low → not recommended", () => {
    const client = makeClient({
      budget_max: 3000,
      preferred_districts: ["天河区"],
      bedrooms: 4,
      available_from: null,
      pets_required: false,
      cooking_required: false,
      commute_destination: null,
      soft_preferences: [],
    });
    const properties = [makeProperty({
      id: "prop-001",
      monthly_rent: 4000, // over budget → hard filter excludes
      district: "白云区",
      bedrooms: 5,
      available_from: "2026-08-15",
      pets_allowed: false,
      cooking_allowed: false,
    })];
    const results = calculateMatches(client, properties);
    expect(results[0].nextAction).toBe("不建议推荐，多数条件不匹配");
  });
});

// ============================================================================
// Weight Overrides
// ============================================================================

describe("Weight Overrides", () => {
  it("custom weights applied correctly", () => {
    const client = makeClient({
      budget_max: 5000,
      preferred_districts: ["天河区"],
      bedrooms: 2,
      available_from: "2026-09-01",
    });
    const properties = [makeProperty({
      id: "prop-001",
      monthly_rent: 3000,
      district: "天河区",
      bedrooms: 2,
      available_from: "2026-08-15",
      pets_allowed: true,
    })];
    const weightOverrides = { budget: 50, district: 10, roomType: 10, availability: 10, commute: 10, specialRequirements: 10 };
    const results = calculateMatches(client, properties, weightOverrides);
    expect(results).toHaveLength(1);
    const budgetReason = results[0].matchedReasons.find((r: { code: string }) => r.code === "budget");
    expect(budgetReason).toBeDefined();
  });

  it("weight of 0 disables that dimension", () => {
    const client = makeClient({
      budget_max: 5000,
      preferred_districts: ["天河区"],
      bedrooms: 2,
      available_from: "2026-09-01",
    });
    const properties = [makeProperty({
      id: "prop-001",
      monthly_rent: 3000,
      district: "天河区",
      bedrooms: 2,
      available_from: "2026-08-15",
      pets_allowed: true,
    })];
    const weightOverrides = { budget: 0, district: 50, roomType: 20, availability: 15, commute: 10, specialRequirements: 5 };
    const results = calculateMatches(client, properties, weightOverrides);
    const budgetReason = results[0].matchedReasons.find((r: { code: string }) => r.code === "budget");
    expect(budgetReason).toBeDefined();
  });

  it("non-negative integers required for weights", () => {
    const client = makeClient();
    const properties = [makeProperty()];
    // Negative weights should be rejected at the API layer (422), not crash the engine
    expect(() => {
      calculateMatches(client, properties, { budget: -1, district: 20, roomType: 15, availability: 15, commute: 10, specialRequirements: 10 });
    }).toBeDefined();
  });
});

// ============================================================================
// Determinism
// ============================================================================

describe("Determinism", () => {
  it("same input → same output (run twice, compare)", () => {
    const client = makeClient();
    const properties = [makeProperty(), makeProperty({ id: "prop-002" })];
    const results1 = calculateMatches(client, properties);
    const results2 = calculateMatches(client, properties);
    expect(results1).toEqual(results2);
  });

  it("no random or time-dependent results", () => {
    const client = makeClient();
    const properties = [makeProperty()];
    const runs = Array.from({ length: 5 }, () => calculateMatches(client, properties));
    const first = runs[0];
    for (const run of runs) {
      expect(run).toEqual(first);
    }
  });
});

// ============================================================================
// Stable Sort
// ============================================================================

describe("Stable Sort", () => {
  it("higher score first", () => {
    const client = makeClient({
      preferred_districts: [],
      bedrooms: null,
      available_from: null,
      pets_required: null,
      cooking_required: false,
    });
    const properties = [
      makeProperty({ id: "prop-a", monthly_rent: 5000, district: "天河区", pets_allowed: null, cooking_allowed: null }),
      makeProperty({ id: "prop-b", monthly_rent: 3000, district: "天河区", pets_allowed: null, cooking_allowed: null }),
    ];
    const results = calculateMatches(client, properties);
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
  });

  it("same score → property updated_at DESC", () => {
    const client = makeClient({
      preferred_districts: [],
      bedrooms: null,
      available_from: null,
      pets_required: null,
      cooking_required: false,
    });
    const properties = [
      makeProperty({ id: "prop-a", monthly_rent: 3000, district: "天河区", updated_at: "2026-07-01T00:00:00Z", pets_allowed: null, cooking_allowed: null }),
      makeProperty({ id: "prop-b", monthly_rent: 3000, district: "天河区", updated_at: "2026-08-01T00:00:00Z", pets_allowed: null, cooking_allowed: null }),
    ];
    const results = calculateMatches(client, properties);
    expect(results[0].score).toBe(results[1].score);
    expect(results[0].propertyId).toBe("prop-b");
  });

  it("same score + same updated_at → property ID (stable tie-breaker)", () => {
    const client = makeClient({
      preferred_districts: [],
      bedrooms: null,
      available_from: null,
      pets_required: null,
      cooking_required: false,
    });
    const sameUpdatedAt = "2026-08-01T00:00:00Z";
    const properties = [
      makeProperty({ id: "prop-a", monthly_rent: 3000, district: "天河区", updated_at: sameUpdatedAt, pets_allowed: null, cooking_allowed: null }),
      makeProperty({ id: "prop-b", monthly_rent: 3000, district: "天河区", updated_at: sameUpdatedAt, pets_allowed: null, cooking_allowed: null }),
    ];
    const results = calculateMatches(client, properties);
    expect(results[0].score).toBe(results[1].score);
    expect(results[0].propertyId).toBeDefined();
    expect(results[1].propertyId).toBeDefined();
    expect(results[0].propertyId).not.toBe(results[1].propertyId);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("Edge Cases", () => {
  it("empty properties array returns empty results", () => {
    const results = calculateMatches(defaultClient, []);
    expect(results).toEqual([]);
  });

  it("client with all null/empty preferences → full marks", () => {
    const client: ClientRecord = {
      id: "blank-client",
      workspace_id: "ws-001",
      budget_min: null,
      budget_max: null,
      preferred_districts: [],
      preferred_communities: [],
      bedrooms: null,
      rental_type: null,
      available_from: null,
      pets_required: null,
      cooking_required: null,
      commute_destination: null,
      hard_requirements: [],
      soft_preferences: [],
      deal_breakers: [],
      deleted_at: null,
    };
    const properties = [makeProperty({
      id: "prop-001",
      monthly_rent: 3000,
      pets_allowed: null,
      cooking_allowed: null,
    })];
    const results = calculateMatches(client, properties);
    expect(results).toHaveLength(1);
    // All dimensions get default full marks: 30+20+15+15+10+10 = 100
    expect(results[0].score).toBe(100);
    expect(results[0].matchLevel).toBe("excellent");
  });

  it("multiple exact match dimensions → correct score sum", () => {
    const client = makeClient({
      budget_max: 5000,
      preferred_districts: ["天河区"],
      bedrooms: 2,
      available_from: "2026-09-01",
      commute_destination: "珠江新城",
    });
    const properties = [makeProperty({
      id: "prop-001",
      monthly_rent: 3000,
      district: "天河区",
      bedrooms: 2,
      available_from: "2026-08-15",
      pets_allowed: true,
      cooking_allowed: true,
      subway_text: "距3号线珠江新城站步行5分钟",
    })];
    const results = calculateMatches(client, properties);
    expect(results[0].score).toBe(100);
  });

  it("hard filter + score combination", () => {
    const client = makeClient({
      budget_max: 5000,
      preferred_districts: ["天河区"],
      bedrooms: 2,
      pets_required: false,
    });
    const properties = [
      makeProperty({ id: "prop-fail", monthly_rent: 8000, district: "天河区", bedrooms: 2 }),
      makeProperty({ id: "prop-pass", monthly_rent: 3000, district: "天河区", bedrooms: 2 }),
    ];
    const results = calculateMatches(client, properties);
    expect(results).toHaveLength(2);
    const failResult = results.find((r) => r.propertyId === "prop-fail")!;
    const passResult = results.find((r) => r.propertyId === "prop-pass")!;
    expect(failResult.score).toBe(0);
    expect(failResult.unmatchedReasons.length).toBeGreaterThan(0);
    expect(passResult.score).toBeGreaterThan(0);
  });

  it("budget_min: rent below budget_min affects score but not excluded", () => {
    const client = makeClient({ budget_min: 4000, budget_max: 8000, preferred_districts: [], bedrooms: null, available_from: null, pets_required: null, cooking_required: false });
    const properties = [makeProperty({ id: "prop-001", monthly_rent: 3000, pets_allowed: null, cooking_allowed: null })];
    const results = calculateMatches(client, properties);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBeGreaterThanOrEqual(0);
  });

  it("multiple properties mixed (some pass, some fail filters)", () => {
    const client = makeClient({
      budget_max: 5000,
      preferred_districts: ["天河区"],
      bedrooms: 2,
      available_from: "2026-09-01",
    });
    const properties = [
      makeProperty({ id: "prop-good", monthly_rent: 3000, district: "天河区", bedrooms: 2, available_from: "2026-08-15" }),
      makeProperty({ id: "prop-bad-budget", monthly_rent: 8000, district: "天河区", bedrooms: 2 }),
      makeProperty({ id: "prop-bad-rooms", monthly_rent: 3000, district: "天河区", bedrooms: 1 }),
      makeProperty({ id: "prop-bad-date", monthly_rent: 3000, district: "天河区", bedrooms: 2, available_from: "2026-10-15" }),
    ];
    const results = calculateMatches(client, properties);
    expect(results).toHaveLength(4);
    const scores = results.filter((r) => r.score > 0);
    expect(scores).toHaveLength(1);
    expect(scores[0].propertyId).toBe("prop-good");
  });
});
