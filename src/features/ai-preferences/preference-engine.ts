// ============================================================
// AI Preference Learning Engine
// Owner: ai-deepseek-engineer
// Contract: PRD §10.5, implementation-plan.md §P3-AI-013
//
// Core logic:
// 1. Analyze ai_correction_logs for correction patterns
// 2. When same field changed same way ≥ AI_PREFERENCE_MIN_EVIDENCE → learn preference
// 3. Generate Prompt Hints for injection into DeepSeek requests
// 4. Block learning of fact fields (price, area, contacts, address)
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/config/env";
import { isFactField } from "./schemas";
import type { UserPreference } from "./schemas";

// ============================================================
// Types
// ============================================================

export interface PreferencePromptHint {
  /** The hint text to inject into the system prompt */
  hint: string;
  /** Confidence score 0.0–1.0 */
  confidence: number;
  /** Feature this hint applies to */
  feature: string;
  /** Preference key for debugging */
  preferenceKey: string;
}

export interface LearnPreferencesResult {
  success: boolean;
  learnedCount: number;
  error?: string;
}

// ============================================================
// Preference learning
// ============================================================

/**
 * Trigger preference learning for a user by analyzing their correction logs.
 * Should be called after new correction records are created.
 *
 * Uses the DB-level learn_preferences RPC which:
 * - Groups corrections by field + change direction
 * - Filters out fact fields at the DB level
 * - Upserts preferences when evidence threshold is met
 */
export async function learnPreferences(
  client: SupabaseClient,
  userId: string,
): Promise<LearnPreferencesResult> {
  const env = getServerEnv();
  const minEvidence = env.AI_PREFERENCE_MIN_EVIDENCE;

  const { data, error } = await client.rpc("learn_preferences", {
    p_user_id: userId,
    p_min_evidence: minEvidence,
  });

  if (error) {
    return { success: false, learnedCount: 0, error: error.message };
  }

  const result = data as Record<string, unknown>;
  return {
    success: result?.success === true,
    learnedCount: (result?.learned_count as number) ?? 0,
  };
}

// ============================================================
// Prompt hint generation
// ============================================================

/**
 * Get active preferences for a user as prompt hints.
 * Called before AI requests to inject user preferences into prompts.
 *
 * Only returns preferences that are:
 * - Status = 'active'
 * - Not fact fields (defense-in-depth; DB also filters)
 * - Confidence ≥ 0.3 (low-confidence preferences are noisy)
 */
export async function getPromptHints(
  client: SupabaseClient,
  userId: string,
): Promise<PreferencePromptHint[]> {
  const { data, error } = await client.rpc("get_active_preferences", {
    p_user_id: userId,
  });

  if (error || !data) return [];

  const result = data as Record<string, unknown>;
  const preferences = (result?.preferences as Array<Record<string, unknown>>) ?? [];

  return preferences
    .filter((p) => {
      // Defense-in-depth: filter fact fields even though DB already does
      const key = String(p.preferenceKey ?? "");
      // Extract field name from key format: "fieldName_changeType"
      const fieldName = key.replace(/_(modified|added|removed)$/, "");
      if (isFactField(fieldName)) return false;

      // Filter low-confidence
      const confidence = Number(p.confidence ?? 0);
      return confidence >= 0.3;
    })
    .map((p) => {
      const prefValue = (p.preferenceValue as Record<string, unknown>) ?? {};
      return {
        hint: String(prefValue.hint ?? ""),
        confidence: Number(p.confidence ?? 0),
        feature: String(p.feature ?? ""),
        preferenceKey: String(p.preferenceKey ?? ""),
      };
    });
}

// ============================================================
// Prompt hint formatting
// ============================================================

/**
 * Format prompt hints into a string for injection into the system prompt.
 * Groups hints by confidence level.
 */
export function formatPromptHints(hints: PreferencePromptHint[]): string {
  if (hints.length === 0) return "";

  const highConfidence = hints.filter((h) => h.confidence >= 0.7);
  const mediumConfidence = hints.filter(
    (h) => h.confidence >= 0.3 && h.confidence < 0.7,
  );

  const lines: string[] = [];

  if (highConfidence.length > 0) {
    lines.push("## 用户历史偏好（高置信度）");
    for (const h of highConfidence) {
      lines.push(`- ${h.hint}`);
    }
  }

  if (mediumConfidence.length > 0) {
    lines.push("## 用户历史偏好（中置信度）");
    for (const h of mediumConfidence) {
      lines.push(`- ${h.hint}`);
    }
  }

  if (lines.length > 0) {
    lines.unshift(
      "以下是根据用户历史修正数据学习的偏好，请参考这些偏好调整输出：",
    );
  }

  return lines.join("\n");
}

// ============================================================
// Preference management helpers
// ============================================================

/**
 * Get all preferences for a user (including disabled).
 */
export async function listPreferences(
  client: SupabaseClient,
  userId: string,
): Promise<UserPreference[]> {
  const { data, error } = await client
    .from("ai_user_preferences")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) return [];

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    feature: String(row.feature) as UserPreference["feature"],
    preferenceKey: String(row.preference_key),
    preferenceValue: row.preference_value as UserPreference["preferenceValue"],
    evidenceCount: Number(row.evidence_count),
    confidence: Number(row.confidence),
    status: String(row.status) as UserPreference["status"],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

/**
 * Toggle a preference on/off.
 */
export async function togglePreference(
  client: SupabaseClient,
  userId: string,
  preferenceId: string,
  status: "active" | "disabled",
): Promise<UserPreference | null> {
  // Verify ownership (only non-deleted preferences)
  const { data: existing } = await client
    .from("ai_user_preferences")
    .select("id, user_id")
    .eq("id", preferenceId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .single();

  if (!existing) return null;

  const { data, error } = await client
    .from("ai_user_preferences")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", preferenceId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error || !data) return null;

  const row = data as Record<string, unknown>;
  return {
    id: String(row.id),
    feature: String(row.feature) as UserPreference["feature"],
    preferenceKey: String(row.preference_key),
    preferenceValue: row.preference_value as UserPreference["preferenceValue"],
    evidenceCount: Number(row.evidence_count),
    confidence: Number(row.confidence),
    status: String(row.status) as UserPreference["status"],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/**
 * Soft-delete a preference (sets deleted_at).
 */
export async function deletePreference(
  client: SupabaseClient,
  userId: string,
  preferenceId: string,
): Promise<boolean> {
  const { error } = await client
    .from("ai_user_preferences")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", preferenceId)
    .eq("user_id", userId)
    .is("deleted_at", null);

  return !error;
}
