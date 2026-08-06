/**
 * Generate Content Route Handler Factory
 *
 * Generates platform-specific marketing content (xiaohongshu, douyin, wechat_moments)
 * from a server-verified property. Requires: content_factory entitlement.
 *
 * Contract: docs/contracts/ai-contract.md v2.0 §2.2, §16
 *           docs/contracts/api-contract.md §10.6
 *           docs/contracts/compliance-and-audit-contract.md §4
 *
 * Pipeline: Auth → Workspace → Entitlement → Schema → Load Property →
 *           Atomic Reserve → PII Redact → Provider → Fact Verify →
 *           Compliance Scan → Settle/Release → Envelope
 */

import { type NextRequest } from "next/server";
import { z } from "zod";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { hasFeature } from "@/features/access-control/guards";
import { createDeepSeekTextProvider } from "@/lib/ai/providers/deepseek-text-provider";
import { DeepSeekProviderError } from "@/lib/ai/types";
import { redactPropertyInput } from "@/lib/ai/privacy/redact-property-input";
import { checkCompliance, toResponseStatus } from "@/lib/compliance/check";
import { checkContentFacts, type SourcePropertyFacts } from "@/lib/ai/fact-checker";
import { getPromptHints } from "@/features/ai-preferences/preference-engine";
import { getServerEnv } from "@/config/env";
import type {
  DeepSeekTextProvider,
  ContentGenerationInput,
  GeneratedContent,
  GenerateContentResult,
  RedactedPropertyFacts,
  AIUsage,
} from "@/lib/ai/types";

// ============================================================
// Request Schema — §10.6: propertyId-based, no inline facts
// ============================================================

const GenerateContentRequestSchema = z
  .object({
    propertyId: z.string().uuid(),
    platform: z.enum(["xiaohongshu", "douyin", "wechat_moments"]),
    targetAudience: z.string().max(200).optional(),
    contentAngle: z.string().max(200).optional(),
    contentGoal: z.string().max(200).optional(),
    tone: z.string().max(100).optional(),
    videoDurationSeconds: z.number().int().min(0).max(600).optional(),
    isOnCamera: z.boolean().optional(),
    showDrawbacks: z.boolean().optional(),
    privateMessageKeyword: z.string().max(50).optional(),
    idempotencyKey: z.string().min(1).max(100),
  })
  .strict();

// ============================================================
// Quota reserve result shape
// ============================================================

interface QuotaReserveResult {
  success: boolean;
  already_reserved?: boolean;
  reservation_id?: string;
  status?: string;
  limit_reason?: string | null;
  remaining_requests?: number;
  remaining_cost_usd?: number;
  daily_limit?: number;
  daily_cost_limit_usd?: number;
  used_requests?: number;
  used_cost_usd?: number;
  reservation_expires_at?: string;
  quota_date?: string;
}

// ============================================================
// DB property row Zod schema — validates Supabase query result
// ============================================================

const DbPropertyRowSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  is_shared: z.boolean(),
  allow_marketing_reuse: z.boolean(),
  status: z.string().optional(),
  deleted_at: z.string().nullable().optional(),
  title: z.string().optional(),
  city: z.string().optional(),
  district: z.string().optional(),
  business_area: z.string().optional(),
  community_name: z.string().optional(),
  rental_type: z.string().optional(),
  monthly_rent: z.number().optional(),
  deposit_terms: z.string().optional(),
  bedrooms: z.number().optional(),
  living_rooms: z.number().optional(),
  bathrooms: z.number().optional(),
  area_sqm: z.number().optional(),
  has_elevator: z.boolean().optional(),
  orientation: z.string().optional(),
  decoration: z.string().optional(),
  available_from: z.string().optional(),
  minimum_lease_months: z.number().optional(),
  pets_allowed: z.boolean().optional(),
  cooking_allowed: z.boolean().optional(),
  subway_text: z.string().optional(),
  facilities: z.unknown().optional(),
  tags: z.array(z.string()).optional(),
  selling_points: z.array(z.string()).optional(),
  drawbacks: z.array(z.string()).optional(),
  description: z.string().optional(),
  address_text: z.string().optional(),
});

type DbPropertyRow = z.infer<typeof DbPropertyRowSchema>;

// ============================================================
// Error Mapping
// ============================================================

interface RouteError {
  code: string;
  message: string;
}

