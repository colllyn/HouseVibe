import { z } from "zod";

// --- Enums (match domain model + migration) ---

export const PropertyStatusEnum = z.enum([
  "draft",
  "available",
  "reserved",
  "rented",
  "offline",
  "expired",
  "deleted",
]);

export type PropertyStatus = z.infer<typeof PropertyStatusEnum>;

// --- Create Schema (matches docs/contracts/domain-model.md §2.4 + §2.5) ---

export const CreatePropertyInputSchema = z.object({
  // Required
  title: z.string().min(1, "标题不能为空").max(200, "标题最多 200 字"),
  city: z.string().min(1, "城市不能为空"),
  rental_type: z.string().min(1, "租赁方式不能为空"),

  // Optional - location
  district: z.string().optional(),
  business_area: z.string().optional(),
  community_name: z.string().optional(),
  address_text: z.string().optional(),

  // Optional - sensitive location (not in shared views)
  building_no: z.string().optional(),
  unit_no: z.string().optional(),
  room_no: z.string().optional(),

  // Optional - rent & specs
  monthly_rent: z.coerce.number().int().positive("月租必须大于 0").optional(),
  deposit_terms: z.string().optional(),
  bedrooms: z.coerce.number().int().min(0).max(20).optional(),
  living_rooms: z.coerce.number().int().min(0).max(10).optional(),
  bathrooms: z.coerce.number().int().min(0).max(10).optional(),
  area_sqm: z.coerce.number().positive("面积必须大于 0").optional(),
  floor: z.coerce.number().int().optional(),
  total_floors: z.coerce.number().int().optional(),
  minimum_lease_months: z.coerce.number().int().positive().optional(),

  // Optional - features
  orientation: z.string().optional(),
  decoration: z.string().optional(),
  available_from: z.string().optional(), // ISO date string
  has_elevator: z.coerce.boolean().optional(),
  pets_allowed: z.coerce.boolean().optional(),
  cooking_allowed: z.coerce.boolean().optional(),
  subway_text: z.string().optional(),

  // Optional - arrays
  tags: z.string().optional(), // comma-separated, converted to TEXT[]
  selling_points: z.string().optional(), // comma-separated, converted to TEXT[]
  drawbacks: z.string().optional(), // comma-separated, converted to TEXT[]

  // Optional - long text
  description: z.string().max(5000, "描述最多 5000 字").optional(),

  // Optional - source
  source_type: z.string().optional(),

  // --- Private details (property_private_details, §2.5) ---
  owner_name: z.string().optional(),
  owner_phone: z.string().optional(),
  owner_wechat: z.string().optional(),
  exact_address: z.string().optional(),
  key_location: z.string().optional(),
  internal_notes: z.string().optional(),
});

export type CreatePropertyInput = z.infer<typeof CreatePropertyInputSchema>;

// --- Update Schema (all fields optional + status/shared fields) ---

// Helper: react-hook-form passes "" for empty number/boolean inputs.
// z.coerce.number() turns "" into 0, which fails .positive() etc.
// z.coerce.boolean() uses Boolean() which treats "false" as true.
// Preprocess empty strings → undefined so optional() accepts them.
// Use proper boolean string mapping for "true"/"false"/"on"/"off".

function optionalNumber<T extends z.ZodNumber>(schema: T) {
  return z.preprocess((v) => (v === "" ? undefined : v), schema.optional()) as z.ZodEffects<z.ZodOptional<T>>;
}

const boolTruthy = new Set([true, "true", "on", "1"]);
const boolFalsy = new Set([false, "false", "off", "0"]);

function optionalBoolean() {
  return z.preprocess(
    (v) => {
      if (v === "" || v === undefined || v === null) return undefined;
      if (boolTruthy.has(v as string | boolean)) return true;
      if (boolFalsy.has(v as string | boolean)) return false;
      return v; // let z.boolean() reject it
    },
    z.boolean().optional()
  ) as z.ZodEffects<z.ZodOptional<z.ZodBoolean>>;
}

