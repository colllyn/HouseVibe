/**
 * Extract Property Route Handler Factory
 *
 * Extracted from the route file so Next.js only sees HTTP method exports.
 * The factory pattern enables Provider injection for testing.
 *
 * Contract: docs/contracts/ai-contract.md v2.0
 *           docs/contracts/api-contract.md §10.2
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
  PropertyExtractionInput,
  PropertyExtractionResult,
} from "@/lib/ai/types";

// ============================================================
// Request Schema
// ============================================================

const ExtractPropertyRequestSchema = z
  .object({
    text: z
      .string()
      .min(1, "提取文本不能为空")
      .max(5000, "提取文本不能超过5000个字符")
      .transform((v) => v.trim())
      .pipe(z.string().min(1, "提取文本不能为空")),
    sourceType: z
      .enum(["text", "speech", "wechat"])
      .default("text"),
  })
  .strict();

// ============================================================
// Response type (provider output minus usage)
// ============================================================

type SafeExtractionResult = Omit<PropertyExtractionResult, "usage">;

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
          message: "AI 解析结果异常，请重试",
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

/** Strip usage from provider result before returning to client. */
function sanitizeResult(result: PropertyExtractionResult): SafeExtractionResult {
  const { usage: _usage, ...safe } = result;
  return safe;
}

// ============================================================
// Handler Factory (injectable Provider for testing)
// ============================================================

export function createExtractPropertyHandler(
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

      // 3. Entitlement check — must be ai_data_extraction
      const entitled = await hasFeature("ai_data_extraction");
      if (!entitled) {
        return jsonResponse(
          {
            data: null,
            error: {
              code: "FEATURE_NOT_ALLOWED",
              message: "需要 ai_data_extraction 功能授权",
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

      const parsed = ExtractPropertyRequestSchema.safeParse(body);
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

      const { text, sourceType } = parsed.data;

      // 6. Server-side PII redaction — strips contacts, IDs, exact addresses, keys
      const redaction = redactPropertyInput(text);
      if (!redaction.safeToSend) {
        return jsonResponse(
          {
            data: null,
            error: {
              code: "VALIDATION_FAILED",
              message: "输入包含过多个人隐私信息，请移除后再试",
            },
          },
          { status: 422, headers: h }
        );
      }

      // 7. Call Provider with REDACTED text — never send raw PII
      const provider = getProvider();
      const providerInput: PropertyExtractionInput = {
        text: redaction.redactedText,
        sourceType,
        userId: user.id,
        workspaceId: member.workspace_id,
        requestId: crypto.randomUUID(),
        promptVersion: "1.0",
        modelName: "deepseek-v4-flash",
      };

      const result = await provider.extractProperty(
        providerInput,
        request.signal
      );

      // 8. Success — strip usage, return extraction
      return jsonResponse(
        { data: { extraction: sanitizeResult(result) }, error: null },
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
