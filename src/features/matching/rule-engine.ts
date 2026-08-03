/**
 * matching/rule-engine.ts
 *
 * PURE FUNCTION — deterministic matching engine for P2-MATCH-001.
 * No AI, no random, no Date.now(), no external calls.
 * Same input ALWAYS produces the same output.
 *
 * Implements matching-contract.md (FROZEN v1.0):
 *   Phase 1 — Hard Filters     (§2)
 *   Phase 2 — Six-Dimension Scoring (§3)
 *   Phase 3 — Level Assignment  (§4.2)
 *   Phase 4 — Reasons / Confirmations (§4.3–4.5)
 *   Phase 5 — Stable Sort       (§5)
 *   Phase 6 — Next Action       (§4.6)
 */

import type { Json } from "@/types/database";
import type {
  MatchedReason,
  MatchResult,
  NeedsConfirmation,
  UnmatchedReason,
  WeightOverrides,
} from "./schemas";

// ─── Public Interfaces ───────────────────────────────────────────────

export interface ClientRecord {
  id: string;
  workspace_id: string;
  budget_min: number | null;
  budget_max: number | null;
  preferred_districts: string[];
  preferred_communities: string[];
  bedrooms: number | null;
  rental_type: string | null;
  available_from: string | null;
  pets_required: boolean | null;
  cooking_required: boolean | null;
  commute_destination: string | null;
  hard_requirements: Json;
  soft_preferences: Json;
  deal_breakers: string[];
  deleted_at: string | null;
}

export interface PropertyRecord {
  id: string;
  workspace_id: string;
  title: string;
  monthly_rent: number | null;
  district: string | null;
  community_name: string | null;
  bedrooms: number | null;
  rental_type: string;
  available_from: string | null;
  pets_allowed: boolean | null;
  cooking_allowed: boolean | null;
  subway_text: string | null;
  area_sqm: number | null;
  has_elevator: boolean | null;
  status: string;
  tags: string[];
  facilities: Json;
  selling_points: string[];
  deleted_at: string | null;
  updated_at: string;
}

// ─── Default Weights (contract §3.1) ─────────────────────────────────

const DEFAULT_WEIGHTS: Required<WeightOverrides> = {
  budget: 30,
  district: 20,
  roomType: 15,
  availability: 15,
  commute: 10,
  specialRequirements: 10,
};

// ─── Dimension Labels (Chinese per contract) ─────────────────────────

const DIMENSION_LABELS = {
  budget: "预算匹配",
  district: "区域匹配",
  roomType: "户型匹配",
  availability: "入住时间匹配",
  commute: "通勤/地铁匹配",
  specialRequirements: "特殊要求匹配",
} satisfies Record<string, string>;

// ─── Next Action Messages (contract §4.6) ────────────────────────────

const NEXT_ACTIONS = {
  excellent: "推荐立即发送房源给客户",
  good: "可发送房源，建议标注待确认信息",
  fair: "部分条件不匹配，可参考但不优先推荐",
  low: "不建议推荐，多数条件不匹配",
} satisfies Record<string, string>;

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Parse a date string (YYYY-MM-DD) to a comparable value.
 * Dates compared without time per contract §2.
 */
function parseDate(dateStr: string | null): number {
  if (dateStr === null || dateStr === undefined) return Number.NaN;
  // Extract the date portion only (ignore time)
  const d = new Date(dateStr.slice(0, 10));
  if (isNaN(d.getTime())) return Number.NaN;
  return d.getTime();
}

/**
 * Extract searchable text tokens from a property for tag/feature matching.
 * Combines tags, facilities keys, and selling_points into a single lowercase set.
 */
function propertySearchTokens(property: PropertyRecord): Set<string> {
  const tokens = new Set<string>();

  for (const tag of property.tags) {
    tokens.add(tag.toLowerCase());
  }

  // facilities is JSONB: extract keys that are truthy
  if (property.facilities && typeof property.facilities === "object") {
    const fac = property.facilities as Record<string, unknown>;
    for (const key of Object.keys(fac)) {
      if (fac[key]) {
        tokens.add(key.toLowerCase());
      }
    }
  }

  for (const sp of property.selling_points) {
    tokens.add(sp.toLowerCase());
  }

  return tokens;
}

