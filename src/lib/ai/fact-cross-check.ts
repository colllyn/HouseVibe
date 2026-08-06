// ============================================================
// Fact Cross-Check — Text Facts vs Visual Evidence
// Owner: ai-deepseek-engineer
// Contract: docs/contracts/ai-contract.md v2.0
//           docs/plans/implementation-plan.md P3-AI-007
//
// Pure deterministic logic. No AI calls, no network, no DB.
// ============================================================

import type { VisualFactCheck, VisualFactLevel, PropertyMediaAiLabel } from "./types";

// ============================================================
// Feature keyword mappings for cross-checking
// ============================================================

/** Keywords that indicate a feature exists in text description */
const FEATURE_INDICATORS: Record<string, string[]> = {
  balcony: ["阳台", "露台"],
  openKitchen: ["开放式厨房", "开放厨房", "开敞厨房"],
  independentKitchen: ["独立厨房", "封闭厨房"],
  bathtub: ["浴缸", "独立浴缸"],
  floorHeating: ["地暖", "地板采暖"],
  centralAc: ["中央空调"],
  dishwasher: ["洗碗机"],
  dryer: ["烘干机", "干衣机"],
  wardrobe: ["衣柜", "衣帽间", "步入式衣柜"],
  doubleBed: ["双人床", "大床"],
  desk: ["书桌", "办公桌", "写字台"],
  sofa: ["沙发"],
  tv: ["电视", "电视机"],
  fridge: ["冰箱"],
  washingMachine: ["洗衣机"],
  waterHeater: ["热水器"],
  microwave: ["微波炉"],
  oven: ["烤箱"],
  rangeHood: ["油烟机", "抽油烟机"],
  elevator: ["电梯"],
  parking: ["停车位", "车位", "车库"],
  garden: ["花园", "院子"],
  securityGuard: ["保安", "门卫"],
  gym: ["健身房", "健身"],
  pool: ["游泳池", "泳池"],
};

// ============================================================
// Core cross-check logic
// ============================================================

export interface CrossCheckInput {
  /** Property text facts (from manual entry or AI extraction) */
  textFacts: Record<string, unknown>;
  /** AI labels from visual analysis (per-image) */
  visualLabels: PropertyMediaAiLabel[];
}

export interface CrossCheckResult {
  factChecks: VisualFactCheck[];
  summary: string;
}

/**
 * Checks if a feature keyword appears in the text facts.
 * Scans string values across all fields.
 */
function textMentionsFeature(facts: Record<string, unknown>, keywords: string[]): boolean {
  const textValues = Object.values(facts)
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.toLowerCase());

  const combined = textValues.join(" ");
  return keywords.some((kw) => combined.includes(kw.toLowerCase()));
}

/**
 * Checks if a feature is visible in the visual labels.
 * Scans all labels across all images.
 */
function visualShowsFeature(labels: PropertyMediaAiLabel[], featureKeywords: string[]): boolean {
  const allText = labels
    .flatMap((l) => [
      l.sceneType,
      ...l.styles,
      ...l.visibleFeatures,
      ...l.appliances,
      ...l.condition,
      ...l.evidence,
    ])
    .join(" ")
    .toLowerCase();

  return featureKeywords.some((kw) => allText.includes(kw.toLowerCase()));
}

/**
 * Checks if visual labels contain explicit counter-evidence.
 */
function visualShowsOpposite(labels: PropertyMediaAiLabel[], oppositeKeywords: string[]): boolean {
  return visualShowsFeature(labels, oppositeKeywords);
}

export interface FeatureRule {
  /** Human-readable field name */
  fieldName: string;
  /** What the text claims */
  textKeywords: string[];
  /** What to look for in visuals to confirm */
  visualKeywords: string[];
  /** What in visuals would contradict the text claim */
  oppositeKeywords?: string[];
  /** The text fact value (for suggestion generation) */
  textValue?: string;
}

/**
 * Cross-check a single feature: does the text claim match visual evidence?
 */
function checkFeature(rule: FeatureRule, labels: PropertyMediaAiLabel[]): VisualFactCheck | null {
  const textClaims = textMentionsFeature({ claim: rule.textValue ?? rule.textKeywords[0] ?? "" }, rule.textKeywords);
  if (!textClaims) return null; // feature not claimed in text — skip

  const visualConfirms = visualShowsFeature(labels, rule.visualKeywords);
  const visualOpposes = rule.oppositeKeywords
    ? visualShowsOpposite(labels, rule.oppositeKeywords)
    : false;

  let visualResult: VisualFactLevel;
  let suggestion: string;

  if (visualOpposes) {
    visualResult = "possible_conflict";
    suggestion = `文字描述为"${rule.textValue ?? rule.textKeywords[0]}"，但图片显示不一致，建议核实`;
  } else if (visualConfirms) {
    visualResult = "confirmed_visual_support";
    suggestion = `图片确认了"${rule.textValue ?? rule.textKeywords[0]}"的描述`;
  } else {
    // Neither confirmed nor contradicted — not verified by images
    visualResult = "not_verified_by_images";
    suggestion = `图片未验证"${rule.textValue ?? rule.textKeywords[0]}"，建议补充相关照片`;
  }

  return {
    textClaim: rule.textValue ?? rule.textKeywords[0] ?? "",
    fieldName: rule.fieldName,
    visualResult,
    confidence: visualConfirms ? 0.8 : visualOpposes ? 0.7 : 0.3,
    suggestion,
  };
}

