// ============================================================
// Admin AI Corrections API — P3-AI-019
// GET /api/admin/ai-corrections → aggregated correction stats
// System admin only.
// ============================================================

import type { NextRequest } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { isSystemAdmin } from "@/features/access-control/guards";
import { CorrectionsQuerySchema, CorrectionsSummarySchema } from "@/features/ai-corrections/schemas";

// ============================================================
// GET — Aggregated AI correction statistics
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
  const rawParams: Record<string, string | undefined> = {
    feature: url.searchParams.get("feature") ?? undefined,
    days: url.searchParams.get("days") ?? undefined,
  };

  const parsed = CorrectionsQuerySchema.safeParse(rawParams);
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

  const { feature, days } = parsed.data;

  try {
    const { data, error } = await client.rpc("admin_get_ai_corrections_stats", {
      p_feature: feature ?? null,
      p_days: days,
    });

    if (error || !data) {
      return jsonResponse(
        { data: null, error: { code: "INTERNAL_ERROR", message: error?.message ?? "查询失败" } },
        { status: 500 },
      );
    }

    // Validate RPC response against contract schema
    const validated = CorrectionsSummarySchema.safeParse(data);
    if (!validated.success) {
      return jsonResponse(
        { data: null, error: { code: "INTERNAL_ERROR", message: "响应格式异常" } },
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
