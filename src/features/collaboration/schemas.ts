import { z } from "zod";

// --- Collaboration Request Status Enum ---

export const CollaborationRequestStatusEnum = z.enum([
  "pending",
  "accepted",
  "rejected",
  "cancelled",
  "completed",
]);

export type CollaborationRequestStatus = z.infer<typeof CollaborationRequestStatusEnum>;

// --- Share Property Input Schema ---

export const SharePropertyInputSchema = z.object({
  sharedExpiresAt: z.string().optional(),
  allowMarketingReuse: z.boolean().default(false),
  commissionSplit: z.string().max(200, "佣金分成最多 200 字").optional(),
});

export type SharePropertyInput = z.infer<typeof SharePropertyInputSchema>;

// --- Contact Shared Property Input Schema ---

export const ContactSharedPropertyInputSchema = z.object({
  message: z.string().min(1, "留言不能为空").max(500, "留言最多 500 字"),
});

export type ContactSharedPropertyInput = z.infer<typeof ContactSharedPropertyInputSchema>;

// --- Shared Property Query Schema ---
// Same filters + pagination as PropertyQuerySchema, but used for cross-workspace browsing

// Helper: react-hook-form passes "" for empty boolean inputs.
const boolTruthy = new Set([true, "true", "on", "1"]);
const boolFalsy = new Set([false, "false", "off", "0"]);

function optionalBoolean() {
  return z.preprocess(
    (v) => {
      if (v === "" || v === undefined || v === null) return undefined;
      if (boolTruthy.has(v as string | boolean)) return true;
      if (boolFalsy.has(v as string | boolean)) return false;
      return v;
    },
    z.boolean().optional()
  ) as z.ZodEffects<z.ZodOptional<z.ZodBoolean>>;
}

export const SharedPropertySortByEnum = z.enum([
  "updated_at",
  "monthly_rent_asc",
  "monthly_rent_desc",
  "available_from",
]);

export type SharedPropertySortBy = z.infer<typeof SharedPropertySortByEnum>;

export const SharedPropertyQuerySchema = z.object({
  // Filters
  district: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe("Single or multiple districts via repeated URL params"),
  city: z.string().optional(),
  businessArea: z.string().optional(),
  communityName: z.string().optional(),
  rentalType: z.enum(["whole_unit", "shared"]).optional(),
  bedrooms: z.coerce.number().int().min(0).max(20).optional(),
  minRent: z.coerce.number().int().min(0).optional(),
  maxRent: z.coerce.number().int().min(0).optional(),
  minArea: z.coerce.number().positive().optional(),
  maxArea: z.coerce.number().positive().optional(),
  petsAllowed: optionalBoolean(),
  cookingAllowed: optionalBoolean(),
  hasElevator: optionalBoolean(),
  availableBefore: z.string().optional(),
  availableAfter: z.string().optional(),
  subwayText: z.string().optional(),
  search: z.string().min(1).max(200).optional(),

  // Pagination
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),

  // Sort
  sortBy: SharedPropertySortByEnum.default("updated_at"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
}).refine(
  (d) => d.minRent == null || d.maxRent == null || d.minRent <= d.maxRent,
  { message: "minRent 不能大于 maxRent", path: ["minRent"] }
).refine(
  (d) => d.minArea == null || d.maxArea == null || d.minArea <= d.maxArea,
  { message: "minArea 不能大于 maxArea", path: ["minArea"] }
);

export type SharedPropertyQuery = z.infer<typeof SharedPropertyQuerySchema>;

// --- Desensitized Shared Property Column Whitelist ---
// Never includes: owner_name, owner_phone, owner_wechat (in property_private_details),
// exact_address (in property_private_details), building_no, unit_no, room_no,
// internal_notes (in property_private_details), key_location (in property_private_details),
// raw_input_text.

export const SHARED_PROPERTY_COLS = [
  "id",
  "workspace_id",
  "created_by",
  "title",
  "city",
  "district",
  "business_area",
  "community_name",
  "address_text",
  "rental_type",
  "monthly_rent",
  "deposit_terms",
  "bedrooms",
  "living_rooms",
  "bathrooms",
  "area_sqm",
  "floor",
  "total_floors",
  "has_elevator",
  "orientation",
  "decoration",
  "available_from",
  "minimum_lease_months",
  "pets_allowed",
  "cooking_allowed",
  "subway_text",
  "facilities",
  "tags",
  "selling_points",
  "drawbacks",
  "description",
  "visual_summary",
  "visual_fact_flags",
  "status",
  "is_shared",
  "allow_marketing_reuse",
  "marketing_reuse_granted_at",
  "shared_at",
  "shared_expires_at",
  "commission_split",
  "source_type",
  "created_at",
  "updated_at",
  "deleted_at",
].join(",");

// --- Accept/Reject Collaboration Request Schema ---

export const RespondCollaborationRequestSchema = z.object({
  action: z.enum(["accept", "reject"]),
});

export type RespondCollaborationRequestInput = z.infer<typeof RespondCollaborationRequestSchema>;
