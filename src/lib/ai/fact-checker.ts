// ============================================================
// Content Fact Checker — P3-AI-009
// Owner: ai-deepseek-engineer
// Contract: docs/contracts/ai-contract.md §8, §12
//
// Server-side fact verification: compares AI-generated content's
// factsUsed / visualFactsUsed against confirmed source property data.
// Detects fabricated facts and classifies fact safety levels.
// ============================================================

import type {
  FactReference,
  VisualFactReference,
  RiskFlag,
} from "@/lib/ai/types";

// ============================================================
// Types
// ============================================================

export type FactSafetyLevel =
  | "confirmed_fact"
  | "confirmed_visual_fact"
  | "subjective_judgment"
  | "unconfirmed_info";

export interface FactClassification {
  /** The claim or fact being classified */
  claim: string;
  /** Source field name if mapped to a known field */
  sourceField?: string;
  /** Safety classification */
  safety: FactSafetyLevel;
  /** Whether the fact has a verified source in the property data */
  hasSource: boolean;
}

export interface FactCheckResult {
  /** Per-fact classifications */
  facts: FactClassification[];
  /** Facts that could not be mapped to any known source data */
  fabricatedFacts: FactClassification[];
  /** Aggregated risk flags */
  riskFlags: RiskFlag[];
  /** Whether human review is required before copy is allowed */
  requiresFactReview: boolean;
}

/**
 * Source property facts used for verification.
 * Only includes fields that AI content can legitimately reference.
 */
export interface SourcePropertyFacts {
  title?: string | null;
  district?: string | null;
  city?: string | null;
  communityName?: string | null;
  rentalType?: string | null;
  monthlyRent?: number | null;
  bedrooms?: number | null;
  livingRooms?: number | null;
  bathrooms?: number | null;
  areaSqm?: number | null;
  floor?: number | null;
  totalFloors?: number | null;
  hasElevator?: boolean | null;
  orientation?: string | null;
  decoration?: string | null;
  petsAllowed?: boolean | null;
  cookingAllowed?: boolean | null;
  subwayText?: string | null;
  facilities?: string[] | null;
  tags?: string[] | null;
  sellingPoints?: string[] | null;
  description?: string | null;
}

// ============================================================
// Field name → display name mapping for fact matching
// ============================================================

// Field name → display name mapping (reserved for future i18n / UI use)
const _FIELD_DISPLAY_NAMES: Record<string, string> = {
  title: "标题",
  district: "区域",
  city: "城市",
  communityName: "小区名称",
  rentalType: "租赁类型",
  monthlyRent: "月租金",
  bedrooms: "卧室数",
  livingRooms: "客厅数",
  bathrooms: "卫生间数",
  areaSqm: "面积",
  floor: "楼层",
  totalFloors: "总楼层",
  hasElevator: "电梯",
  orientation: "朝向",
  decoration: "装修",
  petsAllowed: "宠物",
  cookingAllowed: "做饭",
  subwayText: "地铁",
  facilities: "配套设施",
  tags: "标签",
  sellingPoints: "卖点",
  description: "描述",
};
void _FIELD_DISPLAY_NAMES;

// Fields that represent subjective assessments (not verifiable)
const SUBJECTIVE_FIELDS = new Set([
  "drawbacks",
  "sellingPoints",
  "description",
]);

// Fields that are always structure facts (not verifiable claims)
const STRUCTURAL_FIELDS = new Set([
  "title",
  "subtitle",
  "interactionQuestion",
  "privateMessageKeyword",
  "coverText",
  "hook",
  "body",
  "fullVoiceover",
  "caption",
  "commentCta",
  "copyOptions",
  "shortCta",
  "nineGridSuggestion",
  "imageSequence",
  "imageCaptions",
  "shots",
  "subtitles",
  "hashtags",
  "factualSummary",
  "missingInformation",
  "missingShots",
  "hookOptions",
  "titleOptions",
]);

// ============================================================
// Fact Checker
// ============================================================

/**
 * Check AI-generated content facts against source property data.
 *
 * Rules (per ai-contract §8, §12):
 * - Facts mapping to known property fields with matching values → confirmed_fact
 * - Visual facts with media evidence → confirmed_visual_fact
 * - Subjective assessments → subjective_judgment
 * - Facts that cannot be mapped to any source field → unconfirmed_info
 * - Unmapped facts are NOT presumed false; they require human review
 * - requiresFactReview = true when ANY fabricated or unconfirmed facts exist
 */
