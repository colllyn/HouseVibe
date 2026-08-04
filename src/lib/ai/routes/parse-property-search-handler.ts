/**
 * Parse Property Search Route Handler Factory
 *
 * Extracted from the route file so Next.js only sees HTTP method exports.
 * The factory pattern enables Provider injection for testing.
 *
 * Contract: docs/contracts/ai-contract.md v2.0
 *           docs/contracts/api-contract.md §10.5
 */

import { type NextRequest } from "next/server";
import { z } from "zod";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { hasFeature } from "@/features/access-control/guards";
import { createDeepSeekTextProvider } from "@/lib/ai/providers/deepseek-text-provider";
import { DeepSeekProviderError } from "@/lib/ai/types";
import type { DeepSeekTextProvider, SearchParseInput } from "@/lib/ai/types";

// ============================================================
// Request Schema
// ============================================================

const ParseSearchRequestSchema = z
  .object({
    query: z
      .string()
      .min(1, "搜索内容不能为空")
      .max(500, "搜索内容不能超过500个字符")
      .transform((v) => v.trim())
      .pipe(z.string().min(1, "搜索内容不能为空")),
  })
  .strict();

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
      // Unreachable: handled before mapProviderError is called.
      // If reached, rethrow so the runtime handles the aborted connection.
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

// ============================================================
// Handler Factory (injectable Provider for testing)
// ============================================================

export function createParsePropertySearchHandler(
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

      // 3. Entitlement check — must be semantic_search, NOT property_matching
      const entitled = await hasFeature("semantic_search");
      if (!entitled) {
        return jsonResponse(
          {
            data: null,
            error: {
              code: "FEATURE_NOT_ALLOWED",
              message: "需要 semantic_search 功能授权",
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

      const parsed = ParseSearchRequestSchema.safeParse(body);
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

      const { query } = parsed.data;

      // 6. Call Provider — only pass trimmed query, never workspaceId/userId/PII
      const provider = getProvider();
      const providerInput: SearchParseInput = {
        query,
        requestId: crypto.randomUUID(),
        promptVersion: "1.0",
        modelName: "deepseek-v4-flash",
      };

      const filters = await provider.parsePropertySearch(providerInput);

      // 7. Success — return only filters (not raw provider response)
      return jsonResponse(
        { data: { filters }, error: null },
        { status: 200, headers: h }
      );
    } catch (err) {
      if (err instanceof DeepSeekProviderError) {
        // AI_REQUEST_ABORTED: connection already closed by client.
        // Rethrow so Next.js / the runtime can abort response streaming.
        // Do NOT return a Response, do NOT log query/prompt/raw response.
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
