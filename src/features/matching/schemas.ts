import { z } from "zod";

// ─── Dimension Codes ────────────────────────────────────────────────
// Matches the six scoring dimensions defined in matching-contract.md §3

export const MatchDimensionEnum = z.enum([
  "budget",
  "district",
  "roomType",
  "availability",
  "commute",
  "specialRequirements",
]);

// ─── Match Level ─────────────────────────────────────────────────────
// Matches the database enum: match_level

export const MatchLevelEnum = z.enum(["excellent", "good", "fair", "low"]);

// ─── Match Status ────────────────────────────────────────────────────
// Matches the database enum: match_status (authoritative per ADR-005)

export const MatchStatusEnum = z.enum(["active", "dismissed", "archived"]);

// ─── Matched Reason (contract §4.3) ──────────────────────────────────

export const MatchedReasonSchema = z.object({
  code: MatchDimensionEnum,
  label: z.string(),
  scoreContribution: z.number().int(),
  detail: z.string(),
});

// ─── Unmatched Reason (contract §4.4) ────────────────────────────────

export const UnmatchedReasonSchema = z.object({
  code: z.string(),
  label: z.string(),
  detail: z.string(),
});

// ─── Needs Confirmation (contract §4.5) ──────────────────────────────

export const NeedsConfirmationSchema = z.object({
  code: z.string(),
  label: z.string(),
  detail: z.string(),
});

// ─── Weight Overrides (contract §3.2) ────────────────────────────────

export const WeightOverridesSchema = z
  .object({
    budget: z.number().int().nonnegative().optional(),
    district: z.number().int().nonnegative().optional(),
    roomType: z.number().int().nonnegative().optional(),
    availability: z.number().int().nonnegative().optional(),
    commute: z.number().int().nonnegative().optional(),
    specialRequirements: z.number().int().nonnegative().optional(),
  })
  .refine(
    (_w) => {
      // Weights must be non-negative integers (already enforced by zod).
      // Sum does NOT need to be 100 — contract §3.2 explicitly allows this.
      return true;
    },
    { message: "Weights must be non-negative integers" },
  );

// ─── Calculate Match Input ───────────────────────────────────────────

export const CalculateMatchInputSchema = z.object({
  clientId: z.string().uuid(),
  propertyIds: z.array(z.string().uuid()).optional(),
  weightOverrides: WeightOverridesSchema.optional(),
});

// ─── Match Result (single property) ──────────────────────────────────

export const MatchResultSchema = z.object({
  propertyId: z.string().uuid(),
  score: z.number().int().min(0).max(100),
  matchLevel: MatchLevelEnum,
  matchedReasons: z.array(MatchedReasonSchema),
  unmatchedReasons: z.array(UnmatchedReasonSchema),
  needsConfirmation: z.array(NeedsConfirmationSchema),
  nextAction: z.string(),
});

// ─── Calculate Match Response ────────────────────────────────────────

export const CalculateMatchResponseSchema = z.object({
  matches: z.array(MatchResultSchema),
  totalProperties: z.number().int().nonnegative(),
  matchedCount: z.number().int().nonnegative(),
});

// ─── Inferred Types ──────────────────────────────────────────────────

export type MatchDimension = z.infer<typeof MatchDimensionEnum>;
export type MatchLevel = z.infer<typeof MatchLevelEnum>;
export type MatchStatus = z.infer<typeof MatchStatusEnum>;
export type MatchedReason = z.infer<typeof MatchedReasonSchema>;
export type UnmatchedReason = z.infer<typeof UnmatchedReasonSchema>;
export type NeedsConfirmation = z.infer<typeof NeedsConfirmationSchema>;
export type WeightOverrides = z.infer<typeof WeightOverridesSchema>;
export type CalculateMatchInput = z.infer<typeof CalculateMatchInputSchema>;
export type MatchResult = z.infer<typeof MatchResultSchema>;
export type CalculateMatchResponse = z.infer<typeof CalculateMatchResponseSchema>;
