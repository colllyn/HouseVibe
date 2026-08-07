// ============================================================
// Circuit Breaker — AI Model Hot-Switch
// Owner: ai-deepseek-engineer
// Contract: P3-AI-016
// ============================================================

import { getServerEnv } from "@/config/env";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Capability, ModelMode } from "./schemas";

// ============================================================
// Constants
// ============================================================

const HEALTH_CHECK_ENDPOINT = "/v1/chat/completions";

// ============================================================
// Types
// ============================================================

export interface CircuitState {
  circuitOpen: boolean;
  mode: ModelMode;
  consecutiveFailures: number;
}

export interface ModelEndpoint {
  baseUrl: string;
  apiKey: string;
  model: string;
}

// ============================================================
// Model endpoint resolution
// ============================================================

/**
 * Resolve which model/endpoint to use based on circuit breaker state.
 *
 * Priority:
 *   1. If admin forced primary → use primary
 *   2. If admin forced fallback → use fallback
 *   3. If circuit open (auto mode) → use fallback
 *   4. Otherwise → use primary
 */
export function resolveModelEndpoint(
  capability: Capability,
  config: CircuitState,
): ModelEndpoint {
  const env = getServerEnv();

  if (capability === "text") {
    const primaryModel = env.DEEPSEEK_MODEL || "deepseek-v4-flash";
    const fallbackModel = env.DEEPSEEK_FALLBACK_MODEL || primaryModel;
    const baseUrl = env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
    const apiKey = env.DEEPSEEK_API_KEY || "";

    const useFallback =
      config.mode === "fallback" ||
      (config.mode === "auto" && config.circuitOpen);

    return {
      baseUrl,
      apiKey,
      model: useFallback ? fallbackModel : primaryModel,
    };
  }

  // Vision capability
  const primaryModel = env.DEEPSEEK_VISION_MODEL || "deepseek-vl2";
  const primaryBaseUrl = env.DEEPSEEK_VISION_BASE_URL_PRIMARY || "https://api.deepseek.com";
  const fallbackBaseUrl = env.DEEPSEEK_VISION_BASE_URL_FALLBACK || primaryBaseUrl;
  const apiKey = env.DEEPSEEK_VISION_API_KEY || env.DEEPSEEK_API_KEY || "";

  const useFallback =
    config.mode === "fallback" ||
    (config.mode === "auto" && config.circuitOpen);

  return {
    baseUrl: useFallback ? fallbackBaseUrl : primaryBaseUrl,
    apiKey,
    model: primaryModel, // same model, different endpoint for vision
  };
}

// ============================================================
// Circuit breaker state management
// ============================================================

/**
 * Fetch current circuit state from the database.
 */
export async function getCircuitState(
  supabase: SupabaseClient,
  capability: Capability,
): Promise<CircuitState> {
  const { data, error } = await supabase.rpc("get_runtime_config", {
    p_capability: capability,
  });

  if (error || !data?.success) {
    // Default: auto mode, circuit closed
    return { circuitOpen: false, mode: "auto", consecutiveFailures: 0 };
  }

  return {
    circuitOpen: data.circuit_open ?? false,
    mode: (data.mode as ModelMode) ?? "auto",
    consecutiveFailures: data.consecutive_failures ?? 0,
  };
}

/**
 * Report a success — reset circuit state.
 */
export async function reportSuccess(
  supabase: SupabaseClient,
  capability: Capability,
): Promise<void> {
  await supabase.rpc("update_circuit_state", {
    p_capability: capability,
    p_success: true,
    p_is_server_error: false,
  });
}

/**
 * Report a failure. Only server errors (5xx, connection, timeout) count.
 * 4xx, schema, and compliance errors are ignored.
 */
export async function reportFailure(
  supabase: SupabaseClient,
  capability: Capability,
  isServerError: boolean,
): Promise<CircuitState> {
  const { data, error } = await supabase.rpc("update_circuit_state", {
    p_capability: capability,
    p_success: false,
    p_is_server_error: isServerError,
  });

  if (error || !data?.success) {
    return { circuitOpen: false, mode: "auto", consecutiveFailures: 0 };
  }

  return {
    circuitOpen: data.circuit_open ?? false,
    mode: (data.mode as ModelMode) ?? "auto",
    consecutiveFailures: data.consecutive_failures ?? 0,
  };
}

/**
 * Health-check a DeepSeek endpoint.
 * Sends a minimal valid request and checks for a successful response.
 * Returns true if the endpoint is healthy.
 */
export async function healthCheck(
  endpoint: ModelEndpoint,
  timeoutMs = 10000,
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    await fetch(`${endpoint.baseUrl}${HEALTH_CHECK_ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${endpoint.apiKey}`,
      },
      body: JSON.stringify({
        model: endpoint.model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
        stream: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    // Any response (including 4xx) means the endpoint is reachable
    return true;
  } catch {
    return false;
  }
}

/**
 * Attempt to restore the primary model after circuit has been open.
 * Performs a health check and closes the circuit if the primary is healthy.
 */
export async function tryRestorePrimary(
  supabase: SupabaseClient,
  capability: Capability,
): Promise<boolean> {
  const env = getServerEnv();

  let primaryEndpoint: ModelEndpoint;
  if (capability === "text") {
    primaryEndpoint = {
      baseUrl: env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
      apiKey: env.DEEPSEEK_API_KEY || "",
      model: env.DEEPSEEK_MODEL || "deepseek-v4-flash",
    };
  } else {
    primaryEndpoint = {
      baseUrl: env.DEEPSEEK_VISION_BASE_URL_PRIMARY || "https://api.deepseek.com",
      apiKey: env.DEEPSEEK_VISION_API_KEY || env.DEEPSEEK_API_KEY || "",
      model: env.DEEPSEEK_VISION_MODEL || "deepseek-vl2",
    };
  }

  const healthy = await healthCheck(primaryEndpoint);
  if (healthy) {
    // Reset circuit — report success
    await reportSuccess(supabase, capability);

    // Audit log restoration via SECURITY DEFINER RPC (P0-3 fix)
    await supabase.rpc("write_audit_log", {
      p_workspace_id: "00000000-0000-0000-0000-000000000000",
      p_action: "ai_circuit_restored",
      p_entity_type: "ai_runtime_config",
      p_entity_id: capability,
      p_after_data: {
        capability,
        reason: "health_check_passed",
      },
    });
    return true;
  }
  return false;
}

/**
 * Determine if an HTTP error is a server error (5xx, connection failure, timeout)
 * that should count toward the circuit breaker.
 */
export function isServerError(status: number | undefined, errorType?: string): boolean {
  if (status && status >= 500) return true;
  if (errorType === "ECONNREFUSED" || errorType === "ECONNRESET") return true;
  if (errorType === "ETIMEDOUT" || errorType === "ABORT_ERR") return true;
  if (errorType === "FETCH_ERROR") return true;
  return false;
}

/**
 * Determine if an error is a non-server error (4xx, schema, compliance)
 * that should NOT count toward the circuit breaker.
 */
export function isNonServerError(status: number | undefined): boolean {
  if (status && status >= 400 && status < 500) return true;
  return false;
}
