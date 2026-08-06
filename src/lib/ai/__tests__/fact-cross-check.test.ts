// ============================================================
// Fact Cross-Check Unit Tests — P3-AI-007
// ============================================================

import { describe, it, expect } from "vitest";
import { crossCheckFacts } from "../fact-cross-check";
import type { PropertyMediaAiLabel } from "../types";

function makeLabel(overrides?: Partial<PropertyMediaAiLabel>): PropertyMediaAiLabel {
  return {
    sceneType: "living_room",
    styles: ["modern"],
    visibleFeatures: ["sofa", "tv", "wooden_floor"],
    condition: ["well_maintained"],
    lighting: ["natural_light"],
    appliances: ["air_conditioner", "tv"],
    confidence: 0.85,
    evidence: ["sofa_visible", "tv_visible"],
    uncertainLabels: [],
    ...overrides,
  };
}

describe("crossCheckFacts", () => {
  it("confirmed: balcony mentioned + visible → confirmed_visual_support", () => {
    const result = crossCheckFacts({
      textFacts: { description: "南向大阳台，采光好" },
      visualLabels: [makeLabel({ visibleFeatures: ["balcony", "大阳台"] })],
    });
    expect(result.factChecks.length).toBeGreaterThanOrEqual(1);
    const balcony = result.factChecks.find((f) => f.fieldName === "balcony");
    expect(balcony?.visualResult).toBe("confirmed_visual_support");
  });

  it("not verified: balcony mentioned but not visible → not_verified_by_images", () => {
    const result = crossCheckFacts({
      textFacts: { description: "带阳台" },
      visualLabels: [makeLabel()], // no balcony in visibleFeatures
    });
    const balcony = result.factChecks.find((f) => f.fieldName === "balcony");
    expect(balcony?.visualResult).toBe("not_verified_by_images");
    expect(balcony?.suggestion).toContain("建议补充");
  });

  it("not verified ≠ confirmed_visual_support — image not showing balcony ≠ NO balcony", () => {
    const result = crossCheckFacts({
      textFacts: { description: "有大阳台" },
      visualLabels: [makeLabel({ visibleFeatures: ["window", "curtain"] })],
    });
    const balcony = result.factChecks.find((f) => f.fieldName === "balcony");
    expect(balcony?.visualResult).not.toBe("insufficient_evidence");
    expect(balcony?.visualResult).not.toBe("possible_conflict");
  });

  it("possible conflict: open kitchen in text, closed kitchen in visuals", () => {
    const result = crossCheckFacts({
      textFacts: { description: "开放式厨房" },
      visualLabels: [makeLabel({ visibleFeatures: ["closed_kitchen", "封闭厨房"] })],
    });
    const kitchen = result.factChecks.find((f) => f.fieldName === "kitchen");
    expect(kitchen?.visualResult).toBe("possible_conflict");
  });

  it("appliance: dishwasher mentioned + visible", () => {
    const result = crossCheckFacts({
      textFacts: { description: "配洗碗机" },
      visualLabels: [makeLabel({ appliances: ["dishwasher", "洗碗机"] })],
    });
    const dw = result.factChecks.find((f) => f.textClaim === "洗碗机");
    expect(dw?.visualResult).toBe("confirmed_visual_support");
  });

  it("elevator confirmed", () => {
    const result = crossCheckFacts({
      textFacts: { hasElevator: true },
      visualLabels: [makeLabel({ visibleFeatures: ["elevator", "电梯"] })],
    });
    const el = result.factChecks.find((f) => f.fieldName === "hasElevator");
    expect(el?.visualResult).toBe("confirmed_visual_support");
  });

  it("decoration quality — subjective, lower confidence", () => {
    const result = crossCheckFacts({
      textFacts: { decoration: "精装修" },
      visualLabels: [makeLabel({ condition: ["well_maintained", "luxury"] })],
    });
    const dec = result.factChecks.find((f) => f.fieldName === "decoration");
    expect(dec?.visualResult).toBe("confirmed_visual_support");
    expect(dec?.suggestion).toContain("精装修");
  });

  it("no overlapping features → empty factChecks", () => {
    const result = crossCheckFacts({
      textFacts: { title: "普通房源" },
      visualLabels: [makeLabel()],
    });
    expect(result.factChecks).toHaveLength(0);
  });

  it("summary includes counts when checks exist", () => {
    const result = crossCheckFacts({
      textFacts: { description: "带阳台，开放式厨房", hasElevator: true, decoration: "精装修" },
      visualLabels: [
        makeLabel({
          visibleFeatures: ["balcony", "elevator"],
          condition: ["well_maintained"],
        }),
      ],
    });
    expect(result.summary).toContain("张图片");
    expect(result.summary.length).toBeGreaterThan(30);
  });

  it("each factCheck has required fields", () => {
    const result = crossCheckFacts({
      textFacts: { description: "带阳台，配洗碗机，开放式厨房" },
      visualLabels: [
        makeLabel({
          visibleFeatures: ["balcony"],
          appliances: ["dishwasher"],
        }),
      ],
    });

    for (const fc of result.factChecks) {
      expect(fc.textClaim).toBeDefined();
      expect(fc.fieldName).toBeDefined();
      expect(fc.visualResult).toBeDefined();
      expect(fc.confidence).toBeGreaterThanOrEqual(0);
      expect(fc.confidence).toBeLessThanOrEqual(1);
      expect(fc.suggestion).toBeDefined();
      expect([
        "confirmed_visual_support",
        "not_verified_by_images",
        "possible_conflict",
      ]).toContain(fc.visualResult);
    }
  });

  it("multiple images — scans all labels", () => {
    const result = crossCheckFacts({
      textFacts: { description: "带阳台，配电视" },
      visualLabels: [
        makeLabel({ visibleFeatures: ["balcony"] }), // image 1
        makeLabel({ appliances: ["tv"] }), // image 2
      ],
    });
    // Both features should be confirmed across the image set
    expect(result.factChecks.length).toBe(2);
  });

  it("summary when no overlapping features", () => {
    const result = crossCheckFacts({
      textFacts: { title: "Basic" },
      visualLabels: [makeLabel()],
    });
    expect(result.summary).toContain("无重叠特征");
  });
});
