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
