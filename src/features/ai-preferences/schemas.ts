// ============================================================
// AI User Preferences — Zod Schemas
// Owner: ai-deepseek-engineer
// Contract: PRD §10.5, implementation-plan.md §P3-AI-013
// ============================================================

import { z } from "zod";

// ============================================================
// Preference types
// ============================================================

export const PreferenceStatusEnum = z.enum(["active", "disabled"]);
export type PreferenceStatus = z.infer<typeof PreferenceStatusEnum>;

export const PreferenceValueSchema = z.object({
  correctionDirection: z.enum(["modified", "added", "removed"]),
  originalPattern: z.string().nullable().optional(),
  preferredPattern: z.string().nullable().optional(),
  hint: z.string(),
});

export const UserPreferenceSchema = z.object({
  id: z.string().uuid(),
  feature: z.enum([
    "ai_data_extraction",
    "semantic_search",
    "property_matching",
    "shared_property_pool",
    "content_factory",
  ]),
  preferenceKey: z.string(),
  preferenceValue: PreferenceValueSchema,
  evidenceCount: z.number().int().min(0),
  confidence: z.number().min(0).max(1),
  status: PreferenceStatusEnum,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type UserPreference = z.infer<typeof UserPreferenceSchema>;

// ============================================================
// API request/response schemas
// ============================================================

export const ListPreferencesResponseSchema = z.object({
  data: z.array(UserPreferenceSchema).nullable(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .nullable(),
});

export const DeletePreferenceResponseSchema = z.object({
  data: z
    .object({
      id: z.string().uuid(),
      deleted: z.boolean(),
    })
    .nullable(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .nullable(),
});

export const TogglePreferenceRequestSchema = z.object({
  status: PreferenceStatusEnum,
}).strict();

export const TogglePreferenceResponseSchema = z.object({
  data: UserPreferenceSchema.nullable(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .nullable(),
});

// ============================================================
// Fact fields that must NEVER be learned
// ============================================================

export const FACT_FIELD_BLOCKLIST = new Set([
  // camelCase (AI output)
  "monthlyRent",
  "rentPrice",
  "area",
  "squareMeters",
  "propertyArea",
  "ownerPhone",
  "ownerWechat",
  "ownerName",
  "clientPhone",
  "clientWechat",
  "clientName",
  "clientIdNumber",
  "exactAddress",
  "buildingNo",
  "unitNo",
  "roomNo",
  "keyLocation",
  "internalNotes",
  // snake_case (DB fields)
  "monthly_rent",
  "rent_price",
  "area_sqm",
  "owner_phone",
  "owner_wechat",
  "owner_name",
  "client_phone",
  "client_wechat",
  "client_name",
  "client_id_number",
  "exact_address",
  "building_no",
  "unit_no",
  "room_no",
  "key_location",
  "internal_notes",
  // Generic
  "price",
  "phone",
  "wechat",
  "address",
  "contact",
]);

/**
 * Check if a field name is a fact field that must not be learned.
 */
export function isFactField(fieldName: string): boolean {
  return FACT_FIELD_BLOCKLIST.has(fieldName);
}

/**
 * Filter fact fields from a list of field names.
 */
export function filterFactFields(fieldNames: string[]): string[] {
  return fieldNames.filter((f) => !isFactField(f));
}
