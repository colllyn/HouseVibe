// ============================================================
// Admin AI Models API — P3-AI-016 / P3-AI-015
// GET  /api/admin/ai-models → read circuit breaker state
// PATCH /api/admin/ai-models → force model mode (primary/fallback/auto)
// POST /api/admin/ai-models → reset circuit breaker
// ============================================================

import type { NextRequest } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { isSystemAdmin } from "@/features/access-control/guards";
import { ForceModelModeRequestSchema, ResetCircuitRequestSchema } from "@/features/ai-runtime/schemas";

// ============================================================
// GET — Read circuit breaker state for both capabilities
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

  try {
    const [textResult, visionResult] = await Promise.all([
      client.rpc("get_runtime_config", { p_capability: "text" }),
      client.rpc("get_runtime_config", { p_capability: "vision" }),
    ]);

    return jsonResponse({
      data: {
        text: textResult.data?.success ? textResult.data : null,
        vision: visionResult.data?.success ? visionResult.data : null,
      },
      error: null,
    });
  } catch (_err) {
    return jsonResponse(
      { data: null, error: { code: "INTERNAL_ERROR", message: "读取配置失败" } },
      { status: 500 },
    );
  }
}

// ============================================================
// PATCH — Force model mode
// ============================================================

export async function PATCH(request: NextRequest) {
  const { client, jsonResponse } = await createRouteHandlerClient(request);

  const admin = await isSystemAdmin();
  if (!admin) {
    return jsonResponse(
      { data: null, error: { code: "ADMIN_REQUIRED", message: "需要系统管理员权限" } },
      { status: 403 },
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

  const parsed = ForceModelModeRequestSchema.safeParse(body);
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
    const { data, error } = await client.rpc("force_model_mode", {
      p_capability: parsed.data.capability,
      p_mode: parsed.data.mode,
    });

    if (error || !data?.success) {
      const errMsg = data?.error || error?.message || "操作失败";
      const status = errMsg === "ADMIN_REQUIRED" ? 403 : 400;
      return jsonResponse(
        { data: null, error: { code: String(errMsg), message: String(errMsg) } },
        { status },
      );
    }

    return jsonResponse({ data, error: null });
  } catch (_err) {
    return jsonResponse(
      { data: null, error: { code: "INTERNAL_ERROR", message: "操作失败" } },
      { status: 500 },
    );
  }
}

// ============================================================
// POST — Reset circuit breaker (P3-AI-015)
// ============================================================

export async function POST(request: NextRequest) {
  const { client, jsonResponse } = await createRouteHandlerClient(request);

  const admin = await isSystemAdmin();
  if (!admin) {
    return jsonResponse(
      { data: null, error: { code: "ADMIN_REQUIRED", message: "需要系统管理员权限" } },
      { status: 403 },
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

  const parsed = ResetCircuitRequestSchema.safeParse(body);
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
    const { data, error } = await client.rpc("admin_reset_circuit", {
      p_capability: parsed.data.capability,
    });

    if (error || !data?.success) {
      const errMsg = data?.error || error?.message || "重置失败";
      const status = errMsg === "ADMIN_REQUIRED" ? 403 : 400;
      return jsonResponse(
        { data: null, error: { code: String(errMsg), message: String(errMsg) } },
        { status },
      );
    }

    return jsonResponse({ data, error: null });
  } catch (_err) {
    return jsonResponse(
      { data: null, error: { code: "INTERNAL_ERROR", message: "重置熔断器失败" } },
      { status: 500 },
    );
  }
}