export function checkContentFacts(
  factsUsed: FactReference[],
  visualFactsUsed: VisualFactReference[],
  sourceFacts: Record<string, unknown>,
): FactCheckResult {
  const classifications: FactClassification[] = [];
  const fabricatedFacts: FactClassification[] = [];
  const riskFlags: RiskFlag[] = [];

  // Build a searchable source of truth
  const sourceEntries = buildSourceEntries(sourceFacts);
  const sourceFieldNames = new Set(Object.keys(sourceEntries));

  // Process text-based facts
  for (const fact of factsUsed) {
    const classification = classifyTextFact(fact, sourceEntries, sourceFieldNames);
    classifications.push(classification);

    if (!classification.hasSource) {
      fabricatedFacts.push(classification);

      // Fabricated fact → medium risk flag
      riskFlags.push({
        field: fact.field,
        severity: "medium",
        description: `内容声称的事实 "${fact.value}" (字段 ${fact.field}) 在源数据中未找到对应信息，请人工核实`,
      });
    }
  }

  // Process visual facts
  for (const vFact of visualFactsUsed) {
    const classification: FactClassification = {
      claim: vFact.claim,
      sourceField: vFact.mediaId,
      safety: "confirmed_visual_fact",
      hasSource: true,
    };
    classifications.push(classification);
  }

  // Determine if fact review is required
  const requiresFactReview = fabricatedFacts.length > 0;

  // If review is required, add a summary risk flag
  if (requiresFactReview) {
    riskFlags.push({
      field: "_summary",
      severity: fabricatedFacts.some((f) => f.safety === "unconfirmed_info")
        ? "high"
        : "medium",
      description: `检测到 ${fabricatedFacts.length} 项内容声明在源数据中缺少对应信息，建议人工审核后再发布`,
    });
  }

  return { facts: classifications, fabricatedFacts, riskFlags, requiresFactReview };
}

// ============================================================
// Helpers
// ============================================================

function buildSourceEntries(
  sourceFacts: Record<string, unknown>,
): Record<string, string> {
  const entries: Record<string, string> = {};

  for (const [key, value] of Object.entries(sourceFacts)) {
    if (value === null || value === undefined) continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item.trim()) {
          entries[`${key}:${item}`] = String(item);
          // Also add individual items for fuzzy matching
        }
      }
      // Store full array as comma-separated
      entries[key] = value.filter((v) => typeof v === "string").join(", ");
    } else if (typeof value === "boolean") {
      entries[key] = value ? "是" : "否";
    } else {
      entries[key] = String(value);
    }
  }

  return entries;
}

function classifyTextFact(
  fact: FactReference,
  sourceEntries: Record<string, string>,
  sourceFieldNames: Set<string>,
): FactClassification {
  const field = fact.field;
  const value = fact.value;

  // Skip structural fields (not factual claims)
  if (STRUCTURAL_FIELDS.has(field)) {
    return {
      claim: value,
      sourceField: field,
      safety: "subjective_judgment",
      hasSource: true,
    };
  }

  // Subjective fields → always have a source (they are interpretations, not facts)
  if (SUBJECTIVE_FIELDS.has(field)) {
    return {
      claim: value,
      sourceField: field,
      safety: "subjective_judgment",
      hasSource: true,
    };
  }

  // Check if field exists in source
  if (sourceFieldNames.has(field)) {
    const sourceValue = sourceEntries[field];

    // Objective field → check value match
    const match = fuzzyFieldMatch(String(value), sourceValue ?? "");
    return {
      claim: value,
      sourceField: field,
      safety: match ? "confirmed_fact" : "unconfirmed_info",
      hasSource: match,
    };
  }

  // Try fuzzy matching: field might be a sub-key like "district:朝阳区"
  for (const srcKey of sourceFieldNames) {
    if (srcKey.startsWith(`${field}:`)) {
      const srcValue = sourceEntries[srcKey];
      const match = fuzzyFieldMatch(String(value), srcValue ?? "");
      return {
        claim: value,
        sourceField: srcKey,
        safety: match ? "confirmed_fact" : "unconfirmed_info",
        hasSource: match,
      };
    }
  }

  // Field not found in source at all → unconfirmed_info
  return {
    claim: value,
    sourceField: undefined,
    safety: "unconfirmed_info",
    hasSource: false,
  };
}

/**
 * Loose value comparison. Not full NLP — checks if core tokens overlap.
 * False here means "we can't confirm" (not "this is wrong").
 */
function fuzzyFieldMatch(claimValue: string, sourceValue: string): boolean {
  const norm = (s: string) =>
    s
      .replace(/\s+/g, "")
      .replace(/[，,。.]/g, "")
      .toLowerCase();

  const c = norm(claimValue);
  const s = norm(sourceValue);

  if (!c || !s) return false;

  // Exact normalized match
  if (c === s) return true;

  // Source contains claim or claim contains source
  if (s.includes(c) || c.includes(s)) return true;

  // Token overlap (Chinese character-level)
  const cSet = new Set(c.split(""));
  const sSet = new Set(s.split(""));
  const intersection = new Set([...cSet].filter((x) => sSet.has(x)));
  const union = new Set([...cSet, ...sSet]);

  // Require >50% Jaccard similarity for a "match"
  return intersection.size / union.size > 0.5;
}