/**
 * Flatten hard_requirements JSONB into a list of requirement strings.
 * Supports both object form { key: true/false }, array form [string, ...],
 * and array-of-objects form [{ type: "key", value: true }, ...].
 */
function flattenHardRequirements(reqs: Json): string[] {
  if (!reqs) return [];
  if (Array.isArray(reqs)) {
    const results: string[] = [];
    for (const item of reqs as unknown[]) {
      if (typeof item === "string") {
        results.push(item);
      } else if (typeof item === "object" && item !== null) {
        // Handle { type: "key", value: true } or { key: "name", value: any } format
        const obj = item as Record<string, unknown>;
        const key = (obj.type ?? obj.key ?? obj.name) as string | undefined;
        const val = obj.value;
        // Include if key exists and value is truthy (or if no value check needed)
        if (key && (val === undefined || val)) {
          results.push(String(key));
        }
      }
    }
    return results;
  }
  if (typeof reqs === "object") {
    return Object.keys(reqs as Record<string, unknown>);
  }
  return [];
}

/**
 * Flatten soft_preferences JSONB into a list of preference strings.
 */
function flattenSoftPreferences(prefs: Json): string[] {
  if (!prefs) return [];
  if (Array.isArray(prefs)) {
    return prefs.filter((p): p is string => typeof p === "string");
  }
  if (typeof prefs === "object") {
    // For object form, both keys and truthy keys are preferences
    const obj = prefs as Record<string, unknown>;
    return Object.keys(obj).filter((k) => obj[k]);
  }
  return [];
}

/**
 * Fuzzy match of commute_destination against property subway_text.
 * Returns a score 0-10 (contract §3.1 commute dimension).
 * Deterministic substring + character overlap scoring.
 */
function commuteMatch(
  commuteDestination: string,
  subwayText: string | null,
): number {
  if (!subwayText) return 0;

  const dest = commuteDestination.toLowerCase().trim();
  const subway = subwayText.toLowerCase().trim();

  if (!dest) return 0;

  // Full substring match → 10
  if (subway.includes(dest)) return 10;

  // Partial word overlap: check if any meaningful chunk of the destination
  // appears in subway_text. We split by common delimiters and test each segment.
  const segments = dest.split(/[,，、\s/]+/).filter((s) => s.length >= 2);
  let matchedSegments = 0;
  for (const seg of segments) {
    if (subway.includes(seg)) matchedSegments++;
  }

  if (matchedSegments === segments.length && segments.length > 0) return 8;
  if (matchedSegments >= 1) return 6;

  // Character-level overlap as last resort: check if any 2-char window of dest
  // appears in subway_text
  for (let i = 0; i <= dest.length - 2; i++) {
    const bigram = dest.slice(i, i + 2);
    if (subway.includes(bigram)) return 6;
  }

  return 0;
}

/**
 * Clamp and round a number.
 */
function clampScore(raw: number): number {
  return Math.max(0, Math.min(100, Math.round(raw)));
}

// ─── Phase 1: Hard Filters (contract §2) ─────────────────────────────

/**
 * Apply all hard (must-pass) filters.
 * Returns `null` if the property passes all filters.
 * Returns an array of unmatched reasons if it fails any filter.
 */
