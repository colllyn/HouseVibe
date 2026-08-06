// ============================================================
// Admin AI Usage API — P3-AI-017
// GET /api/admin/ai-usage → aggregated usage stats
// System admin only.
// ============================================================

import type { NextRequest } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { isSystemAdmin } from "@/features/access-control/guards";
import { UsageQuerySchema, UsageSummarySchema } from "@/features/ai-usage/schemas";

// ============================================================
// GET — Aggregated AI usage statistics
// ============================================================

export async function GET(request: NextRequest) {
  const { client, jsonResponse } = await createRouteHandlerClient(request);

  const admin = await isSystemAdmin();
  if (!admin) {
    return jsonResponse(
      { data: null, error: { code: "ADMIN_REQUIRED", message: "需要系统管理员权限" } },
      { status: 403 },
    );
  }

  // Parse query params
  const url = new URL(request.url);
  const rawParams = {
    period: url.searchParams.get("period") ?? undefined,
    groupBy: url.searchParams.get("groupBy") ?? undefined,
  };

  const parsed = UsageQuerySchema.safeParse(rawParams);
  if (!parsed.success) {
    return jsonResponse(
      {
        data: null,
        error: {
          code: "VALIDATION_FAILED",
          message: parsed.error.issues.map((i) => i.message).join("; "),
        },
      },
      { status: 400 },
    );
  }

  const { period, groupBy } = parsed.data;

  try {
    const { data, error } = await client.rpc("admin_get_ai_usage_stats", {
      p_period: period,
      p_group_by: groupBy,
    });

    if (error || !data) {
      return jsonResponse(
        { data: null, error: { code: "INTERNAL_ERROR", message: error?.message ?? "查询失败" } },
        { status: 500 },
      );
    }

    // Validate RPC response against contract schema
    const validated = UsageSummarySchema.safeParse(data);
    if (!validated.success) {
      return jsonResponse(
        {
          data: null,
          error: {
            code: "INTERNAL_ERROR",
            message: "响应格式异常",
          },
        },
        { status: 500 },
      );
    }

    return jsonResponse({ data: validated.data, error: null });
  } catch (_err) {
    return jsonResponse(
      { data: null, error: { code: "INTERNAL_ERROR", message: "查询失败" } },
      { status: 500 },
    );
  }
}