export const UpdatePropertyInputSchema = z.object({
  // Basic fields (all optional for PATCH)
  title: z.string().min(1).max(200).optional(),
  city: z.string().min(1).optional(),
  rental_type: z.string().optional(),

  // Location
  district: z.string().optional(),
  business_area: z.string().optional(),
  community_name: z.string().optional(),
  address_text: z.string().optional(),

  // Sensitive location
  building_no: z.string().optional(),
  unit_no: z.string().optional(),
  room_no: z.string().optional(),

  // Rent & specs — use optionalNumber to handle empty inputs
  monthly_rent: optionalNumber(z.coerce.number().int().positive()),
  deposit_terms: z.string().optional(),
  bedrooms: optionalNumber(z.coerce.number().int().min(0).max(20)),
  living_rooms: optionalNumber(z.coerce.number().int().min(0).max(10)),
  bathrooms: optionalNumber(z.coerce.number().int().min(0).max(10)),
  area_sqm: optionalNumber(z.coerce.number().positive()),
  floor: optionalNumber(z.coerce.number().int()),
  total_floors: optionalNumber(z.coerce.number().int()),
  minimum_lease_months: optionalNumber(z.coerce.number().int().positive()),

  // Features
  orientation: z.string().optional(),
  decoration: z.string().optional(),
  available_from: z.string().optional(),
  has_elevator: optionalBoolean(),
  pets_allowed: optionalBoolean(),
  cooking_allowed: optionalBoolean(),
  subway_text: z.string().optional(),

  // Arrays
  tags: z.string().optional(),
  selling_points: z.string().optional(),
  drawbacks: z.string().optional(),

  // Long text
  description: z.string().max(5000).optional(),

  // Status & sharing (P2-PROP-001 scope)
  status: PropertyStatusEnum.optional(),
  is_shared: optionalBoolean(),
  allow_marketing_reuse: optionalBoolean(),
  shared_expires_at: z.string().optional(),
  commission_split: z.string().optional(),

  // Private details
  owner_name: z.string().optional(),
  owner_phone: z.string().optional(),
  owner_wechat: z.string().optional(),
  exact_address: z.string().optional(),
  key_location: z.string().optional(),
  internal_notes: z.string().optional(),
});

export type UpdatePropertyInput = z.infer<typeof UpdatePropertyInputSchema>;

// --- Query / Filter Schema (§7.4) ---
// P2-PROP-002 scope: 15 executable filters + 4 executable sorts.
// Deferred (Phase 3 content_factory): hasContent, last_content_at, last_published_at

export const PropertySortByEnum = z.enum([
  "updated_at",
  "monthly_rent_asc",
  "monthly_rent_desc",
  "available_from",
]);

export type PropertySortBy = z.infer<typeof PropertySortByEnum>;

export const PropertyQuerySchema = z.object({
  // Filters
  status: PropertyStatusEnum.optional(),
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
  isShared: optionalBoolean(),
  subwayText: z.string().optional(),
  search: z.string().min(1).max(200).optional(),

  // Pagination
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),

  // Sort
  sortBy: PropertySortByEnum.default("updated_at"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
}).refine(
  (d) => d.minRent == null || d.maxRent == null || d.minRent <= d.maxRent,
  { message: "minRent 不能大于 maxRent", path: ["minRent"] }
).refine(
  (d) => d.minArea == null || d.maxArea == null || d.minArea <= d.maxArea,
  { message: "minArea 不能大于 maxArea", path: ["minArea"] }
);

export type PropertyQuery = z.infer<typeof PropertyQuerySchema>;

// --- Media Schemas (P2-PROP-003) ---

export const ALLOWED_MEDIA_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const MAX_MEDIA_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
export const MAX_MEDIA_PER_PROPERTY = 20;
export const MAX_FILES_PER_UPLOAD = 5;

export const UpdateMediaInputSchema = z.object({
  isCover: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  sceneTag: z.string().max(50, "场景标签最多 50 字").optional(),
});
export type UpdateMediaInput = z.infer<typeof UpdateMediaInputSchema>;

// --- Client Schemas (P2-CLIENT-001) ---

export const ClientStageEnum = z.enum([
  "new", "qualified", "properties_sent", "viewing_scheduled",
  "viewed", "considering", "closed_won", "paused", "lost", "deleted",
]);
export type ClientStage = z.infer<typeof ClientStageEnum>;

