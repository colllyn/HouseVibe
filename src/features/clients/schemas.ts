import { z } from "zod";

// --- Client Stage Enum ---

export const ClientStageEnum = z.enum([
  "new",
  "qualified",
  "properties_sent",
  "viewing_scheduled",
  "viewed",
  "considering",
  "closed_won",
  "paused",
  "lost",
  "deleted",
]);

export type ClientStage = z.infer<typeof ClientStageEnum>;

// --- Create Schema ---

export const CreateClientInputSchema = z.object({
  name: z.string().min(1, "姓名不能为空").max(100, "姓名最多 100 字"),
  phone: z.string().optional(),
  wechat: z.string().optional(),
  source_platform: z.string().optional(),
  budget_min: z.coerce.number().int().positive("预算下限必须大于 0").optional(),
  budget_max: z.coerce.number().int().positive("预算上限必须大于 0").optional(),
  preferred_districts: z.string().optional(), // comma-separated
  preferred_communities: z.string().optional(), // comma-separated
  bedrooms: z.coerce.number().int().min(0).max(20).optional(),
  rental_type: z.string().optional(),
  available_from: z.string().optional(),
  minimum_lease_months: z.coerce.number().int().positive().optional(),
  pets_required: z.coerce.boolean().optional(),
  cooking_required: z.coerce.boolean().optional(),
  commute_destination: z.string().optional(),
  hard_requirements: z.string().optional(), // JSON string
  soft_preferences: z.string().optional(), // JSON string
  deal_breakers: z.string().optional(), // comma-separated
  stage: ClientStageEnum.optional(),
  raw_input_text: z.string().optional(),
  next_follow_up_at: z.string().optional(),
});

export type CreateClientInput = z.infer<typeof CreateClientInputSchema>;

// --- Update Schema ---

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
      return v;
    },
    z.boolean().optional()
  ) as z.ZodEffects<z.ZodOptional<z.ZodBoolean>>;
}

export const UpdateClientInputSchema = z.object({
  name: z.string().min(1, "姓名不能为空").max(100, "姓名最多 100 字").optional(),
  phone: z.string().optional(),
  wechat: z.string().optional(),
  source_platform: z.string().optional(),
  budget_min: optionalNumber(z.coerce.number().int().positive("预算下限必须大于 0")),
  budget_max: optionalNumber(z.coerce.number().int().positive("预算上限必须大于 0")),
  preferred_districts: z.string().optional(),
  preferred_communities: z.string().optional(),
  bedrooms: optionalNumber(z.coerce.number().int().min(0).max(20)),
  rental_type: z.string().optional(),
  available_from: z.string().optional(),
  minimum_lease_months: optionalNumber(z.coerce.number().int().positive()),
  pets_required: optionalBoolean(),
  cooking_required: optionalBoolean(),
  commute_destination: z.string().optional(),
  hard_requirements: z.string().optional(),
  soft_preferences: z.string().optional(),
  deal_breakers: z.string().optional(),
  stage: ClientStageEnum.optional(),
  raw_input_text: z.string().optional(),
  next_follow_up_at: z.string().optional(),
}).refine(
  (d) => d.budget_min == null || d.budget_max == null || d.budget_min <= d.budget_max,
  { message: "预算下限不能大于预算上限", path: ["budget_min"] }
);

export type UpdateClientInput = z.infer<typeof UpdateClientInputSchema>;

// --- Query Schema ---

export const ClientSortByEnum = z.enum([
  "updated_at",
  "created_at",
  "next_follow_up_at",
  "last_interaction_at",
  "budget_min",
  "budget_max",
]);

export type ClientSortBy = z.infer<typeof ClientSortByEnum>;

export const ClientQuerySchema = z.object({
  stage: ClientStageEnum.optional(),
  search: z.string().min(1).max(200).optional(),
  hasFollowUp: optionalBoolean(),
  rentalType: z.string().optional(),
  bedrooms: z.coerce.number().int().min(0).max(20).optional(),
  minBudget: z.coerce.number().int().min(0).optional(),
  maxBudget: z.coerce.number().int().min(0).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: ClientSortByEnum.default("updated_at"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
}).refine(
  (d) => d.minBudget == null || d.maxBudget == null || d.minBudget <= d.maxBudget,
  { message: "minBudget 不能大于 maxBudget", path: ["minBudget"] }
);

export type ClientQuery = z.infer<typeof ClientQuerySchema>;
