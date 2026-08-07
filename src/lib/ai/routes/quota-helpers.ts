/**
 * Shared quota lifecycle helpers for AI extraction/search handlers (P0-001 fix).
 *
 * Provides reserve/settle/release wrappers matching the pattern in
 * generate-content-handler.ts, but simplified for text extraction endpoints
 * (no fact checking, compliance, or property loading).
 *
 * Contract: docs/contracts/ai-contract.md v2.0 §16
 */

import { getServerEnv } from "@/config/env";

// ============================================================
// Types
// ============================================================

// Supabase client types vary by runtime context (route handler vs server component).
// Use a structural type to avoid coupling to any specific Supabase import.
export interface RpcClient {
  rpc: (fn: string, params: Record<string, unknown>) => {
    then: <TResult1 = { data: unknown; error: { message?: string } | null }, TResult2 = never>(
      onfulfilled?: ((value: { data: unknown; error: { message?: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise<TResult1 | TResult2>;
  };
}

export interface QuotaReserveResult {
  success: boolean;
  already_reserved?: boolean;
  reservation_id?: string;
  limit_reason?: string | null;
  remaining_requests?: number;
  remaining_cost_usd?: number;
  daily_limit?: number;
  daily_cost_limit_usd?: number;
  used_requests?: number;
  used_cost_usd?: number;
  quota_date?: string;
}

// ============================================================
// Cost estimation — conservative: max output tokens
// ============================================================

const EXTRACTION_MAX_TOKENS = 2048;
const EXTRACTION_OUTPUT_PRICE_PER_1K = 0.00219;

export function estimateExtractionCost(): { estimatedCostUsd: number; estimatedTokens: number } {
  const estimatedTokens = EXTRACTION_MAX_TOKENS;
  const estimatedCostUsd = (estimatedTokens * EXTRACTION_OUTPUT_PRICE_PER_1K) / 1000;
  return { estimatedCostUsd, estimatedTokens };
}

// ============================================================
// Reserve — atomic quota reservation before Provider call
// ============================================================

export interface ReserveParams {
  client: RpcClient;
  userId: string;
  workspaceId: string;
  feature: "ai_data_extraction" | "semantic_search";
  idempotencyKey: string;
  capability?: string;
}

export async function reserveQuota(params: ReserveParams): Promise<{
  success: boolean;
  reservationId: string | null;
  alreadyReserved: boolean;
  errorResponse: { code: string; message: string; status: number; details?: Record<string, unknown> } | null;
}> {
  const { client, userId, workspaceId, feature, idempotencyKey, capability = "text_generation" } = params;
  const env = getServerEnv();
  const { estimatedCostUsd } = estimateExtractionCost();
  const requestId = crypto.randomUUID();

  const limit = feature === "semantic_search"
    ? env.AI_DAILY_SEARCH_LIMIT
    : env.AI_DAILY_EXTRACTION_LIMIT;

  const { data, error } = await client.rpc("reserve_ai_quota", {
    p_user_id: userId,
    p_workspace_id: workspaceId,
    p_feature: feature,
    p_capability: capability,
    p_request_limit: limit,
    p_daily_cost_limit_usd: env.AI_DAILY_COST_LIMIT_USD,
    p_reserved_estimated_cost_usd: estimatedCostUsd,
    p_idempotency_key: idempotencyKey,
    p_request_id: requestId,
  });

  if (error) {
    return {
      success: false,
      reservationId: null,
      alreadyReserved: false,
      errorResponse: { code: "QUOTA_CHECK_FAILED", message: "AI 配额检查失败，请重试", status: 429 },
    };
  }

  const result = data as unknown as QuotaReserveResult;

  if (!result.success) {
    const reason = result.limit_reason;
    if (reason === "cost_limit") {
      return {
        success: false,
        reservationId: null,
        alreadyReserved: false,
        errorResponse: {
          code: "COST_LIMIT_EXCEEDED",
          message: "AI 每日成本已达上限，请明天再试",
          status: 429,
          details: {
            dailyCostLimitUsd: result.daily_cost_limit_usd,
            usedCostUsd: result.used_cost_usd,
            remainingCostUsd: result.remaining_cost_usd,
          },
        },
      };
    }
    return {
      success: false,
      reservationId: null,
      alreadyReserved: false,
      errorResponse: {
        code: "QUOTA_EXCEEDED",
        message: `今日 AI 使用次数已用完（${result.used_requests ?? "?"}/${result.daily_limit ?? "?"}），请明天再试`,
        status: 429,
        details: {
          dailyLimit: result.daily_limit,
          used: result.used_requests,
          remaining: result.remaining_requests,
        },
      },
    };
  }

  if (result.already_reserved) {
    return {
      success: true,
      reservationId: null,
      alreadyReserved: true,
      errorResponse: {
        code: "CONFLICT",
        message: "相同 idempotencyKey 的请求已存在，请使用新的 Key 重试",
        status: 409,
      },
    };
  }

  return {
    success: true,
    reservationId: result.reservation_id ?? null,
    alreadyReserved: false,
    errorResponse: null,
  };
}

// ============================================================
// Settle — record actual usage after successful Provider call
// ============================================================

export async function settleQuota(params: {
  client: RpcClient;
  userId: string;
  workspaceId: string;
  idempotencyKey: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  model: string;
  status?: string;
}): Promise<void> {
  const { client, userId, workspaceId, idempotencyKey, inputTokens, outputTokens, costUsd, model, status = "succeeded" } = params;
  const { error } = await client.rpc("settle_ai_quota", {
    p_user_id: userId,
    p_workspace_id: workspaceId,
    p_idempotency_key: idempotencyKey,
    p_status: status,
    p_input_tokens: inputTokens,
    p_output_tokens: outputTokens,
    p_actual_cost_usd: costUsd,
    p_model: model,
    p_request_id: crypto.randomUUID(),
  });

  if (error) {
    console.error("[quota] settle failed:", error);
  }
}

// ============================================================
// Release — free reserved quota on Provider failure
// ============================================================

export async function releaseQuota(params: {
  client: RpcClient;
  userId: string;
  workspaceId: string;
  idempotencyKey: string;
  reason: string;
}): Promise<void> {
  const { client, userId, workspaceId, idempotencyKey, reason } = params;
  try {
    await client.rpc("release_ai_quota", {
      p_user_id: userId,
      p_workspace_id: workspaceId,
      p_idempotency_key: idempotencyKey,
      p_reason: reason,
    });
  } catch {
    // Best-effort release — don't fail the request if release fails
  }
}