function applyHardFilters(
  client: ClientRecord,
  property: PropertyRecord,
): UnmatchedReason[] | null {
  const reasons: UnmatchedReason[] = [];

  // Filter 1: monthly_rent <= budget_max
  if (client.budget_max !== null && client.budget_max !== undefined) {
    const rent = property.monthly_rent;
    if (rent === null || rent === undefined || rent > client.budget_max) {
      reasons.push({
        code: "budget",
        label: DIMENSION_LABELS["budget"],
        detail: `月租 ¥${rent ?? "未知"} 超过预算上限 ¥${client.budget_max}`,
      });
    }
  }

  // Filter 2: pets_required → pets_allowed
  if (client.pets_required === true) {
    if (property.pets_allowed !== true) {
      reasons.push({
        code: "pets_not_allowed",
        label: "不允许宠物",
        detail: "该房源不允许养宠物",
      });
    }
  }

  // Filter 3: rental_type exact match
  if (client.rental_type !== null && client.rental_type !== undefined) {
    if (property.rental_type !== client.rental_type) {
      const rentalTypeLabel = (v: string) => v === "whole_unit" ? "整租" : v === "shared_room" ? "合租" : v;
      reasons.push({
        code: "rental_type",
        label: "租赁类型不匹配",
        detail: `客户要求${rentalTypeLabel(client.rental_type!)}，房源为${rentalTypeLabel(property.rental_type)}`,
      });
    }
  }

  // Filter 4: property.available_from <= client.available_from
  if (client.available_from !== null && client.available_from !== undefined) {
    const clientDate = parseDate(client.available_from);
    const propDate = parseDate(property.available_from);
    if (!isNaN(clientDate)) {
      if (isNaN(propDate) || propDate > clientDate) {
        reasons.push({
          code: "availability",
          label: DIMENSION_LABELS["availability"],
          detail: `房源最早${property.available_from ?? "未知"}入住，客户要求${client.available_from}前`,
        });
      }
    }
  }

  // Filter 5: property.bedrooms >= client.bedrooms
  if (client.bedrooms !== null && client.bedrooms !== undefined) {
    const propBeds = property.bedrooms;
    if (propBeds === null || propBeds === undefined || propBeds < client.bedrooms) {
      reasons.push({
        code: "bedrooms",
        label: "卧室数量不足",
        detail: `房源${propBeds ?? "未知"}室，客户要求至少${client.bedrooms}室`,
      });
    }
  }

  // Filter 6: cooking_required → cooking_allowed
  if (client.cooking_required === true) {
    if (property.cooking_allowed !== true) {
      reasons.push({
        code: "cooking_not_allowed",
        label: "不允许做饭",
        detail: "该房源不允许做饭",
      });
    }
  }

  // Filter 7: hard_requirements (JSONB) — check against property tags/facilities
  const hardReqs = flattenHardRequirements(client.hard_requirements);
  if (hardReqs.length > 0) {
    const tokens = propertySearchTokens(property);
    for (const req of hardReqs) {
      if (!tokens.has(req.toLowerCase())) {
        reasons.push({
          code: `hard_requirement:${req}`,
          label: `缺少要求：${req}`,
          detail: `房源不满足硬性要求：${req}`,
        });
      }
    }
  }

  // Filter 8: deal_breakers — exclude if any property tag matches a deal_breaker
  if (client.deal_breakers && client.deal_breakers.length > 0) {
    const tokens = propertySearchTokens(property);
    for (const breaker of client.deal_breakers) {
      if (tokens.has(breaker.toLowerCase())) {
        reasons.push({
          code: `deal_breaker:${breaker}`,
          label: `不可接受条件：${breaker}`,
          detail: `房源包含客户不可接受的条件：${breaker}`,
        });
      }
    }
  }

  // Filter 9: property status='available' AND deleted_at IS NULL
  if (property.status !== "available") {
    reasons.push({
      code: "property_unavailable",
      label: "房源不可用",
      detail: `房源状态为${property.status}`,
    });
  }
  if (property.deleted_at !== null && property.deleted_at !== undefined) {
    reasons.push({
      code: "property_deleted",
      label: "房源已删除",
      detail: "该房源已被删除",
    });
  }

  return reasons.length > 0 ? reasons : null;
}

// ─── Phase 2: Six-Dimension Scoring (contract §3) ────────────────────

interface DimensionScore {
  rawScore: number; // the dimension score (out of its default weight max)
  reason: MatchedReason | null;
  needsConfirmation: NeedsConfirmation | null;
}

