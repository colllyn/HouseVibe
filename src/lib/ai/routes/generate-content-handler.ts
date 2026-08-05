/**
 * Generate Content Route Handler Factory
 *
 * Generates platform-specific content (xiaohongshu, douyin, wechat_moments)
 * from safe property facts. Requires: content_factory entitlement.
 *
 * Contract: docs/contracts/ai-contract.md v2.0
 *           docs/contracts/api-contract.md §10.6
 *
 * Reuses the same security architecture as other AI routes:
 * Auth → Workspace → Entitlement → Schema → PII redaction → Provider → Envelope
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
} from "@/lib/ai/types";

// ============================================================
// Request Schema — safe property facts only, no PII
// ============================================================

const redactedPropertyFactsSchema = z.object({
  title: z.string().max(200).optional(),
  city: z.string().max(50).optional(),
  district: z.string().max(50).optional(),
  businessArea: z.string().max(100).optional(),
  communityName: z.string().max(100).optional(),
  addressText: z.string().max(200).optional(),
  rentalType: z.string().max(50).optional(),
  monthlyRent: z.number().min(0).optional(),
  depositTerms: z.string().max(200).optional(),
  bedrooms: z.number().int().min(0).optional(),
  livingRooms: z.number().int().min(0).optional(),
  bathrooms: z.number().int().min(0).optional(),
  areaSqm: z.number().min(0).optional(),
  hasElevator: z.boolean().optional(),
  orientation: z.string().max(50).optional(),
  decoration: z.string().max(100).optional(),
  availableFrom: z.string().max(50).optional(),
  minimumLeaseMonths: z.number().int().min(0).optional(),
  petsAllowed: z.boolean().optional(),
  cookingAllowed: z.boolean().optional(),
  subwayText: z.string().max(200).optional(),
  facilities: z.unknown().optional(),
  tags: z.array(z.string().max(100)).max(20).optional(),
  sellingPoints: z.array(z.string().max(200)).max(20).optional(),
  drawbacks: z.array(z.string().max(200)).max(20).optional(),
  description: z.string().max(2000).optional(),
});

const GenerateContentRequestSchema = z
  .object({
    platform: z.enum(["xiaohongshu", "douyin", "wechat_moments"]),
    propertyFacts: redactedPropertyFactsSchema,
    targetAudience: z.string().max(200).optional(),
    contentAngle: z.string().max(200).optional(),
    contentGoal: z.string().max(200).optional(),
    tone: z.string().max(100).optional(),
    videoDurationSeconds: z.number().int().min(0).max(600).optional(),
    isOnCamera: z.boolean().optional(),
    showDrawbacks: z.boolean().optional(),
    privateMessageKeyword: z.string().max(50).optional(),
  })
  .strict();

// ============================================================
// Response type (GeneratedContent is the provider output)
// ============================================================

type SafeContentResult = GeneratedContent;

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
        body: {
          code: "AI_NOT_CONFIGURED",
          message: "AI 服务未配置，请联系管理员",
        },
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
        body: {
          code: "AI_INVALID_RESPONSE",
          message: "AI 内容生成异常，请重试",
        },
      };
    case "AI_REQUEST_ABORTED":
      throw err;
  }
}

// ============================================================
// Helper
// ============================================================

function urlOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host =
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    "localhost";
  return `${proto}://${host}`;
}

/** Strip provider metadata from result before returning to client. */
function sanitizeResult(result: GeneratedContent): SafeContentResult {
  return result;
}

// ============================================================
// Handler Factory
// ============================================================

export function createGenerateContentHandler(
  providerFactory?: () => DeepSeekTextProvider
) {
  const getProvider =
    providerFactory ?? (() => createDeepSeekTextProvider());

  return async function POST(request: NextRequest) {
    const origin = urlOrigin(request);
    const h = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
    };

    const { client, jsonResponse } = await createRouteHandlerClient(request);

    try {
      // 1. Authentication
      const {
        data: { user },
      } = await client.auth.getUser();
      if (!user) {
        return jsonResponse(
          {
            data: null,
            error: { code: "UNAUTHENTICATED", message: "未登录" },
          },
          { status: 401, headers: h }
        );
      }

      // 2. Workspace membership
      const { data: member } = await client
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1)
        .single();

      if (!member) {
        return jsonResponse(
          {
            data: null,
            error: {
              code: "WORKSPACE_ACCESS_DENIED",
              message: "无工作区权限",
            },
          },
          { status: 403, headers: h }
        );
      }

      // 3. Entitlement check — must be content_factory
      const entitled = await hasFeature("content_factory");
      if (!entitled) {
        return jsonResponse(
          {
            data: null,
            error: {
              code: "CONTENT_FACTORY_NOT_ALLOWED",
              message: "需要 content_factory 功能授权",
            },
          },
          { status: 403, headers: h }
        );
      }

      // 4. Content-Type validation
      const contentType = request.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        return jsonResponse(
          {
            data: null,
            error: {
              code: "VALIDATION_FAILED",
              message: "请求格式必须为 JSON",
            },
          },
          { status: 422, headers: h }
        );
      }

      // 5. Body parsing and validation
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return jsonResponse(
          {
            data: null,
            error: {
              code: "VALIDATION_FAILED",
              message: "请求体不是有效的 JSON",
            },
          },
          { status: 422, headers: h }
        );
      }

      const parsed = GenerateContentRequestSchema.safeParse(body);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        const msg = first
          ? `${first.path.join(".")}: ${first.message}`
          : "请求参数无效";
        return jsonResponse(
          { data: null, error: { code: "VALIDATION_FAILED", message: msg } },
          { status: 422, headers: h }
        );
      }

      const { platform, propertyFacts, ...contentOptions } = parsed.data;

      // 6. Server-side PII redaction on free-text fields (description, addressText)
      let safeDescription = propertyFacts.description;
      let safeAddressText = propertyFacts.addressText;

      if (safeDescription) {
        const redaction = redactPropertyInput(safeDescription);
        if (!redaction.safeToSend) {
          return jsonResponse(
            {
              data: null,
              error: {
                code: "VALIDATION_FAILED",
                message: "房源描述包含过多个人隐私信息，请移除后再试",
              },
            },
            { status: 422, headers: h }
          );
        }
        safeDescription = redaction.redactedText;
      }

      if (safeAddressText) {
        const redaction = redactPropertyInput(safeAddressText);
        safeAddressText = redaction.safeToSend
          ? redaction.redactedText
          : undefined; // drop if pure PII
      }

      // 7. Call Provider with safe facts — narrow DTO, no identity
      const provider = getProvider();
      const providerInput: ContentGenerationInput = {
        requestId: crypto.randomUUID(),
        promptVersion: "1.0.0",
        modelName: "",
        platform,
        propertyFacts: {
          ...propertyFacts,
          description: safeDescription,
          addressText: safeAddressText,
        },
        ...contentOptions,
      };

      const result = await provider.generateContent(
        providerInput,
        request.signal
      );

      // 8. Success — return content
      return jsonResponse(
        { data: { content: sanitizeResult(result) }, error: null },
        { status: 200, headers: h }
      );
    } catch (err) {
      if (err instanceof DeepSeekProviderError) {
        if (err.code === "AI_REQUEST_ABORTED") {
          throw err;
        }

        const mapped = mapProviderError(err);
        return jsonResponse(
          { data: null, error: mapped.body },
          { status: mapped.status, headers: h }
        );
      }

      return jsonResponse(
        {
          data: null,
          error: { code: "INTERNAL_ERROR", message: "服务器错误" },
        },
        { status: 500, headers: h }
      );
    }
  };
}
