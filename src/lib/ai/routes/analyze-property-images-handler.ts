/**
 * Analyze Property Images Route Handler — P3-AI-006
 *
 * POST /api/ai/analyze-property-images
 * Full lifecycle: auth → workspace → entitlement → quota reserve →
 * property+media ownership → signed URLs with correlation IDs →
 * VisionProvider → atomic persistence RPC with quota settle.
 */

import { type NextRequest } from "next/server";
import { z } from "zod";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { createClient } from "@/lib/supabase/server";
import { getServerEnv } from "@/config/env";
import type { DeepSeekVisionProvider } from "@/lib/ai/types";
import { DeepSeekProviderError } from "@/lib/ai/types";
import { createDeepSeekVisionProvider } from "@/lib/ai/providers/deepseek-vision-provider";
import { hasFeature } from "@/features/access-control/guards";
function estimateCost(maxTokens: number): { estimatedCostUsd: number } {
  const pricePer1k = 0.002; // ~$2/1M tokens for vision
  return { estimatedCostUsd: (maxTokens / 1000) * pricePer1k };
}

// ============================================================
// Schema
// ============================================================

const AnalyzeImagesRequestSchema = z
  .object({
    propertyId: z.string().uuid(),
    propertyMediaIds: z.array(z.string().uuid()).min(1).max(8),
  })
  .strict();

interface QuotaReserveResult {
  success: boolean;
  reservation_id?: string;
  already_reserved?: boolean;
  limit_reason?: string;
  used_requests?: number;
  daily_limit?: number;
  remaining_requests?: number;
  used_cost_usd?: number;
  daily_cost_limit_usd?: number;
  remaining_cost_usd?: number;
  quota_date?: string;
}

interface MediaRecord {
  id: string;
  storage_path: string;
  property_id: string;
  workspace_id: string;
}

// ============================================================
// Helpers
// ============================================================

const SIGNED_URL_EXPIRY = 300;

function urlOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost";
  return `${proto}://${host}`;
}

const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Credentials": "true",
});

// ============================================================
// Handler Factory
// ============================================================

