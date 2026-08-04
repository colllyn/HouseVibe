// ============================================================
// DeepSeek Text Provider — Zod Output Schemas
// Owner: ai-deepseek-engineer
// Contract: docs/contracts/ai-contract.md v2.0 §4, §11
// ============================================================

import { z } from "zod";

// --- Shared sub-schemas ---

const factReferenceSchema = z.object({
  field: z.string(),
  value: z.string(),
});

const visualFactReferenceSchema = z.object({
  mediaId: z.string(),
  claim: z.string(),
});

const riskFlagSchema = z.object({
  field: z.string(),
  severity: z.enum(["high", "medium", "low"]),
  description: z.string(),
});

const complianceFlagSchema = z.object({
  term: z.string(),
  category: z.string(),
  severity: z.enum(["block", "warn"]),
  suggestion: z.string(),
});

const aiUsageSchema = z.object({
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  estimatedCostUsd: z.number().min(0),
});

// --- PropertySearchFilterSchema (property search output) ---
// Contract §4.1, §11.5: strict(), whitelist only, no SQL/code

export const PropertySearchFilterSchema = z
  .object({
    districts: z.array(z.string()).optional(),
    communities: z.array(z.string()).optional(),
    monthlyRentMin: z.number().int().min(0).optional(),
    monthlyRentMax: z.number().int().min(0).optional(),
    bedrooms: z.number().int().min(0).optional(),
    livingRooms: z.number().int().min(0).optional(),
    rentalType: z.enum(["whole_unit", "shared"]).optional(),
    petsAllowed: z.boolean().optional(),
    cookingAllowed: z.boolean().optional(),
    hasElevator: z.boolean().optional(),
    availableBefore: z.string().optional(),
    features: z.array(z.string()).optional(),
    subwayLines: z.array(z.string()).optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
    parsedQuery: z.string(),
    unrecognizedTerms: z.array(z.string()),
  })
  .strict();

export type PropertySearchFiltersOutput = z.infer<
  typeof PropertySearchFilterSchema
>;

// --- PropertyExtractionOutputSchema ---

const redactedPropertyFactsSchema = z.object({
  title: z.string().optional(),
  city: z.string().optional(),
  district: z.string().optional(),
  businessArea: z.string().optional(),
  communityName: z.string().optional(),
  addressText: z.string().optional(),
  rentalType: z.string().optional(),
  monthlyRent: z.number().optional(),
  depositTerms: z.string().optional(),
  bedrooms: z.number().int().min(0).optional(),
  livingRooms: z.number().int().min(0).optional(),
  bathrooms: z.number().int().min(0).optional(),
  areaSqm: z.number().min(0).optional(),
  hasElevator: z.boolean().optional(),
  orientation: z.string().optional(),
  decoration: z.string().optional(),
  availableFrom: z.string().optional(),
  minimumLeaseMonths: z.number().int().min(0).optional(),
  petsAllowed: z.boolean().optional(),
  cookingAllowed: z.boolean().optional(),
  subwayText: z.string().optional(),
  facilities: z.unknown().optional(),
  tags: z.array(z.string()).optional(),
  sellingPoints: z.array(z.string()).optional(),
  drawbacks: z.array(z.string()).optional(),
  description: z.string().optional(),
  visualSummary: z.string().optional(),
});

export const PropertyExtractionOutputSchema = z.object({
  data: redactedPropertyFactsSchema,
  missingFields: z.array(z.string()),
  uncertainFields: z.array(
    z.object({
      field: z.string(),
      reason: z.string(),
    })
  ),
  rawText: z.string(),
  usage: aiUsageSchema,
});

// --- ClientExtractionOutputSchema ---

