// ============================================================
// Content Fact Checker Tests — P3-AI-009
// Owner: ai-deepseek-engineer / test-engineer
// ============================================================

import { describe, it, expect } from "vitest";
import { checkContentFacts } from "@/lib/ai/fact-checker";
import type { FactReference, VisualFactReference } from "@/lib/ai/types";

// ============================================================
// Fixtures
// ============================================================

function makeSourceFacts(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    title: "朝阳区精装两居室，近地铁",
    district: "朝阳区",
    city: "北京",
    communityName: "望京西园",
    rentalType: "whole_unit",
    monthlyRent: 6500,
    bedrooms: 2,
    livingRooms: 1,
    bathrooms: 1,
    areaSqm: 85,
    floor: 12,
    totalFloors: 28,
    hasElevator: true,
    orientation: "南",
    decoration: "精装",
    petsAllowed: true,
    cookingAllowed: true,
    subwayText: "14号线望京站步行5分钟",
    facilities: ["健身房", "游泳池"],
    tags: ["近地铁", "采光好"],
    sellingPoints: ["南北通透", "房东直租"],
    ...overrides,
  };
}

function makeFact(field: string, value: string): FactReference {
  return { field, value };
}

function makeVisualFact(mediaId: string, claim: string): VisualFactReference {
  return { mediaId, claim };
}

// ============================================================
// Tests
// ============================================================

