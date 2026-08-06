/**
 * AI User Preferences — Delete/Toggle API
 * P3-AI-013
 *
 * DELETE /api/me/ai-preferences/[id] — Delete a preference
 * PATCH  /api/me/ai-preferences/[id] — Toggle preference status (active/disabled)
 *
 * Auth: required
 * Workspace: required
 * Ownership: user can only manage their own preferences
 */

import { type NextRequest } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import {
  deletePreference,
  togglePreference,
} from "@/features/ai-preferences/preference-engine";
import { TogglePreferenceRequestSchema } from "@/features/ai-preferences/schemas";

// ============================================================
// Helpers
// ============================================================

function urlOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host =
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    "localhost";
  return `${proto}://${host}`;
}

const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Credentials": "true",
});

// ============================================================
// DELETE /api/me/ai-preferences/[id]
// ============================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const origin = urlOrigin(request);
  const h = corsHeaders(origin);
  const { client, jsonResponse } = await createRouteHandlerClient(request);

  try {
    // 1. Auth
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) {
      return jsonResponse(
        { data: null, error: { code: "UNAUTHENTICATED", message: "未登录" } },
        { status: 401, headers: h },
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
          error: { code: "WORKSPACE_ACCESS_DENIED", message: "无权限" },
        },
        { status: 403, headers: h },
      );
    }

    // 3. Delete (ownership verified in helper)
    const deleted = await deletePreference(client, user.id, id);
    if (!deleted) {
      return jsonResponse(
        {
          data: null,
          error: {
            code: "NOT_FOUND",
            message: "偏好不存在或无权操作",
          },
        },
        { status: 404, headers: h },
      );
    }

    return jsonResponse(
      { data: { id, deleted: true }, error: null },
      { status: 200, headers: h },
    );
  } catch {
    return jsonResponse(
      {
        data: null,
        error: { code: "INTERNAL_ERROR", message: "服务器错误" },
      },
      { status: 500, headers: h },
    );
  }
}

// ============================================================
// PATCH /api/me/ai-preferences/[id]
// ============================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const origin = urlOrigin(request);
  const h = corsHeaders(origin);
  const { client, jsonResponse } = await createRouteHandlerClient(request);

  try {
    // 1. Auth
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) {
      return jsonResponse(
        { data: null, error: { code: "UNAUTHENTICATED", message: "未登录" } },
        { status: 401, headers: h },
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
          error: { code: "WORKSPACE_ACCESS_DENIED", message: "无权限" },
        },
        { status: 403, headers: h },
      );
    }

    // 3. Parse and validate body
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
        { status: 400, headers: h },
      );
    }

    const parsed = TogglePreferenceRequestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonResponse(
        {
          data: null,
          error: {
            code: "VALIDATION_FAILED",
            message: parsed.error.issues[0]?.message ?? "参数无效",
          },
        },
        { status: 400, headers: h },
      );
    }

    // 4. Toggle preference (ownership verified in helper)
    const updated = await togglePreference(
      client,
      user.id,
      id,
      parsed.data.status,
    );
    if (!updated) {
      return jsonResponse(
        {
          data: null,
          error: {
            code: "NOT_FOUND",
            message: "偏好不存在或无权操作",
          },
        },
        { status: 404, headers: h },
      );
    }

    return jsonResponse(
      { data: updated, error: null },
      { status: 200, headers: h },
    );
  } catch {
    return jsonResponse(
      {
        data: null,
        error: { code: "INTERNAL_ERROR", message: "服务器错误" },
      },
      { status: 500, headers: h },
    );
  }
}