function mapProviderError(
  err: DeepSeekProviderError
): { status: number; body: RouteError } {
  switch (err.code) {
    case "AI_NOT_CONFIGURED":
      return {
        status: 503,
        body: { code: "AI_NOT_CONFIGURED", message: "AI 服务未配置，请联系管理员" },
      };
    case "AI_TIMEOUT":
      return {
        status: 504,
        body: { code: "AI_TIMEOUT", message: "AI 服务响应超时，请重试" },
      };
    case "AI_RATE_LIMITED":
      return {
        status: 502,
        body: { code: "AI_RATE_LIMITED", message: "AI 服务繁忙，请稍后重试" },
      };
    case "AI_UPSTREAM_ERROR":
      return {
        status: 502,
        body: { code: "AI_UPSTREAM_ERROR", message: "AI 服务暂时不可用" },
      };
    case "AI_INVALID_RESPONSE":
      return {
        status: 502,
        body: { code: "AI_INVALID_RESPONSE", message: "AI 内容生成异常，请重试" },
      };
    case "AI_REQUEST_ABORTED":
      throw err;
  }
}

// ============================================================
// Helpers
// ============================================================

function urlOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost";
  return `${proto}://${host}`;
}

function dbPropertyToRedactedFacts(p: DbPropertyRow): RedactedPropertyFacts {
  return {
    title: p.title,
    city: p.city,
    district: p.district,
    businessArea: p.business_area,
    communityName: p.community_name,
    addressText: p.address_text,
    rentalType: p.rental_type,
    monthlyRent: p.monthly_rent,
    depositTerms: p.deposit_terms,
    bedrooms: p.bedrooms,
    livingRooms: p.living_rooms,
    bathrooms: p.bathrooms,
    areaSqm: p.area_sqm,
    hasElevator: p.has_elevator,
    orientation: p.orientation,
    decoration: p.decoration,
    availableFrom: p.available_from,
    minimumLeaseMonths: p.minimum_lease_months,
    petsAllowed: p.pets_allowed,
    cookingAllowed: p.cooking_allowed,
    subwayText: p.subway_text,
    facilities: p.facilities,
    tags: p.tags,
    sellingPoints: p.selling_points,
    drawbacks: p.drawbacks,
    description: p.description,
  };
}

/**
 * Extract all scannable text from a GeneratedContent result for compliance checking.
 */
function extractScanText(result: GeneratedContent, platform: string): string {
  const parts: string[] = [];
  if (result.platform === "xiaohongshu" && platform === "xiaohongshu") {
    parts.push(result.body);
    parts.push(result.hook);
    parts.push(result.coverText);
    parts.push(result.factualSummary);
    result.titleOptions.forEach((t) => parts.push(t));
  } else if (result.platform === "douyin" && platform === "douyin") {
    parts.push(result.fullVoiceover);
    parts.push(result.caption);
    parts.push(result.subtitles);
    result.hookOptions.forEach((h) => parts.push(h));
  } else if (result.platform === "wechat_moments") {
    result.copyOptions.forEach((c) => parts.push(c));
    parts.push(result.nineGridSuggestion);
  }
  return parts.join("\n");
}

/**
 * Calculate estimated cost for a request based on max tokens and pricing.
 * Uses conservative estimate: the full max_tokens budget for output.
 */
function estimateCost(maxTokens: number): { estimatedCostUsd: number; estimatedTokens: number } {
  // Conservative: assume max output tokens as a rough capacity estimate
  const estimatedTokens = maxTokens;
  // ~$0.00219/1k output (deepseek-v4-pro pricing) — conservative for reserve
  const outputPricePer1k = 0.00219;
  const estimatedCostUsd = (estimatedTokens * outputPricePer1k) / 1000;
  return { estimatedCostUsd, estimatedTokens };
}

// ============================================================
// Handler Factory
// ============================================================

