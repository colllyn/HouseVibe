/**
 * AI extraction → client form mapping utilities.
 *
 * Pure functions: no React, no Supabase, no side effects.
 * Handles all type conversions explicitly — never
 * form.reset(aiResult) or Object.assign.
 *
 * Maps RedactedClientFacts (camelCase, from AI provider)
 * → CreateClientInput form field values (snake_case, matching HTML form).
 *
 * Contract: only fields present in ALL THREE of
 *   RedactedClientFacts ∩ CreateClientInputSchema ∩ form <input> elements
 * are included in the mapping.
 */

// ============================================================
// Extraction key (camelCase) → form field name (snake_case)
// ============================================================

const EXTRACTION_TO_FORM_NAME: Record<string, string> = {
  name: "name",
  budgetMin: "budget_min",
  budgetMax: "budget_max",
  preferredDistricts: "preferred_districts",
  preferredCommunities: "preferred_communities",
  bedrooms: "bedrooms",
  rentalType: "rental_type",
  availableFrom: "available_from",
  minimumLeaseMonths: "minimum_lease_months",
  petsRequired: "pets_required",
  cookingRequired: "cooking_required",
  commuteDestination: "commute_destination",
  hardRequirements: "hard_requirements",
  softPreferences: "soft_preferences",
  dealBreakers: "deal_breakers",
};

/**
 * Explicit, field-by-field mapper from AI extraction facts
 * (camelCase keys from RedactedClientFacts) to HTML form field values
 * (snake_case keys matching CreateClientInputSchema + form inputs).
 *
 * Rules:
 * - Only keys present in EXTRACTION_TO_FORM_NAME are mapped.
 *   Unknown AI fields are silently ignored.
 * - Numbers are preserved as numbers (for number inputs and Zod coerce).
 * - Booleans are preserved as booleans (for checkbox .checked assignment).
 * - Arrays are joined with "," (matching comma-separated string format used
 *   by preferred_districts, preferred_communities, deal_breakers form inputs).
 * - hardRequirements / softPreferences (unknown type) are serialized to
 *   JSON string if they are arrays/objects, or passed through as string.
 * - null / undefined / empty string / empty array values are skipped.
 */
export function mapExtractionToFormValues(
  facts: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [extractionKey, formName] of Object.entries(
    EXTRACTION_TO_FORM_NAME
  )) {
    const raw = facts[extractionKey];

    // Skip missing values — don't overwrite existing form content
    if (raw === null || raw === undefined) continue;
    if (typeof raw === "string" && raw.trim() === "") continue;
    if (Array.isArray(raw) && raw.length === 0) continue;

    if (typeof raw === "boolean") {
      result[formName] = raw;
    } else if (typeof raw === "number") {
      result[formName] = raw;
    } else if (
      extractionKey === "hardRequirements" ||
      extractionKey === "softPreferences"
    ) {
      // These are JSON fields — serialize objects/arrays, pass strings through
      if (typeof raw === "object") {
        result[formName] = JSON.stringify(raw);
      } else {
        result[formName] = String(raw);
      }
    } else if (Array.isArray(raw)) {
      // Join arrays for comma-separated form inputs
      // (preferredDistricts, preferredCommunities, dealBreakers)
      result[formName] = raw.join(",");
    } else {
      result[formName] = String(raw);
    }
  }

  return result;
}

// ============================================================
// Required field detection
// ============================================================

/** Keys checked as required before client creation.
 *  Only `name` is required in CreateClientInputSchema. */
const REQUIRED_FORM_FIELDS = ["name"] as const;

/** Human-readable labels for required fields. */
const REQUIRED_FIELD_LABELS: Record<string, string> = {
  name: "客户姓名",
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
  return `${label}不能为空`;
}

/**
 * Returns an AI-specific message when a required field was not extracted,
 * or null if the field is not required or doesn't have a special AI message.
 */
export function getAiMissingFieldMessage(
  fieldName: string,
  aiHadData: boolean
): string | null {
  if (fieldName === "name" && !aiHadData) {
    return "AI未识别到客户姓名，请补充";
  }
  if (!aiHadData) {
    return getRequiredFieldMessage(fieldName);
  }
  return null;
}

// ============================================================
// Type conversion helpers (used by Confirmation Card editing)
// ============================================================

/**
 * Convert a Confirmation Card edit value back to the target type
 * based on the original AI extraction value's type.
 *
 * This prevents boolean → string type drift when users edit
 * boolean fields in the confirmation card (e.g. "是"/"否" → true/false).
 */
export function coerceEditValue(
  originalValue: unknown,
  editString: string
): unknown {
  if (typeof originalValue === "boolean") {
    return (
      editString === "是" ||
      editString === "true" ||
      editString === "1" ||
      editString === "yes"
    );
  }

  if (typeof originalValue === "number") {
    const n = Number(editString);
    return Number.isFinite(n) ? n : originalValue;
  }

  if (Array.isArray(originalValue)) {
    return editString
      .split(/[,，、]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return editString;
}

// ============================================================
// Field definitions for AI Confirmation Card
// ============================================================

export interface ClientFieldDef {
  key: string;
  label: string;
  /** The extraction key in RedactedClientFacts (camelCase) */
  extractionKey: string;
}

export const CLIENT_EXTRACTION_FIELD_DEFS: ClientFieldDef[] = [
  { key: "name", label: "客户姓名", extractionKey: "name" },
  {
    key: "budget_min",
    label: "预算下限",
    extractionKey: "budgetMin",
  },
  {
    key: "budget_max",
    label: "预算上限",
    extractionKey: "budgetMax",
  },
  {
    key: "preferred_districts",
    label: "意向区域",
    extractionKey: "preferredDistricts",
  },
  {
    key: "preferred_communities",
    label: "意向小区",
    extractionKey: "preferredCommunities",
  },
  { key: "bedrooms", label: "户型需求", extractionKey: "bedrooms" },
  {
    key: "rental_type",
    label: "租赁方式",
    extractionKey: "rentalType",
  },
  {
    key: "available_from",
    label: "最早入住",
    extractionKey: "availableFrom",
  },
  {
    key: "minimum_lease_months",
    label: "最短租期",
    extractionKey: "minimumLeaseMonths",
  },
  {
    key: "pets_required",
    label: "需要养宠物",
    extractionKey: "petsRequired",
  },
  {
    key: "cooking_required",
    label: "需要做饭",
    extractionKey: "cookingRequired",
  },
  {
    key: "commute_destination",
    label: "通勤目的地",
    extractionKey: "commuteDestination",
  },
  {
    key: "hard_requirements",
    label: "硬性要求",
    extractionKey: "hardRequirements",
  },
  {
    key: "soft_preferences",
    label: "软性偏好",
    extractionKey: "softPreferences",
  },
  {
    key: "deal_breakers",
    label: "拒绝条件",
    extractionKey: "dealBreakers",
  },
];

/** Keys that must never appear in confirmation cards (client PII). */
export const CLIENT_SENSITIVE_KEYS = new Set<string>([
  "phone", // client phone number
  "wechat", // client WeChat ID
]);