export const CreateClientInputSchema = z.object({
  name: z.string().min(1, "姓名不能为空").max(100),
  phone: z.string().optional(),
  wechat: z.string().optional(),
  source_platform: z.string().optional(),
  budget_min: z.coerce.number().int().positive().optional(),
  budget_max: z.coerce.number().int().positive().optional(),
  preferred_districts: z.string().optional(), // comma-separated, converted to TEXT[]
  preferred_communities: z.string().optional(),
  bedrooms: z.coerce.number().int().min(0).max(20).optional(),
  rental_type: z.string().optional(),
  available_from: z.string().optional(),
  minimum_lease_months: z.coerce.number().int().positive().optional(),
  pets_required: z.coerce.boolean().optional(),
  cooking_required: z.coerce.boolean().optional(),
  commute_destination: z.string().optional(),
  stage: ClientStageEnum.optional(),
  next_follow_up_at: z.string().optional(),
});

export const UpdateClientInputSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  phone: z.string().optional(),
  wechat: z.string().optional(),
  source_platform: z.string().optional(),
  budget_min: z.coerce.number().int().positive().optional(),
  budget_max: z.coerce.number().int().positive().optional(),
  preferred_districts: z.string().optional(),
  preferred_communities: z.string().optional(),
  bedrooms: z.coerce.number().int().min(0).max(20).optional(),
  rental_type: z.string().optional(),
  available_from: z.string().optional(),
  minimum_lease_months: z.coerce.number().int().positive().optional(),
  pets_required: z.coerce.boolean().optional(),
  cooking_required: z.coerce.boolean().optional(),
  commute_destination: z.string().optional(),
  stage: ClientStageEnum.optional(),
  next_follow_up_at: z.string().optional(),
});

// --- Semantic Search Schemas (P2-MATCH-002) ---

/**
 * Input schema for the semantic search NL query.
 * Frozen per docs/contracts/property-semantic-search-ui-contract.md §5.
 */
export const SearchParseInputSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1, "请输入搜索内容")
    .max(500, "搜索内容最多 500 字")
    .refine(
      (v) => !/^[\s\p{P}\p{S}]+$/u.test(v),
      "搜索内容不能仅为标点或特殊字符"
    ),
  requestId: z.string().uuid(),
});
export type SearchParseInput = z.infer<typeof SearchParseInputSchema>;

/**
 * Structured filters returned by the Phase 3 AI parser.
 * Fields map to PropertyQuerySchema fields (contract §6.5).
 */
export const SearchParseFiltersSchema = z.object({
  districts: z.array(z.string()).optional(),
  communities: z.array(z.string()).optional(),
  communityName: z.string().optional(),
  monthlyRentMin: z.number().int().positive().optional(),
  monthlyRentMax: z.number().int().positive().optional(),
  bedrooms: z.number().int().min(0).max(20).optional(),
  livingRooms: z.number().int().min(0).max(10).optional(),
  rentalType: z.enum(["whole_unit", "shared"]).optional(),
  petsAllowed: z.boolean().optional(),
  cookingAllowed: z.boolean().optional(),
  hasElevator: z.boolean().optional(),
  availableBefore: z.string().optional(),
  features: z.array(z.string()).optional(),
  subwayText: z.string().optional(),
  sortBy: PropertySortByEnum.optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  // AI provider metadata — passed through by route, used for UI display only
  parsedQuery: z.string().optional(),
  unrecognizedTerms: z.array(z.string()).optional(),
});
export type SearchParseFilters = z.infer<typeof SearchParseFiltersSchema>;

/**
 * Standard API response envelope for POST /api/ai/parse-property-search.
 *
 * Route returns: { data: { filters }, error: null }
 *   where filters is the validated PropertySearchFilters from the AI provider.
 *
 * Any 200 response that does NOT match this envelope is treated as invalid
 * (no URL update, no fallback to text search).
 */
// Success envelope: { data: { filters }, error: null }
const SearchParseSuccessSchema = z.object({
  data: z.object({
    filters: SearchParseFiltersSchema,
  }),
  error: z.null(),
});

// Error envelope: { data: null?, error: { code, message } }
const SearchParseErrorSchema = z.object({
  data: z.null().optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
});

export const SearchParseResponseSchema = z.union([
  SearchParseSuccessSchema,
  SearchParseErrorSchema,
]);
export type SearchParseResponse = z.infer<typeof SearchParseResponseSchema>;

/** State machine phases for the semantic search UI. */
export type SemanticSearchPhase =
  | "idle"
  | "validating"
  | "requesting"
  | "structured"
  | "fallback_text"
  | "fallback_error"
  | "error_auth"
  | "error_forbidden"
  | "error_validation";