export function createGenerateContentHandler(
  providerFactory?: () => DeepSeekTextProvider
) {
  const getProvider = providerFactory ?? (() => createDeepSeekTextProvider());

  return async function POST(request: NextRequest) {
    const origin = urlOrigin(request);
    const h = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
    };

    const { client, jsonResponse } = await createRouteHandlerClient(request);

    // ============================================================
    // Helper: Build error envelope
    // ============================================================
    function errorResponse(code: string, message: string, status: number, details?: Record<string, unknown>) {
      return jsonResponse(
        { data: null, error: { code, message, ...(details ? { details } : {}) } },
        { status, headers: h }
      );
    }

    let reservationId: string | null = null;
    let _idempotencyKey: string | null = null;
    let _userId: string | null = null;
    let _workspaceId: string | null = null;

    try {
      // Step 1: Authentication
      const { data: { user } } = await client.auth.getUser();
      if (!user) {
        return errorResponse("UNAUTHENTICATED", "未登录", 401);
      }

      // Step 2: Workspace membership
      const { data: member } = await client
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1)
        .single();

      if (!member) {
        return errorResponse("WORKSPACE_ACCESS_DENIED", "无工作区权限", 403);
      }

      const workspaceId: string = member.workspace_id;
      _userId = user.id;
      _workspaceId = workspaceId;

      // Step 2b: Entitlement — content_factory
      const entitled = await hasFeature("content_factory");
      if (!entitled) {
        return errorResponse("CONTENT_FACTORY_NOT_ALLOWED", "需要 content_factory 功能授权", 403);
      }

      // Step 2c: Content-Type validation
      const contentType = request.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        return errorResponse("VALIDATION_FAILED", "请求格式必须为 JSON", 422);
      }

      // Step 2d: Body parsing
      let body: unknown;
      try { body = await request.json(); } catch {
        return errorResponse("VALIDATION_FAILED", "请求体不是有效的 JSON", 422);
      }

      const parsed = GenerateContentRequestSchema.safeParse(body);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        const msg = first ? `${first.path.join(".")}: ${first.message}` : "请求参数无效";
        return errorResponse("VALIDATION_FAILED", msg, 422);
      }

      const { propertyId, platform, idempotencyKey, ...contentOptions } = parsed.data;
      _idempotencyKey = idempotencyKey;

      // Step 3: Load property from DB — verify ownership + marketing_reuse
      const { data: property, error: propErr } = await client
        .from("properties")
        .select("*")
        .eq("id", propertyId)
        .is("deleted_at", null)
        .single();

      if (propErr || !property) {
        return errorResponse("RESOURCE_NOT_FOUND", "房源不存在", 404);
      }

      const p = DbPropertyRowSchema.parse(property);

      // Must belong to workspace OR be shared with marketing_reuse
      const isOwn = p.workspace_id === workspaceId;
      const isReusable = p.is_shared && p.allow_marketing_reuse;
      if (!isOwn && !isReusable) {
        return errorResponse("PROPERTY_NOT_MARKETING_REUSABLE", "房源未授权营销复用", 403);
      }

      // ============================================================
      // Step 4: Atomic quota reservation (P3-AI-014 — full lifecycle)
      // ============================================================
      const env = getServerEnv();
      const maxTokens = 4096; // generateContent max_tokens per contract §11.3
      const { estimatedCostUsd } = estimateCost(maxTokens);
      const requestId = crypto.randomUUID();
      // Let RPC determine quota_date in AI_QUOTA_TIMEZONE (Asia/Shanghai)
      // per PRD §10.9; p_quota_date omitted so RPC uses its timezone-aware default

      const { data: quotaData, error: quotaErr } = await client.rpc("reserve_ai_quota", {
        p_user_id: user.id,
        p_workspace_id: workspaceId,
        p_feature: "content_factory",
        p_capability: "text_generation",
        p_request_limit: env.AI_DAILY_CONTENT_LIMIT,
        p_daily_cost_limit_usd: env.AI_DAILY_COST_LIMIT_USD,
        p_reserved_estimated_cost_usd: estimatedCostUsd,
        p_idempotency_key: idempotencyKey,
        p_request_id: requestId,
      });

      if (quotaErr) {
        return errorResponse("QUOTA_EXCEEDED", "AI 配额检查失败，请重试", 429);
      }

      const reserveResult = quotaData as unknown as QuotaReserveResult;

      if (!reserveResult.success) {
        const reason = reserveResult.limit_reason;
        if (reason === "cost_limit") {
          return errorResponse(
            "COST_LIMIT_EXCEEDED",
            `AI 每日成本已达上限（$${reserveResult.used_cost_usd?.toFixed(2) ?? "?"} / $${reserveResult.daily_cost_limit_usd ?? "?"}），请明天再试`,
            429,
            {
              dailyCostLimitUsd: reserveResult.daily_cost_limit_usd,
              usedCostUsd: reserveResult.used_cost_usd,
              remainingCostUsd: reserveResult.remaining_cost_usd,
            }
          );
        }
        // request_limit or blocked
        return errorResponse(
          "QUOTA_EXCEEDED",
          `今日内容生成次数已用完（${reserveResult.used_requests ?? "?"}/${reserveResult.daily_limit ?? "?"}），请明天再试`,
          429,
          {
            dailyLimit: reserveResult.daily_limit,
            used: reserveResult.used_requests,
            remaining: reserveResult.remaining_requests,
            resetAt: reserveResult.quota_date
              ? `${reserveResult.quota_date}T00:00:00+08:00`
              : undefined,
          }
        );
      }

      reservationId = reserveResult.reservation_id ?? null;

      // If already reserved (idempotency replay), the Provider call was already made.
      // Per contract §1.4: same idempotencyKey returns same result without re-calling Provider.
      // We cannot replay the content, so return a conflict indicating the resource state.
      if (reserveResult.already_reserved) {
        return errorResponse(
          "CONFLICT",
          "相同 idempotencyKey 的请求已存在，请使用新的 Key 重试",
          409
        );
      }

      // ============================================================
      // Step 5: Privacy — redact DB-loaded property free-text fields
      // ============================================================
      const facts = dbPropertyToRedactedFacts(p);
      if (facts.description) {
        const redaction = redactPropertyInput(facts.description);
        if (!redaction.safeToSend) {
          // Release quota before returning — input rejection is permanent, no retry
          if (reservationId) {
            await client.rpc("release_ai_quota", {
              p_user_id: user.id,
              p_workspace_id: workspaceId,
              p_idempotency_key: idempotencyKey,
              p_reason: "compliance_blocked_input",
            });
            reservationId = null;
          }
          return errorResponse("COMPLIANCE_BLOCKED", "房源描述包含过多隐私信息，内容生成被拒绝", 422);
        }
        facts.description = redaction.redactedText;
      }
      if (facts.addressText) {
        const redaction = redactPropertyInput(facts.addressText);
        facts.addressText = redaction.safeToSend ? redaction.redactedText : undefined;
      }

      // ============================================================
      // Step 6: Fetch user preferences for prompt hints
      // ============================================================
      const prefHints = await getPromptHints(client, user.id);

      // ============================================================
      // Step 7: Model call — narrow DTO, no identity
      // ============================================================
      const provider = getProvider();
      const providerInput: ContentGenerationInput = {
        requestId,
        promptVersion: "1.0.0",
        modelName: "",
        platform,
        propertyFacts: facts,
        userPreferences: prefHints.length > 0 ? prefHints.map(h => ({
          key: h.preferenceKey,
          value: h.hint,
          confidence: h.confidence,
        })) : undefined,
        ...contentOptions,
      };

      let providerResult: GenerateContentResult;
      try {
        providerResult = await provider.generateContent(providerInput, request.signal);
      } catch (providerErr) {
        // Provider failed — release the reserved quota (no usage consumed)
        if (reservationId) {
          try {
            await client.rpc("release_ai_quota", {
              p_user_id: user.id,
              p_workspace_id: workspaceId,
              p_idempotency_key: idempotencyKey,
              p_reason: "provider_error",
            });
          } catch { /* best-effort release */ }
          reservationId = null;
        }
        throw providerErr;
      }

      const { output: result, usage: providerUsage, model: providerModel } = providerResult;

      // ============================================================
      // Step 8: Structured Output — validated by Provider (ContentGenerationOutputSchema)
      // Step 9: Fact verification (P3-AI-009)
      // ============================================================
      const factCheck = checkContentFacts(
        result.factsUsed ?? [],
        result.visualFactsUsed ?? [],
        // Only pass SourcePropertyFacts fields — prevents future PII leakage
        // through type widening (P1-4 fix)
        {
          title: facts.title ?? null,
          district: facts.district ?? null,
          city: facts.city ?? null,
          communityName: facts.communityName ?? null,
          rentalType: facts.rentalType ?? null,
          monthlyRent: facts.monthlyRent ?? null,
          bedrooms: facts.bedrooms ?? null,
          livingRooms: facts.livingRooms ?? null,
          bathrooms: facts.bathrooms ?? null,
          areaSqm: facts.areaSqm ?? null,
          hasElevator: facts.hasElevator ?? null,
          orientation: facts.orientation ?? null,
          decoration: facts.decoration ?? null,
          petsAllowed: facts.petsAllowed ?? null,
          cookingAllowed: facts.cookingAllowed ?? null,
          subwayText: facts.subwayText ?? null,
          facilities: Array.isArray(facts.facilities)
            ? (facts.facilities as string[])
            : null,
          tags: facts.tags ?? null,
          sellingPoints: facts.sellingPoints ?? null,
          description: facts.description ?? null,
        } satisfies SourcePropertyFacts,
      );
      // Server-side fact checker is authoritative — AI self-assessment
      // must not override fabricated-fact detection (P1 fix: ?? → ||)
      const requiresFactReview =
        result.requiresFactReview || factCheck.requiresFactReview;
      const factCheckRiskFlags = factCheck.riskFlags;

      // ============================================================
      // Step 9: Compliance scan (P3-AI-010 — deterministic, no AI/network/DB)
      // ============================================================
      const contentText = extractScanText(result, platform);
      const compliance = checkCompliance({
        contentText,
        platform,
        propertyFacts: {
          district: facts.district,
          monthlyRent: facts.monthlyRent,
          bedrooms: facts.bedrooms,
          areaSqm: facts.areaSqm,
          hasElevator: facts.hasElevator,
          petsAllowed: facts.petsAllowed,
          cookingAllowed: facts.cookingAllowed,
        },
      });

      const complianceStatus = toResponseStatus(compliance.status);
      const copyAllowed = !requiresFactReview && compliance.copyAllowed;

      // ============================================================
      // Step 10: Settle usage with actual token/cost data
      // ============================================================
      const settleStatus = complianceStatus === "blocked" ? "rejected_compliance" : "succeeded";
      const actualUsage: AIUsage = {
        inputTokens: providerUsage.inputTokens,
        outputTokens: providerUsage.outputTokens,
        estimatedCostUsd: providerUsage.estimatedCostUsd,
      };

      if (reservationId) {
        const { error: settleErr } = await client.rpc("settle_ai_quota", {
          p_user_id: user.id,
          p_workspace_id: workspaceId,
          p_idempotency_key: idempotencyKey,
          p_status: settleStatus,
          p_input_tokens: actualUsage.inputTokens,
          p_output_tokens: actualUsage.outputTokens,
          p_actual_cost_usd: actualUsage.estimatedCostUsd,
          p_model: providerModel,
          p_request_id: requestId,
          p_compliance_flags: complianceStatus !== "clean" ? { complianceStatus } : null,
        });

        if (settleErr) {
          // Log but don't fail — settlement is best-effort for succeeded requests
          console.error("[quota] settle failed:", settleErr);
        }
        reservationId = null;
      }

      // ============================================================
      // Success envelope — §10.6 full shape with real usage/model/requestId
      // ============================================================
      return jsonResponse(
        {
          data: {
            contentVersionId: null,
            platform,
            output: {
              ...result,
              requiresFactReview:
                result.requiresFactReview || factCheck.requiresFactReview,
              // Merge server-side fact-check risk flags with AI self-reported flags
              riskFlags: [
                ...(result.riskFlags ?? []),
                ...factCheckRiskFlags,
              ],
              // P3-AI-009: fact-check results nested inside output per api-contract §10.6
              factCheck: {
                fabricatedCount: factCheck.fabricatedFacts.length,
                facts: factCheck.facts.map((f) => ({
                  claim: f.claim,
                  safety: f.safety,
                  hasSource: f.hasSource,
                })),
              },
            },
            copyAllowed,
            complianceStatus,
            model: providerModel || null,
            usage: actualUsage.inputTokens > 0 || actualUsage.outputTokens > 0
              ? {
                  inputTokens: actualUsage.inputTokens,
                  outputTokens: actualUsage.outputTokens,
                  estimatedCostUsd: actualUsage.estimatedCostUsd,
                }
              : null,
            requestId,
          },
          error: null,
        },
        { status: 200, headers: h }
      );
    } catch (err) {
      // Release reservation on any unhandled error path
      if (reservationId && _idempotencyKey && _userId && _workspaceId) {
        try {
          await client.rpc("release_ai_quota", {
            p_user_id: _userId,
            p_workspace_id: _workspaceId,
            p_idempotency_key: _idempotencyKey,
            p_reason: "error_release",
          });
        } catch { /* best-effort release */ }
      }

      if (err instanceof DeepSeekProviderError) {
        if (err.code === "AI_REQUEST_ABORTED") throw err;
        const mapped = mapProviderError(err);
        return jsonResponse(
          { data: null, error: mapped.body },
          { status: mapped.status, headers: h }
        );
      }
      return jsonResponse(
        { data: null, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
        { status: 500, headers: h }
      );
    }
  };
}