/**
 * Score the budget dimension (default max 30).
 */
function scoreBudget(
  client: ClientRecord,
  property: PropertyRecord,
): DimensionScore {
  // No budget_max → full marks (client didn't specify)
  if (client.budget_max === null || client.budget_max === undefined) {
    return {
      rawScore: 30,
      reason: { code: "budget", label: DIMENSION_LABELS["budget"], scoreContribution: 30, detail: "客户未设置预算上限，默认满分" },
      needsConfirmation: null,
    };
  }

  const rent = property.monthly_rent;
  if (rent === null || rent === undefined) {
    return {
      rawScore: 0,
      reason: null,
      needsConfirmation: { code: "rent_unknown", label: "租金未知", detail: "房源未标注月租金，无法评估预算匹配" },
    };
  }

  // Rent is within budget
  if (rent <= client.budget_max) {
    // If budget_min also set, closer to budget_min gets mention but still full marks
    if (client.budget_min !== null && client.budget_min !== undefined) {
      const midpoint = (client.budget_min + client.budget_max) / 2;
      const distanceFromMid = Math.abs(rent - midpoint);
      const range = client.budget_max - client.budget_min;
      // Slight score adjustment based on distance from midpoint
      // Full 30 if within 20% of midpoint; partial otherwise
      if (range > 0 && distanceFromMid > range * 0.4) {
        const partialScore = Math.max(20, 30 - Math.floor(distanceFromMid / 200) * 2);
        return {
          rawScore: partialScore,
          reason: { code: "budget", label: DIMENSION_LABELS["budget"], scoreContribution: partialScore, detail: `月租 ¥${rent} 在预算 ¥${client.budget_min}-¥${client.budget_max} 内，偏离预算中点` },
          needsConfirmation: null,
        };
      }
    }
    return {
      rawScore: 30,
      reason: { code: "budget", label: DIMENSION_LABELS["budget"], scoreContribution: 30, detail: `月租 ¥${rent} 在预算 ¥${client.budget_max} 以内` },
      needsConfirmation: null,
    };
  }

  return {
    rawScore: 0,
    reason: null,
    needsConfirmation: null,
  };
}

/**
 * Score the district dimension (default max 20).
 */
function scoreDistrict(
  client: ClientRecord,
  property: PropertyRecord,
): DimensionScore {
  // No preferred_districts → full marks
  if (!client.preferred_districts || client.preferred_districts.length === 0) {
    return {
      rawScore: 20,
      reason: { code: "district", label: DIMENSION_LABELS["district"], scoreContribution: 20, detail: "客户未设置区域偏好，默认满分" },
      needsConfirmation: null,
    };
  }

  const propDistrict = property.district;
  // Property missing district data → 0 (client has requirement per contract §1.2)
  if (!propDistrict) {
    return {
      rawScore: 0,
      reason: null,
      needsConfirmation: { code: "district_unknown", label: "区域未知", detail: "房源未标注所属区域" },
    };
  }

  const lowerDistrict = propDistrict.toLowerCase();
  const preferred = client.preferred_districts.map((d) => d.toLowerCase());

  // Exact district match → 20
  if (preferred.includes(lowerDistrict)) {
    return {
      rawScore: 20,
      reason: { code: "district", label: DIMENSION_LABELS["district"], scoreContribution: 20, detail: `房源位于首选区域 ${propDistrict}` },
      needsConfirmation: null,
    };
  }

  // Same city different district → 10
  // We approximate "same city" by checking if the property's city matches any
  // common city prefix in preferred_districts. Since we don't have access to
  // property.city in the simplified property record, we default to 0 for
  // non-matching districts.
  return {
    rawScore: 0,
    reason: null,
    needsConfirmation: null,
  };
}

/**
 * Score the roomType dimension (default max 15).
 */