/**
 * Deterministic cross-check between text property facts and visual analysis labels.
 *
 * Rules (per contract):
 * - Feature claimed in text + visible in images → confirmed_visual_support
 * - Feature claimed in text + NOT visible in images → not_verified_by_images (NOT "doesn't exist")
 * - Feature claimed in text + OPPOSITE visible → possible_conflict
 * - Feature not claimed → skipped (no check generated)
 * - Subjective features get confidence scores
 */
export function crossCheckFacts(input: CrossCheckInput): CrossCheckResult {
  const rules: FeatureRule[] = [];

  // Build rules from text facts
  const facts = input.textFacts;

  // Check for balcony
  const balconyKw = FEATURE_INDICATORS.balcony;
  if (balconyKw && textMentionsFeature(facts, balconyKw)) {
    rules.push({
      fieldName: "balcony",
      textKeywords: balconyKw,
      visualKeywords: ["balcony", "阳台", "terrace", "露台"],
      textValue: String(facts.description ?? facts.title ?? ""),
    });
  }

  // Check for open kitchen vs independent kitchen
  const openKitchenKw = FEATURE_INDICATORS.openKitchen;
  if (openKitchenKw && textMentionsFeature(facts, openKitchenKw)) {
    rules.push({
      fieldName: "kitchen",
      textKeywords: openKitchenKw,
      visualKeywords: ["open_kitchen", "开放式厨房", "kitchen_island"],
      oppositeKeywords: ["closed_kitchen", "独立厨房", "封闭厨房", "separate_kitchen"],
      textValue: "开放式厨房",
    });
  }

  // Check for elevator
  const elevatorKw = FEATURE_INDICATORS.elevator;
  if (facts.hasElevator === true && elevatorKw) {
    rules.push({
      fieldName: "hasElevator",
      textKeywords: elevatorKw,
      visualKeywords: ["elevator", "电梯", "lift"],
      textValue: "有电梯",
    });
  }

  // Check appliances
  function getKw(key: keyof typeof FEATURE_INDICATORS): string[] {
    return FEATURE_INDICATORS[key] ?? [];
  }
  const applianceMap: Array<{ key: string; textKw: string[]; visualKw: string[]; label: string }> = [
    { key: "dishwasher", textKw: getKw("dishwasher"), visualKw: ["dishwasher", "洗碗机"], label: "洗碗机" },
    { key: "dryer", textKw: getKw("dryer"), visualKw: ["dryer", "烘干机"], label: "烘干机" },
    { key: "washingMachine", textKw: getKw("washingMachine"), visualKw: ["washing_machine", "洗衣机"], label: "洗衣机" },
    { key: "tv", textKw: getKw("tv"), visualKw: ["tv", "television", "电视"], label: "电视" },
    { key: "fridge", textKw: getKw("fridge"), visualKw: ["fridge", "冰箱", "refrigerator"], label: "冰箱" },
    { key: "airConditioner", textKw: ["空调"], visualKw: ["air_conditioner", "空调", "ac_unit"], label: "空调" },
  ];

  for (const app of applianceMap) {
    if (textMentionsFeature(facts, app.textKw)) {
      rules.push({
        fieldName: "appliances",
        textKeywords: app.textKw,
        visualKeywords: app.visualKw,
        textValue: app.label,
      });
    }
  }

  // Check decoration quality (subjective — always lower confidence)
  const decorationText = String(facts.decoration ?? "");
  if (decorationText) {
    const isRefined = ["精装修", "豪装", "豪华装修", "高档装修"].some((k) =>
      decorationText.includes(k)
    );
    if (isRefined) {
      rules.push({
        fieldName: "decoration",
        textKeywords: ["精装修", "豪装", "豪华", "高档"],
        visualKeywords: ["well_maintained", "renovated", "modern", "luxury", "高档", "精装"],
        textValue: decorationText,
      });
    }
  }

  // Run all rules
  const factChecks = rules
    .map((rule) => checkFeature(rule, input.visualLabels))
    .filter((fc): fc is VisualFactCheck => fc !== null);

  // Build summary
  const confirmedCount = factChecks.filter((f) => f.visualResult === "confirmed_visual_support").length;
  const notVerifiedCount = factChecks.filter((f) => f.visualResult === "not_verified_by_images").length;
  const conflictCount = factChecks.filter((f) => f.visualResult === "possible_conflict").length;

  let summary = `图片分析了 ${input.visualLabels.length} 张图片，`;
  if (factChecks.length === 0) {
    summary += "文字描述与图片标签无重叠特征，无法进行交叉校验。建议补充更多房源细节图片。";
  } else {
    const parts: string[] = [];
    if (confirmedCount > 0) parts.push(`${confirmedCount} 项确认`);
    if (notVerifiedCount > 0) parts.push(`${notVerifiedCount} 项图片未验证`);
    if (conflictCount > 0) parts.push(`${conflictCount} 项疑似冲突`);
    summary += parts.join("、") + "。";
    if (notVerifiedCount > 0) {
      summary += "图片未验证不等于不存在，建议补充相关照片以提升房源可信度。";
    }
  }

  return { factChecks, summary };
}