describe("checkContentFacts", () => {
  describe("confirmed facts", () => {
    it("1. recognizes facts with matching source values", () => {
      const source = makeSourceFacts();
      const facts = [
        makeFact("district", "朝阳区"),
        makeFact("city", "北京"),
        makeFact("bedrooms", "2"),
      ];

      const result = checkContentFacts(facts, [], source);

      expect(result.requiresFactReview).toBe(false);
      expect(result.fabricatedFacts).toHaveLength(0);
      // All confirmed
      for (const f of result.facts) {
        expect(f.hasSource).toBe(true);
        expect(f.safety).toBe("confirmed_fact");
      }
    });

    it("2. recognizes numeric facts as string comparisons", () => {
      const source = makeSourceFacts();
      const facts = [makeFact("monthlyRent", "6500")];

      const result = checkContentFacts(facts, [], source);

      expect(result.requiresFactReview).toBe(false);
      expect(result.facts[0]?.hasSource).toBe(true);
      expect(result.facts[0]?.safety).toBe("confirmed_fact");
    });

    it("3. recognizes boolean facts (hasElevator → 是)", () => {
      const source = makeSourceFacts();
      const facts = [makeFact("hasElevator", "是")];

      const result = checkContentFacts(facts, [], source);

      expect(result.requiresFactReview).toBe(false);
      expect(result.facts[0]?.hasSource).toBe(true);
      expect(result.facts[0]?.safety).toBe("confirmed_fact");
    });
  });

  describe("subjective judgments", () => {
    it("4. sellingPoints → subjective_judgment", () => {
      const source = makeSourceFacts();
      const facts = [makeFact("sellingPoints", "南北通透")];

      const result = checkContentFacts(facts, [], source);

      expect(result.requiresFactReview).toBe(false);
      expect(result.facts[0]?.safety).toBe("subjective_judgment");
      expect(result.facts[0]?.hasSource).toBe(true);
    });

    it("5. description → subjective_judgment", () => {
      const source = makeSourceFacts();
      const facts = [makeFact("description", "房子装修精美，采光极好")];

      const result = checkContentFacts(facts, [], source);

      expect(result.requiresFactReview).toBe(false);
      expect(result.facts[0]?.safety).toBe("subjective_judgment");
    });

    it("6. structural output fields → subjective_judgment with source", () => {
      const source = makeSourceFacts();
      const facts = [
        makeFact("title", "朝阳精装两居"),
        makeFact("hashtags", "#朝阳租房"),
        makeFact("hookOptions", ""),
      ];

      const result = checkContentFacts(facts, [], source);

      // These are structural, not factual claims
      for (const f of result.facts) {
        expect(f.safety).toBe("subjective_judgment");
      }
      expect(result.requiresFactReview).toBe(false);
    });
  });

  describe("fabricated / unconfirmed facts", () => {
    it("7. detects facts not in source data", () => {
      const source = makeSourceFacts();
      const facts = [
        makeFact("schoolDistrict", "人大附中"),
        makeFact("nearbyPark", "紧邻朝阳公园"),
      ];

      const result = checkContentFacts(facts, [], source);

      expect(result.requiresFactReview).toBe(true);
      expect(result.fabricatedFacts).toHaveLength(2);
      for (const f of result.fabricatedFacts) {
        expect(f.safety).toBe("unconfirmed_info");
        expect(f.hasSource).toBe(false);
      }
    });

    it("8. generates risk flags for fabricated facts", () => {
      const source = makeSourceFacts();
      const facts = [makeFact("floorArea", "200平米")];

      const result = checkContentFacts(facts, [], source);

      expect(result.requiresFactReview).toBe(true);
      expect(result.riskFlags.length).toBeGreaterThanOrEqual(2);
      // First risk flag should be for the specific fabricated fact
      expect(result.riskFlags[0]?.field).toBe("floorArea");
      expect(result.riskFlags[0]?.severity).toBe("medium");
      // Summary risk flag
      const summary = result.riskFlags.find((f) => f.field === "_summary");
      expect(summary).toBeDefined();
    });

    it("9. fabricated fact → high severity summary when unconfirmed", () => {
      const source = makeSourceFacts();
      const facts = [makeFact("pricePerSqm", "80000元/平")];

      const result = checkContentFacts(facts, [], source);

      const summary = result.riskFlags.find((f) => f.field === "_summary");
      expect(summary).toBeDefined();
      expect(summary?.severity).toBe("high");
    });

    it("10. multiple fabricated facts → single summary flag", () => {
      const source = makeSourceFacts();
      const facts = [
        makeFact("floorArea", "200平米"),
        makeFact("pricePerSqm", "80000元/平"),
        makeFact("schoolDistrict", "人大附中"),
      ];

      const result = checkContentFacts(facts, [], source);

      expect(result.fabricatedFacts).toHaveLength(3);
      const summaries = result.riskFlags.filter((f) => f.field === "_summary");
      expect(summaries).toHaveLength(1);
    });
  });

  describe("visual facts", () => {
    it("11. visual facts → confirmed_visual_fact", () => {
      const source = makeSourceFacts();
      const visualFacts: VisualFactReference[] = [
        makeVisualFact("media-uuid-1", "客厅朝南，采光好"),
        makeVisualFact("media-uuid-2", "厨房为封闭式"),
      ];

      const result = checkContentFacts([], visualFacts, source);

      // Visual facts are always confirmed_visual_fact (per contract: visual ≠ disproof)
      for (const f of result.facts) {
        expect(f.safety).toBe("confirmed_visual_fact");
        expect(f.hasSource).toBe(true);
      }
      expect(result.fabricatedFacts).toHaveLength(0);
    });
  });

  describe("empty input", () => {
    it("12. empty facts → no review required", () => {
      const source = makeSourceFacts();

      const result = checkContentFacts([], [], source);

      expect(result.requiresFactReview).toBe(false);
      expect(result.fabricatedFacts).toHaveLength(0);
      expect(result.riskFlags).toHaveLength(0);
    });
  });

  describe("source with null/undefined fields", () => {
    it("13. ignores null fields gracefully", () => {
      const source = makeSourceFacts({ district: null, monthlyRent: null });
      const facts = [
        makeFact("district", "朝阳区"),
        makeFact("monthlyRent", "6500"),
      ];

      const result = checkContentFacts(facts, [], source);

      // Both facts should be unconfirmed since source has null
      expect(result.fabricatedFacts).toHaveLength(2);
    });

    it("14. handles empty source object", () => {
      const result = checkContentFacts(
        [makeFact("district", "朝阳区")],
        [],
        {},
      );

      expect(result.fabricatedFacts).toHaveLength(1);
      expect(result.requiresFactReview).toBe(true);
    });
  });

  describe("value matching", () => {
    it("15. value mismatch → unconfirmed (not fabricated, but can't confirm)", () => {
      const source = makeSourceFacts({ monthlyRent: 6500 });
      const facts = [makeFact("monthlyRent", "8000")];

      const result = checkContentFacts(facts, [], source);

      expect(result.facts[0]?.hasSource).toBe(false);
      expect(result.facts[0]?.safety).toBe("unconfirmed_info");
      expect(result.requiresFactReview).toBe(true);
    });

    it("16. substring match → confirmed", () => {
      const source = makeSourceFacts({ subwayText: "14号线望京站步行5分钟" });
      const facts = [makeFact("subwayText", "14号线望京站")];

      const result = checkContentFacts(facts, [], source);

      expect(result.facts[0]?.hasSource).toBe(true);
      expect(result.facts[0]?.safety).toBe("confirmed_fact");
    });
  });
});