function scoreRoomType(
  client: ClientRecord,
  property: PropertyRecord,
): DimensionScore {
  // No bedrooms requirement → full marks
  if (client.bedrooms === null || client.bedrooms === undefined) {
    return {
      rawScore: 15,
      reason: { code: "roomType", label: DIMENSION_LABELS["roomType"], scoreContribution: 15, detail: "客户未指定卧室数量要求，默认满分" },
      needsConfirmation: null,
    };
  }

  const propBeds = property.bedrooms;
  if (propBeds === null || propBeds === undefined) {
    return {
      rawScore: 0,
      reason: null,
      needsConfirmation: { code: "bedrooms_unknown", label: "卧室数未知", detail: "房源未标注卧室数量" },
    };
  }

  const diff = Math.abs(propBeds - client.bedrooms);

  if (diff === 0) {
    return {
      rawScore: 15,
      reason: { code: "roomType", label: DIMENSION_LABELS["roomType"], scoreContribution: 15, detail: `${propBeds}室户型精确匹配客户要求` },
      needsConfirmation: null,
    };
  }

  if (diff === 1) {
    return {
      rawScore: 8,
      reason: { code: "roomType", label: DIMENSION_LABELS["roomType"], scoreContribution: 8, detail: `${propBeds}室户型与客户要求差1间` },
      needsConfirmation: null,
    };
  }

  return {
    rawScore: 0,
    reason: null,
    needsConfirmation: null,
  };
}

/**
 * Score the availability dimension (default max 15).
 */
function scoreAvailability(
  client: ClientRecord,
  property: PropertyRecord,
): DimensionScore {
  // No client available_from → full marks
  if (client.available_from === null || client.available_from === undefined) {
    return {
      rawScore: 15,
      reason: { code: "availability", label: DIMENSION_LABELS["availability"], scoreContribution: 15, detail: "客户未指定入住时间，默认满分" },
      needsConfirmation: null,
    };
  }

  const clientDate = parseDate(client.available_from);
  if (isNaN(clientDate)) {
    return {
      rawScore: 15,
      reason: { code: "availability", label: DIMENSION_LABELS["availability"], scoreContribution: 15, detail: "无法解析客户入住时间，默认满分" },
      needsConfirmation: null,
    };
  }

  const propDate = parseDate(property.available_from);
  if (isNaN(propDate)) {
    return {
      rawScore: 0,
      reason: null,
      needsConfirmation: { code: "available_from_unknown", label: "可入住时间未知", detail: "房源未标注可入住时间" },
    };
  }

  const diffMs = propDate - clientDate;
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) {
    // Property available on or before client's date → full marks
    return {
      rawScore: 15,
      reason: { code: "availability", label: DIMENSION_LABELS["availability"], scoreContribution: 15, detail: `房源${property.available_from}可入住，不晚于客户要求${client.available_from}` },
      needsConfirmation: null,
    };
  }

  // Each 7 days late subtracts 5 (min 0)
  const penalty = Math.floor(diffDays / 7) * 5;
  const score = Math.max(0, 15 - penalty);

  return {
    rawScore: score,
    reason: score > 0
      ? { code: "availability", label: DIMENSION_LABELS["availability"], scoreContribution: score, detail: `房源${property.available_from}可入住，比客户要求晚${diffDays}天` }
      : null,
    needsConfirmation: null,
  };
}

/**
 * Score the commute dimension (default max 10).
 */
