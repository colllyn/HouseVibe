// ============================================================
// Admin AI Usage — User Management API — P3-AI-017
// PATCH /api/admin/ai-usage/users/[userId] → set user AI limits
// POST  /api/admin/ai-usage/users/[userId] → restore access
// System admin only.
// ============================================================

import type { NextRequest } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { isSystemAdmin } from "@/features/access-control/guards";
import { UpdateUserLimitsSchema } from "@/features/ai-usage/schemas";

interface RouteParams {
  params: Promise<{ userId: string }>;
}

// ============================================================
// PATCH — Update user AI limits
// ============================================================

export async function PATCH(
  request: NextRequest,
  { params }: RouteParams,
) {
  const { client, jsonResponse } = await createRouteHandlerClient(request);

  const admin = await isSystemAdmin();
  if (!admin) {
    return jsonResponse(
      { data: null, error: { code: "ADMIN_REQUIRED", message: "需要系统管理员权限" } },
      { status: 403 },
    );
  }

  const { userId } = await params;

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(userId)) {
    return jsonResponse(
      { data: null, error: { code: "INVALID_USER_ID", message: "无效的用户 ID" } },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(
      { data: null, error: { code: "INVALID_JSON", message: "请求体格式无效" } },
      { status: 400 },
    );
  }

  const parsed = UpdateUserLimitsSchema.safeParse(body);
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

  try {
    const { data, error } = await client.rpc("admin_upsert_user_limits", {
      p_user_id: userId,
      p_daily_request_limit: parsed.data.daily_request_limit ?? null,
      p_daily_cost_limit_usd: parsed.data.daily_cost_limit_usd ?? null,
    });

    if (error || !data?.success) {
      return jsonResponse(
        { data: null, error: { code: "UPDATE_FAILED", message: error?.message ?? "更新失败" } },
        { status: 400 },
      );
    }

    return jsonResponse({ data, error: null });
  } catch (_err) {
    return jsonResponse(
      { data: null, error: { code: "INTERNAL_ERROR", message: "更新失败" } },
      { status: 500 },
    );
  }
}

// ============================================================
// POST — Restore user AI access (from blocked state)
// ============================================================

export async function POST(
  request: NextRequest,
  { params }: RouteParams,
) {
  const { client, jsonResponse } = await createRouteHandlerClient(request);

  const admin = await isSystemAdmin();
  if (!admin) {
    return jsonResponse(
      { data: null, error: { code: "ADMIN_REQUIRED", message: "需要系统管理员权限" } },
      { status: 403 },
    );
  }

  const { userId } = await params;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(userId)) {
    return jsonResponse(
      { data: null, error: { code: "INVALID_USER_ID", message: "无效的用户 ID" } },
      { status: 400 },
    );
  }

  try {
    const { data, error } = await client.rpc("admin_restore_user_access", {
      p_user_id: userId,
    });

    if (error || !data?.success) {
      return jsonResponse(
        { data: null, error: { code: "RESTORE_FAILED", message: error?.message ?? "恢复失败" } },
        { status: 400 },
      );
    }

    return jsonResponse({ data, error: null });
  } catch (_err) {
    return jsonResponse(
      { data: null, error: { code: "INTERNAL_ERROR", message: "恢复失败" } },
      { status: 500 },
    );
  }
}