const redactedClientFactsSchema = z.object({
  name: z.string().optional(),
  sourcePlatform: z.string().optional(),
  budgetMin: z.number().optional(),
  budgetMax: z.number().optional(),
  preferredDistricts: z.array(z.string()).optional(),
  preferredCommunities: z.array(z.string()).optional(),
  bedrooms: z.number().int().min(0).optional(),
  rentalType: z.string().optional(),
  availableFrom: z.string().optional(),
  minimumLeaseMonths: z.number().int().min(0).optional(),
  petsRequired: z.boolean().optional(),
  cookingRequired: z.boolean().optional(),
  commuteDestination: z.string().optional(),
  hardRequirements: z.unknown().optional(),
  softPreferences: z.unknown().optional(),
  dealBreakers: z.array(z.string()).optional(),
});

export const ClientExtractionOutputSchema = z.object({
  data: redactedClientFactsSchema,
  missingFields: z.array(z.string()),
  uncertainFields: z.array(
    z.object({
      field: z.string(),
      reason: z.string(),
    })
  ),
  rawText: z.string(),
  usage: aiUsageSchema,
});

// --- ContentGenerationOutputSchema ---

const imageSequenceItemSchema = z.object({
  order: z.number().int().min(0),
  description: z.string(),
  suggestedMediaType: z.string(),
});

const shotItemSchema = z.object({
  order: z.number().int().min(0),
  durationSeconds: z.number().min(0),
  description: z.string(),
  visualSuggestion: z.string(),
});

const xiaohongshuOutputSchema = z.object({
  titleOptions: z.array(z.string()),
  coverText: z.string(),
  hook: z.string(),
  body: z.string(),
  imageSequence: z.array(imageSequenceItemSchema),
  imageCaptions: z.array(z.string()),
  factualSummary: z.string(),
  drawbacks: z.string().optional(),
  interactionQuestion: z.string(),
  privateMessageKeyword: z.string(),
  hashtags: z.array(z.string()),
  factsUsed: z.array(factReferenceSchema),
  visualFactsUsed: z.array(visualFactReferenceSchema),
  missingInformation: z.array(z.string()),
  riskFlags: z.array(riskFlagSchema),
  complianceFlags: z.array(complianceFlagSchema),
  requiresFactReview: z.boolean(),
});

const douyinOutputSchema = z.object({
  hookOptions: z.array(z.string()),
  coverText: z.string(),
  fullVoiceover: z.string(),
  shots: z.array(shotItemSchema),
  subtitles: z.string(),
  caption: z.string(),
  commentCta: z.string(),
  privateMessageKeyword: z.string(),
  hashtags: z.array(z.string()),
  missingShots: z.array(z.string()),
  factsUsed: z.array(factReferenceSchema),
  visualFactsUsed: z.array(visualFactReferenceSchema),
  missingInformation: z.array(z.string()),
  riskFlags: z.array(riskFlagSchema),
  complianceFlags: z.array(complianceFlagSchema),
  requiresFactReview: z.boolean(),
});

const wechatMomentsOutputSchema = z.object({
  copyOptions: z.array(z.string()),
  nineGridSuggestion: z.string(),
  shortCta: z.string(),
  privateMessageKeyword: z.string(),
  factsUsed: z.array(factReferenceSchema),
  visualFactsUsed: z.array(visualFactReferenceSchema),
  riskFlags: z.array(riskFlagSchema),
  complianceFlags: z.array(complianceFlagSchema),
  requiresFactReview: z.boolean(),
});

export const ContentGenerationOutputSchema = z.discriminatedUnion(
  "platform",
  [
    xiaohongshuOutputSchema.extend({ platform: z.literal("xiaohongshu") }),
    douyinOutputSchema.extend({ platform: z.literal("douyin") }),
    wechatMomentsOutputSchema.extend({
      platform: z.literal("wechat_moments"),
    }),
  ]
);

// --- Schema name constants (per contract §4.1) ---

export const SCHEMA_NAMES = {
  extractProperty: "PropertyExtractionOutputSchema",
  extractClient: "ClientExtractionOutputSchema",
  parsePropertySearch: "PropertySearchFilterSchema",
  generateContent: "ContentGenerationOutputSchema",
} as const;