function scoreCommute(
  client: ClientRecord,
  property: PropertyRecord,
): DimensionScore {
  // No commute_destination → full marks
  if (!client.commute_destination) {
    return {
      rawScore: 10,
      reason: { code: "commute", label: DIMENSION_LABELS["commute"], scoreContribution: 10, detail: "客户未指定通勤目的地，默认满分" },
      needsConfirmation: null,
    };
  }

  const score = commuteMatch(client.commute_destination, property.subway_text);

  if (score === 10) {
    return {
      rawScore: 10,
      reason: { code: "commute", label: DIMENSION_LABELS["commute"], scoreContribution: 10, detail: `地铁信息匹配通勤目的地"${client.commute_destination}"` },
      needsConfirmation: null,
    };
  }

  if (score >= 6) {
    return {
      rawScore: score,
      reason: { code: "commute", label: DIMENSION_LABELS["commute"], scoreContribution: score, detail: `地铁信息部分匹配通勤目的地"${client.commute_destination}"` },
      needsConfirmation: null,
    };
  }

  // No match but client has destination → check if property has subway_text at all
  if (!property.subway_text) {
    return {
      rawScore: 0,
      reason: null,
      needsConfirmation: { code: "subway_distance_unknown", label: "地铁距离未确认", detail: "地铁距离需确认，未在房源信息中明确标注" },
    };
  }

  return {
    rawScore: 0,
    reason: null,
    needsConfirmation: null,
  };
}

/**
 * Score the specialRequirements dimension (default max 10).
 * Each soft_preference match → +2, max 10.
 */
function scoreSpecialRequirements(
  client: ClientRecord,
  property: PropertyRecord,
): DimensionScore {
  const prefs = flattenSoftPreferences(client.soft_preferences);

  if (prefs.length === 0) {
    return {
      rawScore: 10,
      reason: { code: "specialRequirements", label: DIMENSION_LABELS["specialRequirements"], scoreContribution: 10, detail: "客户未设置特殊偏好，默认满分" },
      needsConfirmation: null,
    };
  }

  const tokens = propertySearchTokens(property);
  let matched = 0;
  const matchedPrefs: string[] = [];

  for (const pref of prefs) {
    if (tokens.has(pref.toLowerCase())) {
      matched++;
      matchedPrefs.push(pref);
    }
  }

  const score = Math.min(10, matched * 2);

  if (score > 0) {
    return {
      rawScore: score,
      reason: { code: "specialRequirements", label: DIMENSION_LABELS["specialRequirements"], scoreContribution: score, detail: `匹配偏好：${matchedPrefs.join("、")}（${matched}项，每项+2分）` },
      needsConfirmation: null,
    };
  }

  return {
    rawScore: 0,
    reason: null,
    needsConfirmation: null,
  };
}

// ─── Phase 2 Aggregator ──────────────────────────────────────────────

function scoreAllDimensions(
  client: ClientRecord,
  property: PropertyRecord,
  weights: Required<WeightOverrides>,
): {
  totalScore: number;
  matchedReasons: MatchedReason[];
  needsConfirmation: NeedsConfirmation[];
} {
  const dimensions: Array<{
    code: string;
    score: DimensionScore;
    weight: number;
    baseWeight: number;
  }> = [
    { code: "budget", score: scoreBudget(client, property), weight: weights.budget, baseWeight: DEFAULT_WEIGHTS.budget },
    { code: "district", score: scoreDistrict(client, property), weight: weights.district, baseWeight: DEFAULT_WEIGHTS.district },
    { code: "roomType", score: scoreRoomType(client, property), weight: weights.roomType, baseWeight: DEFAULT_WEIGHTS.roomType },
    { code: "availability", score: scoreAvailability(client, property), weight: weights.availability, baseWeight: DEFAULT_WEIGHTS.availability },
    { code: "commute", score: scoreCommute(client, property), weight: weights.commute, baseWeight: DEFAULT_WEIGHTS.commute },
    { code: "specialRequirements", score: scoreSpecialRequirements(client, property), weight: weights.specialRequirements, baseWeight: DEFAULT_WEIGHTS.specialRequirements },
  ];

  const matchedReasons: MatchedReason[] = [];
  const needsConfirmation: NeedsConfirmation[] = [];

  let totalRaw = 0;
  for (const dim of dimensions) {
    if (dim.baseWeight === 0) continue;

    // Weighted contribution: rawScore * weight / baseWeight (contract §3.3 formula)
    const contribution = dim.score.rawScore * dim.weight / dim.baseWeight;
    totalRaw += contribution;

    // matchedReasons use the SCORE CONTRIBUTION (weighted) per contract §4.3
    if (dim.score.reason) {
      matchedReasons.push({
        ...dim.score.reason,
        scoreContribution: Math.round(contribution),
      });
    }
    if (dim.score.needsConfirmation) {
      needsConfirmation.push(dim.score.needsConfirmation);
    }
  }

  return {
    totalScore: clampScore(totalRaw),
    matchedReasons,
    needsConfirmation,
  };
}

