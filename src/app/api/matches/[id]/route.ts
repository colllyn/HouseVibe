/**
 * PATCH /api/matches/[id]
 * Update match status (dismiss/archive). Requires: property_matching entitlement.
 */

import type { NextRequest } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { hasFeature } from "@/features/access-control/guards";
import { MatchStatusEnum } from "@/features/matching/schemas";
import { z } from "zod";

function urlOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost";
  return `${proto}://${host}`;
}
const cors = (o: string) => ({ "Access-Control-Allow-Origin": o, "Access-Control-Allow-Credentials": "true" });

const UpdateMatchStatusSchema = z.object({
  status: MatchStatusEnum,
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: matchId } = await params;
  const origin = urlOrigin(request);
  const h = cors(origin);
  const { client, jsonResponse } = await createRouteHandlerClient(request);

  try {
    // 1. Auth
    const { data: { user } } = await client.auth.getUser();
    if (!user)
      return jsonResponse(
        { data: null, error: { code: "UNAUTHENTICATED", message: "未登录" } },
        { status: 401, headers: h }
      );

    // 2. Workspace membership
    const { data: member } = await client
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .single();
    if (!member)
      return jsonResponse(
        { data: null, error: { code: "WORKSPACE_ACCESS_DENIED", message: "无权限" } },
        { status: 403, headers: h }
      );

    // 3. Entitlement check
    const entitled = await hasFeature("property_matching");
    if (!entitled)
      return jsonResponse(
        { data: null, error: { code: "FEATURE_NOT_ALLOWED", message: "需要 property_matching 权限" } },
        { status: 403, headers: h }
      );

    // 4. Parse body
    const body = await request.json();
    const parsed = UpdateMatchStatusSchema.safeParse(body);
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

    const { status: newStatus } = parsed.data;

    // 5. Verify match exists and belongs to workspace
    const { data: matchRow, error: matchErr } = await client
      .from("property_matches")
      .select("id, workspace_id, status")
      .eq("id", matchId)
      .single();

    if (matchErr || !matchRow) {
      return jsonResponse(
        { data: null, error: { code: "RESOURCE_NOT_FOUND", message: "匹配记录不存在" } },
        { status: 404, headers: h }
      );
    }

    if (matchRow.workspace_id !== member.workspace_id) {
      return jsonResponse(
        { data: null, error: { code: "WORKSPACE_ACCESS_DENIED", message: "无权限" } },
        { status: 403, headers: h }
      );
    }

    // 6. No-op check
    if (matchRow.status === newStatus) {
      return jsonResponse(
        { data: matchRow, error: null },
        { headers: h }
      );
    }

    // 7. Call RPC for validated state transition + audit
    const { data: result, error: rpcErr } = await client.rpc("update_match_status", {
      p_match_id: matchId,
      p_new_status: newStatus,
    });

    if (rpcErr) {
      const msg = String(rpcErr.message ?? "");
      if (msg.includes("Authentication required")) {
        return jsonResponse(
          { data: null, error: { code: "UNAUTHENTICATED", message: "未登录" } },
          { status: 401, headers: h }
        );
      }
      if (msg.includes("not allowed")) {
        return jsonResponse(
          { data: null, error: { code: "VALIDATION_FAILED", message: "不允许的状态转换" } },
          { status: 422, headers: h }
        );
      }
      if (msg.includes("not found")) {
        return jsonResponse(
          { data: null, error: { code: "RESOURCE_NOT_FOUND", message: "匹配记录不存在" } },
          { status: 404, headers: h }
        );
      }
      return jsonResponse(
        { data: null, error: { code: "INTERNAL_ERROR", message: "状态更新失败" } },
        { status: 500, headers: h }
      );
    }

    return jsonResponse(
      { data: result as Record<string, unknown>, error: null },
      { headers: h }
    );
  } catch {
    return jsonResponse(
      { data: null, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500, headers: h }
    );
  }
}