export function createAnalyzeImagesHandler(
  providerFactory?: () => DeepSeekVisionProvider
) {
  return async function POST(request: NextRequest) {
    const origin = urlOrigin(request);
    const h = corsHeaders(origin);
    const { client, jsonResponse } = await createRouteHandlerClient(request);
    const env = getServerEnv();
    let reservationId: string | null = null;
    let userId: string | null = null;
    let workspaceId: string | null = null;
    const idempotencyKey = request.headers.get("x-idempotency-key") ?? crypto.randomUUID();

    try {
      // 1. Auth
      const { data: { user } } = await client.auth.getUser();
      if (!user) {
        return jsonResponse({ data: null, error: { code: "UNAUTHENTICATED", message: "未登录" } }, { status: 401, headers: h });
      }
      userId = user.id;

      // 2. Workspace
      const { data: member } = await client.from("workspace_members").select("workspace_id").eq("user_id", userId).eq("status", "active").limit(1).single();
      if (!member) {
        return jsonResponse({ data: null, error: { code: "WORKSPACE_ACCESS_DENIED", message: "无工作区权限" } }, { status: 403, headers: h });
      }
      workspaceId = member.workspace_id;

      // 3. Entitlement
      const entitled = await hasFeature("ai_data_extraction");
      if (!entitled) {
        return jsonResponse({ data: null, error: { code: "FEATURE_NOT_ALLOWED", message: "需要 ai_data_extraction 功能授权" } }, { status: 403, headers: h });
      }

      // 4. Parse body
      let body: unknown;
      try { body = await request.json(); } catch {
        return jsonResponse({ data: null, error: { code: "VALIDATION_FAILED", message: "请求体不是有效的 JSON" } }, { status: 400, headers: h });
      }
      const parsed = AnalyzeImagesRequestSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResponse({ data: null, error: { code: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "参数无效" } }, { status: 400, headers: h });
      }
      const { propertyId, propertyMediaIds } = parsed.data;

      // 5. Verify property ownership
      const { data: property } = await client.from("properties").select("id, workspace_id, title").eq("id", propertyId).eq("workspace_id", workspaceId).single();
      if (!property) {
        return jsonResponse({ data: null, error: { code: "RESOURCE_NOT_FOUND", message: "房源不存在或无权访问" } }, { status: 404, headers: h });
      }

      // 6. Verify media ownership + get storage_paths
      const { data: media, error: mediaError } = await client.from("property_media").select("id, storage_path, property_id, workspace_id").in("id", propertyMediaIds).eq("property_id", propertyId).eq("workspace_id", workspaceId);
      if (mediaError || !media || media.length === 0) {
        return jsonResponse({ data: null, error: { code: "RESOURCE_NOT_FOUND", message: "媒体文件不存在或无权访问" } }, { status: 404, headers: h });
      }
      const foundIds = new Set((media as MediaRecord[]).map((m) => m.id));
      const missing = propertyMediaIds.filter((id) => !foundIds.has(id));
      if (missing.length > 0) {
        return jsonResponse({ data: null, error: { code: "VALIDATION_FAILED", message: `部分媒体文件不存在: ${missing.join(", ")}` } }, { status: 400, headers: h });
      }

      // 7. Generate signed URLs + correlation IDs (server-side, deterministic per mediaId)
      const supabase = await createClient();
      type CorrelatedMedia = { mediaId: string; correlationId: string; signedUrl: string };
      const correlated: CorrelatedMedia[] = [];

      for (const m of (media as MediaRecord[])) {
        const correlationId = crypto.randomUUID();
        const { data: signed } = await supabase.storage.from("property-private").createSignedUrl(m.storage_path, SIGNED_URL_EXPIRY);
        if (!signed?.signedUrl) {
          // Release quota if any signed URL generation fails
          if (reservationId) { try { await client.rpc("release_ai_quota", { p_user_id: userId ?? "", p_workspace_id: workspaceId, p_idempotency_key: idempotencyKey, p_reason: "signed_url_failed" }); } catch { /* best-effort */ } }
          return jsonResponse({ data: null, error: { code: "INTERNAL_ERROR", message: "无法生成图片访问链接" } }, { status: 500, headers: h });
        }
        correlated.push({ mediaId: m.id, correlationId, signedUrl: signed.signedUrl });
      }

      // 8. Atomic quota reservation (BEFORE Provider call)
      const { estimatedCostUsd } = estimateCost(4096);
      const requestId = crypto.randomUUID();

      const { data: quotaData, error: quotaErr } = await client.rpc("reserve_ai_quota", {
        p_user_id: userId ?? "", p_workspace_id: workspaceId, p_feature: "ai_data_extraction",
        p_capability: "vision_analysis", p_request_limit: env.AI_DAILY_CONTENT_LIMIT,
        p_daily_cost_limit_usd: env.AI_DAILY_COST_LIMIT_USD,
        p_reserved_estimated_cost_usd: estimatedCostUsd, p_idempotency_key: idempotencyKey, p_request_id: requestId,
      });

      if (quotaErr) {
        return jsonResponse({ data: null, error: { code: "QUOTA_EXCEEDED", message: "AI 配额检查失败" } }, { status: 429, headers: h });
      }
      const reserveResult = quotaData as unknown as QuotaReserveResult;
      if (!reserveResult.success) {
        const reason = reserveResult.limit_reason;
        if (reason === "cost_limit") {
          return jsonResponse({ data: null, error: { code: "COST_LIMIT_EXCEEDED", message: `AI 成本已达上限` } }, { status: 429, headers: h });
        }
        return jsonResponse({ data: null, error: { code: "QUOTA_EXCEEDED", message: "今日 AI 配额已用完" } }, { status: 429, headers: h });
      }
      if (reserveResult.already_reserved) {
        return jsonResponse({ data: null, error: { code: "CONFLICT", message: "相同请求已处理，请使用新的 idempotency key" } }, { status: 409, headers: h });
      }
      reservationId = reserveResult.reservation_id ?? null;

      // 9. Call VisionProvider with correlation IDs
      let provider: DeepSeekVisionProvider;
      try {
        provider = providerFactory ? providerFactory() : createDeepSeekVisionProvider();
      } catch (providerErr) {
        if (providerErr instanceof DeepSeekProviderError && providerErr.code === "AI_NOT_CONFIGURED") {
          if (reservationId) { try { await client.rpc("release_ai_quota", { p_user_id: userId ?? "", p_workspace_id: workspaceId, p_idempotency_key: idempotencyKey, p_reason: "provider_not_configured" }); } catch { /* */ } }
          return jsonResponse({ data: null, error: { code: "AI_NOT_CONFIGURED", message: "视觉分析服务未配置" } }, { status: 503, headers: h });
        }
        throw providerErr;
      }

      const imageUrls = correlated.map((c) => c.signedUrl);
      let result;
      try {
        result = await provider.analyzePropertyImages({
          requestId, imageUrls,
          propertyFacts: { title: (property as { title: string }).title },
          schemaVersion: "1.0", promptVersion: "1", modelName: "deepseek-vl2",
        }, request.signal);
      } catch (providerErr) {
        if (reservationId) { try { await client.rpc("release_ai_quota", { p_user_id: userId ?? "", p_workspace_id: workspaceId, p_idempotency_key: idempotencyKey, p_reason: "provider_error" }); } catch { /* */ } }
        throw providerErr;
      }

      // 10. Map results by index to mediaIds (order preserved by correlated array)
      const mediaLabels = result.mediaResults.map((mr, i) => {
        const realMediaId = correlated[i]?.mediaId ?? mr.mediaId;
        return {
          mediaId: realMediaId,
          aiLabels: mr.aiLabels,
          aiAnalysisStatus: mr.status === "completed" ? "completed" : "failed",
        };
      });

      // 11. Atomic persistence: save labels + visual data + settle quota in one RPC
      const usage = result.usage ?? { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 };
      const { data: persistResult, error: persistErr } = await client.rpc("persist_visual_analysis", {
        p_property_id: propertyId,
        p_media_labels: mediaLabels,
        p_visual_summary: result.visualSummary,
        p_visual_fact_flags: result.factChecks,
        p_user_id: user.id,
        p_workspace_id: workspaceId,
        p_idempotency_key: idempotencyKey,
        p_model: "deepseek-vl2",
        p_input_tokens: usage.inputTokens,
        p_output_tokens: usage.outputTokens,
        p_actual_cost_usd: usage.estimatedCostUsd,
        p_request_id: requestId,
      });

      if (persistErr || !(persistResult as { success?: boolean })?.success) {
        // RPC failed → whole transaction rolled back. Release quota separately.
        if (reservationId) { try { await client.rpc("release_ai_quota", { p_user_id: userId ?? "", p_workspace_id: workspaceId, p_idempotency_key: idempotencyKey, p_reason: "persist_failed" }); } catch { /* */ } }
        return jsonResponse({ data: null, error: { code: "INTERNAL_ERROR", message: "结果保存失败" } }, { status: 500, headers: h });
      }
      reservationId = null; // settled in RPC

      // 12. Success
      return jsonResponse({
        data: {
          requestId, model: "deepseek-vl2",
          mediaResults: mediaLabels.map((ml) => ({
            mediaId: ml.mediaId, aiLabels: ml.aiLabels, aiAnalysisStatus: ml.aiAnalysisStatus,
          })),
          visualSummary: result.visualSummary, factChecks: result.factChecks,
        },
        error: null,
      }, { status: 200, headers: h });

    } catch (err) {
      if (err instanceof DeepSeekProviderError) {
        if (err.code === "AI_REQUEST_ABORTED") throw err;
        if (reservationId) { try { await client.rpc("release_ai_quota", { p_user_id: userId ?? "", p_workspace_id: workspaceId, p_idempotency_key: idempotencyKey, p_reason: "provider_error" }); } catch { /* */ } }
        return jsonResponse({ data: null, error: { code: err.code, message: err.message } }, { status: 502, headers: h });
      }
      if (reservationId) { try { await client.rpc("release_ai_quota", { p_user_id: userId ?? "", p_workspace_id: workspaceId, p_idempotency_key: idempotencyKey, p_reason: "unexpected_error" }); } catch { /* */ } }
      return jsonResponse({ data: null, error: { code: "INTERNAL_ERROR", message: "服务器错误" } }, { status: 500, headers: h });
    }
  };
}