// ─── Phase 3: Level Assignment (contract §4.2) ───────────────────────

function assignLevel(score: number): MatchResult["matchLevel"] {
  if (score >= 85) return "excellent";
  if (score >= 65) return "good";
  if (score >= 40) return "fair";
  return "low";
}

// ─── Phase 6: Next Action (contract §4.6) ────────────────────────────

function nextAction(level: string): string {
  return (NEXT_ACTIONS as Record<string, string>)[level] ?? NEXT_ACTIONS.low;
}

// ─── Main Export: calculateMatches ───────────────────────────────────

/**
 * Calculate matches between a single client and an array of properties.
 *
 * PURE FUNCTION — deterministic. No side effects, no AI, no random.
 *
 * @param client        - The client record from the database.
 * @param properties    - Array of property records to match against.
 * @param weightOverrides - Optional user-defined dimension weights.
 * @returns Sorted array of MatchResult (score DESC, then updated_at DESC).
 */
export function calculateMatches(
  client: ClientRecord,
  properties: PropertyRecord[],
  weightOverrides?: WeightOverrides,
): MatchResult[] {
  // Merge weight overrides with defaults
  const weights: Required<WeightOverrides> = {
    budget: weightOverrides?.budget ?? DEFAULT_WEIGHTS.budget,
    district: weightOverrides?.district ?? DEFAULT_WEIGHTS.district,
    roomType: weightOverrides?.roomType ?? DEFAULT_WEIGHTS.roomType,
    availability: weightOverrides?.availability ?? DEFAULT_WEIGHTS.availability,
    commute: weightOverrides?.commute ?? DEFAULT_WEIGHTS.commute,
    specialRequirements: weightOverrides?.specialRequirements ?? DEFAULT_WEIGHTS.specialRequirements,
  };

  const results: MatchResult[] = [];

  for (const property of properties) {
    // ── Phase 1: Hard Filters ──
    const hardFilterFailures = applyHardFilters(client, property);

    if (hardFilterFailures !== null) {
      // Property failed hard filters → score 0, level "low", unmatchedReasons only
      results.push({
        propertyId: property.id,
        score: 0,
        matchLevel: "low",
        matchedReasons: [],
        unmatchedReasons: hardFilterFailures,
        needsConfirmation: [],
        nextAction: nextAction("low"),
      });
      continue;
    }

    // ── Phase 2: Six-Dimension Scoring ──
    const { totalScore, matchedReasons, needsConfirmation } = scoreAllDimensions(
      client,
      property,
      weights,
    );

    // ── Phase 3: Level Assignment ──
    const level = assignLevel(totalScore);

    results.push({
      propertyId: property.id,
      score: totalScore,
      matchLevel: level,
      matchedReasons,
      unmatchedReasons: [],
      needsConfirmation,
      nextAction: nextAction(level),
    });
  }

  // ── Phase 5: Stable Sort ──
  // 1. score DESC
  // 2. properties.updated_at DESC (most recent first)
  // Use a stable sort: Array.prototype.sort is stable in ES2019+
  results.sort((a, b) => {
    // Primary: score DESC
    if (b.score !== a.score) return b.score - a.score;

    // Secondary: property.updated_at DESC
    const propA = properties.find((p) => p.id === a.propertyId);
    const propB = properties.find((p) => p.id === b.propertyId);
    const dateA = propA?.updated_at ?? "";
    const dateB = propB?.updated_at ?? "";
    if (dateB !== dateA) return dateB.localeCompare(dateA);

    // Tertiary: property id for deterministic tie-breaker
    return a.propertyId.localeCompare(b.propertyId);
  });

  return results;
}
