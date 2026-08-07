// ============================================================
// AI Runtime Config — Zod Schemas
// Owner: ai-deepseek-engineer
// Contract: P3-AI-016
// ============================================================

import { z } from "zod";

// ============================================================
// Enums
// ============================================================

export const ModelModeEnum = z.enum(["auto", "primary", "fallback"]);
export type ModelMode = z.infer<typeof ModelModeEnum>;

export const CapabilityEnum = z.enum(["text", "vision"]);
export type Capability = z.infer<typeof CapabilityEnum>;

// ============================================================
// Runtime config
// ============================================================

export const RuntimeConfigSchema = z.object({
  capability: CapabilityEnum,
  mode: ModelModeEnum,
  circuitOpen: z.boolean(),
  consecutiveFailures: z.number().int().min(0),
  firstFailureAt: z.string().nullable(),
  lastFailureAt: z.string().nullable(),
  lastHealthCheckAt: z.string().nullable(),
  lastHealthCheckOk: z.boolean().nullable(),
  forcedBy: z.string().uuid().nullable(),
  forcedAt: z.string().nullable(),
});

export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

// ============================================================
// API schemas
// ============================================================

export const ForceModelModeRequestSchema = z.object({
  capability: CapabilityEnum,
  mode: ModelModeEnum,
}).strict();

export type ForceModelModeRequest = z.infer<typeof ForceModelModeRequestSchema>;

// ============================================================
// Circuit reset schema — P3-AI-015
// ============================================================

export const ResetCircuitRequestSchema = z.object({
  capability: CapabilityEnum,
}).strict();

export type ResetCircuitRequest = z.infer<typeof ResetCircuitRequestSchema>;

export const CircuitStateSchema = z.object({
  success: z.boolean(),
  circuitOpen: z.boolean().optional(),
  mode: ModelModeEnum.optional(),
  consecutiveFailures: z.number().int().min(0).optional(),
  reason: z.string().optional(),
});
