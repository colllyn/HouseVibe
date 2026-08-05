/**
 * Generate Content Route Handler Factory
 *
 * Generates platform-specific marketing content (xiaohongshu, douyin, wechat_moments)
 * from a server-verified property. Requires: content_factory entitlement.
 *
 * Contract: docs/contracts/ai-contract.md v2.0 §2.2, §16
 *           docs/contracts/api-contract.md §10.6
 *
 * Pipeline: Auth → Workspace → Entitlement → Schema → Load Property →
 *           Quota Reserve → PII Redact → Provider → Fact Verify →
 *           Compliance Scan → Usage Settle → Envelope
 *
 * Dependencies: P3-AI-014 (quota RPC), P3-AI-010 (compliance module).
 * These steps are structural; full enforcement activates when dependencies land.
 */

import { type NextRequest } from "next/server";
import { z } from "zod";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { hasFeature } from "@/features/access-control/guards";
import { createDeepSeekTextProvider } from "@/lib/ai/providers/deepseek-text-provider";
import { DeepSeekProviderError } from "@/lib/ai/types";
import { redactPropertyInput } from "@/lib/ai/privacy/redact-property-input";
import type {
  DeepSeekTextProvider,
  ContentGenerationInput,
  GeneratedContent,
  RedactedPropertyFacts,
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
// Response type — §10.6 full envelope
// ============================================================

interface ContentGenerationResponse {
  contentVersionId: null;
  platform: string;
  output: GeneratedContent;
  copyAllowed: boolean;
  complianceStatus: "clean" | "pending" | "review" | "blocked";
  model: null;
  usage: null;
  requestId: null;
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

    try {
      // Step 1: Authentication
      const { data: { user } } = await client.auth.getUser();
      if (!user) {
        return jsonResponse(
          { data: null, error: { code: "UNAUTHENTICATED", message: "未登录" } },
          { status: 401, headers: h }
        );
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
        return jsonResponse(
          { data: null, error: { code: "WORKSPACE_ACCESS_DENIED", message: "无工作区权限" } },
          { status: 403, headers: h }
        );
      }

      const workspaceId: string = member.workspace_id;

      // Step 2b: Entitlement — content_factory
      const entitled = await hasFeature("content_factory");
      if (!entitled) {
        return jsonResponse(
          { data: null, error: { code: "CONTENT_FACTORY_NOT_ALLOWED", message: "需要 content_factory 功能授权" } },
          { status: 403, headers: h }
        );
      }

      // Step 2c: Content-Type validation
      const contentType = request.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        return jsonResponse(
          { data: null, error: { code: "VALIDATION_FAILED", message: "请求格式必须为 JSON" } },
          { status: 422, headers: h }
        );
      }

      // Step 2d: Body parsing
      let body: unknown;
      try { body = await request.json(); } catch {
        return jsonResponse(
          { data: null, error: { code: "VALIDATION_FAILED", message: "请求体不是有效的 JSON" } },
          { status: 422, headers: h }
        );
      }

      const parsed = GenerateContentRequestSchema.safeParse(body);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        const msg = first ? `${first.path.join(".")}: ${first.message}` : "请求参数无效";
        return jsonResponse(
          { data: null, error: { code: "VALIDATION_FAILED", message: msg } },
          { status: 422, headers: h }
        );
      }

      const { propertyId, platform, idempotencyKey, ...contentOptions } = parsed.data;

      // Step 3: Load property from DB — verify ownership + marketing_reuse
      const { data: property, error: propErr } = await client
        .from("properties")
        .select("*")
        .eq("id", propertyId)
        .is("deleted_at", null)
        .single();

      if (propErr || !property) {
        return jsonResponse(
          { data: null, error: { code: "RESOURCE_NOT_FOUND", message: "房源不存在" } },
          { status: 404, headers: h }
        );
      }

      const p = DbPropertyRowSchema.parse(property);

      // Must belong to workspace OR be shared with marketing_reuse
      const isOwn = p.workspace_id === workspaceId;
      const isReusable = p.is_shared && p.allow_marketing_reuse;
      if (!isOwn && !isReusable) {
        return jsonResponse(
          { data: null, error: { code: "PROPERTY_NOT_MARKETING_REUSABLE", message: "房源未授权营销复用" } },
          { status: 403, headers: h }
        );
      }

      // Step 4: Atomic quota reservation (P3-AI-014 — structural; enforced when RPC lands)
      // In test mock: RPC returns success. In production without RPC: returns structured error.
      const { error: quotaErr } = await client.rpc("reserve_ai_quota", {
        _user_id: user.id,
        _feature: "content_factory",
        _estimated_tokens: 4096,
        _idempotency_key: idempotencyKey,
      });

      if (quotaErr) {
        return jsonResponse(
          { data: null, error: { code: "QUOTA_EXCEEDED", message: "AI 配额已用完，请明天再试" } },
          { status: 429, headers: h }
        );
      }

      // Step 5: Privacy — redact DB-loaded property free-text fields
      const facts = dbPropertyToRedactedFacts(p);
      if (facts.description) {
        const redaction = redactPropertyInput(facts.description);
        if (!redaction.safeToSend) {
          return jsonResponse(
            { data: null, error: { code: "COMPLIANCE_BLOCKED", message: "房源描述包含过多隐私信息，内容生成被拒绝" } },
            { status: 422, headers: h }
          );
        }
        facts.description = redaction.redactedText;
      }
      if (facts.addressText) {
        const redaction = redactPropertyInput(facts.addressText);
        facts.addressText = redaction.safeToSend ? redaction.redactedText : undefined;
      }

      // Step 6: Model call — narrow DTO, no identity
      const provider = getProvider();
      const providerInput: ContentGenerationInput = {
        requestId: crypto.randomUUID(),
        promptVersion: "1.0.0",
        modelName: "",
        platform,
        propertyFacts: facts,
        ...contentOptions,
      };

      const result = await provider.generateContent(providerInput, request.signal);

      // Step 7: Structured Output — validated by Provider (ContentGenerationOutputSchema)

      // Step 8: Fact verification (P3-AI-009 — structural; output validated by Provider Schema)
      const requiresFactReview = result.requiresFactReview ?? false;

      // Step 9: Compliance scan (P3-AI-010 — "pending" until compliance module lands)
      const complianceStatus: ContentGenerationResponse["complianceStatus"] = "pending";
      const copyAllowed = !requiresFactReview;

      // Step 10: Usage settlement — deferred (no ai_usage_logs until quota RPC is real)
      // Response excludes actual token counts until settlement is implemented

      // Success envelope — §10.6 full shape
      return jsonResponse(
        {
          data: {
            contentVersionId: null,
            platform,
            output: result,
            copyAllowed,
            complianceStatus,
            model: null,
            usage: null,
            requestId: null,
          },
          error: null,
        },
        { status: 200, headers: h }
      );
    } catch (err) {
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
