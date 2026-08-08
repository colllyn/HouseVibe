/**
 * AI extraction → property form mapping utilities.
 *
 * Pure functions: no React, no Supabase, no side effects.
 * Handles all type conversions explicitly — never
 * form.reset(aiResult) or Object.assign.
 */

// ============================================================
// Extraction key (camelCase) → form field name (snake_case)
// ============================================================

const EXTRACTION_TO_FORM_NAME: Record<string, string> = {
  title: "title",
  city: "city",
  district: "district",
  businessArea: "business_area",
  communityName: "community_name",
  addressText: "address_text",
  rentalType: "rental_type",
  monthlyRent: "monthly_rent",
  depositTerms: "deposit_terms",
  bedrooms: "bedrooms",
  livingRooms: "living_rooms",
  bathrooms: "bathrooms",
  areaSqm: "area_sqm",
  floor: "floor",
  availableFrom: "available_from",
  hasElevator: "has_elevator",
  petsAllowed: "pets_allowed",
  cookingAllowed: "cooking_allowed",
};

/**
 * Explicit, field-by-field mapper from AI extraction facts
 * (camelCase keys) to HTML form field values (snake_case keys).
 *
 * Rules:
 * - Only keys present in EXTRACTION_TO_FORM_NAME are mapped.
 *   Unknown AI fields are silently ignored.
 * - Numbers are converted to their string representation.
 * - Booleans become "true" / "false" strings (suitable for
 *   programmatic form value assignment; checkbox .checked is
 *   handled separately by the caller).
 * - Arrays are joined with "、" (Chinese enumeration comma).
 * - null / undefined / empty string values are skipped.
 */
export function mapExtractionToFormValues(
  facts: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [extractionKey, formName] of Object.entries(EXTRACTION_TO_FORM_NAME)) {
    const raw = facts[extractionKey];

    // Skip missing values — don't overwrite existing form content
    if (raw === null || raw === undefined || raw === "") continue;

    if (typeof raw === "boolean") {
      result[formName] = raw;
    } else if (Array.isArray(raw)) {
      result[formName] = raw.join("、");
    } else if (typeof raw === "number") {
      result[formName] = String(raw);
    } else {
      result[formName] = String(raw);
    }
  }

  return result;
}

// ============================================================
// Deterministic title generation
// ============================================================

const CN_DIGITS: Record<number, string> = {
  1: "一",
  2: "两",
  3: "三",
  4: "四",
  5: "五",
  6: "六",
  7: "七",
  8: "八",
  9: "九",
};

function cnDigit(n: number): string {
  return CN_DIGITS[n] ?? String(n);
}

/**
 * Generate a Chinese property title from confirmed facts ONLY.
 *
 * Priority:
 *   communityName + bedrooms + livingRooms → "阳光花园两室一厅出租"
 *   businessArea + bedrooms → "三里屯两室出租"
 *
 * Rules:
 * - Only uses facts that are explicitly present and non-empty.
 * - Never fabricates decorations (精装), subway (地铁房),
 *   quality adjectives (高品质, 豪华), or urgency (急租, 低价).
 * - Returns null if there isn't enough data for a reliable title.
 */
export function generateTitle(facts: Record<string, unknown>): string | null {
  const communityName = asNonEmptyString(facts["communityName"]);
  const businessArea = asNonEmptyString(facts["businessArea"]);
  const bedrooms = asPositiveInt(facts["bedrooms"]);
  const livingRooms = asNonNegativeInt(facts["livingRooms"]);

  // Strategy 1: communityName + bedrooms + livingRooms
  if (communityName && bedrooms !== null && bedrooms > 0) {
    const roomPart = `${cnDigit(bedrooms)}室`;
    const livingPart = livingRooms !== null && livingRooms > 0 ? `${cnDigit(livingRooms)}厅` : "";
    return `${communityName}${roomPart}${livingPart}出租`;
  }

  // Strategy 2: businessArea + bedrooms
  if (businessArea && bedrooms !== null && bedrooms > 0) {
    return `${businessArea}${cnDigit(bedrooms)}室出租`;
  }

  // Not enough facts — let the user provide a title
  return null;
}

// ============================================================
// Required field detection
// ============================================================

/** Keys checked as required before property creation. */
const REQUIRED_FORM_FIELDS = ["title", "city", "rental_type"] as const;

/** Human-readable labels for required fields. */
const REQUIRED_FIELD_LABELS: Record<string, string> = {
  title: "房源标题",
  city: "城市",
  rental_type: "租赁方式",
};

/**
 * Returns the list of required form field names that are missing or empty.
 *
 * "Empty" means: null, undefined, empty string, or the string "false"
 * (which indicates a boolean false that shouldn't count for string fields).
 */
export function detectMissingRequiredFields(
  formValues: Record<string, unknown>
): string[] {
  const missing: string[] = [];

  for (const key of REQUIRED_FORM_FIELDS) {
    const v = formValues[key];
    if (v === null || v === undefined || v === "" || v === "false") {
      missing.push(key);
    }
  }

  return missing;
}

/**
 * Returns a user-facing error message for a missing required field,
 * or null if the field is not a known required field.
 */
export function getRequiredFieldMessage(fieldName: string): string | null {
  const label = REQUIRED_FIELD_LABELS[fieldName];
  if (!label) return null;
  return `请输入${label}`;
}

/**
 * Returns an AI-specific message when a required field was not extracted,
 * or null if the field is not required or doesn't have a special AI message.
 */
export function getAiMissingFieldMessage(
  fieldName: string,
  aiHadData: boolean
): string | null {
  if (fieldName === "city" && !aiHadData) {
    return "AI未识别到城市，请补充";
  }
  if (!aiHadData) {
    return getRequiredFieldMessage(fieldName);
  }
  return null;
}

// ============================================================
// City ambiguity detection
// ============================================================

/**
 * Returns true when district is present but city is missing —
 * meaning we have a district like "朝阳区" without knowing which
 * city it belongs to. The city MUST NOT be guessed in this case
 * because "朝阳区" exists in multiple cities (e.g. 北京, 长春).
 */
export function isCityAmbiguous(
  district: string | null | undefined,
  city: string | null | undefined
): boolean {
  const hasDistrict =
    district !== null && district !== undefined && district.trim().length > 0;
  const hasCity =
    city !== null && city !== undefined && city.trim().length > 0;
  return hasDistrict && !hasCity;
}

// ============================================================
// Helpers
// ============================================================

function asNonEmptyString(v: unknown): string | null {
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  return null;
}

function asPositiveInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && Number.isInteger(v) && v > 0) return v;
  return null;
}

function asNonNegativeInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && Number.isInteger(v) && v >= 0) return v;
  return null;
}
