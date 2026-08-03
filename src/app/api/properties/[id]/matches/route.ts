/**
 * GET /api/properties/[id]/matches
 * List matches for a property. Requires: property_matching entitlement.
 */

import type { NextRequest } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { hasFeature } from "@/features/access-control/guards";

function urlOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost";
  return `${proto}://${host}`;
}
const cors = (o: string) => ({ "Access-Control-Allow-Origin": o, "Access-Control-Allow-Credentials": "true" });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: propertyId } = await params;
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

    const workspaceId = member.workspace_id;

    // 3. Entitlement check
    const entitled = await hasFeature("property_matching");
    if (!entitled)
      return jsonResponse(
        { data: null, error: { code: "FEATURE_NOT_ALLOWED", message: "需要 property_matching 权限" } },
        { status: 403, headers: h }
      );

    // 4. Verify property exists in workspace
    const { data: propertyExists } = await client
      .from("properties")
      .select("id")
      .eq("id", propertyId)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .single();

    if (!propertyExists)
      return jsonResponse(
        { data: null, error: { code: "RESOURCE_NOT_FOUND", message: "房源不存在" } },
        { status: 404, headers: h }
      );

    // 5. Fetch matches via RPC (ordered by score DESC, excludes archived)
    const { data: matches, error: rpcErr } = await client.rpc("get_property_matches", {
      p_property_id: propertyId,
    });

    if (rpcErr) {
      const msg = String(rpcErr.message ?? "");
      if (msg.includes("Authentication required")) {
        return jsonResponse(
          { data: null, error: { code: "UNAUTHENTICATED", message: "未登录" } },
          { status: 401, headers: h }
        );
      }
      return jsonResponse(
        { data: null, error: { code: "INTERNAL_ERROR", message: "查询失败" } },
        { status: 500, headers: h }
      );
    }

    // 6. Enrich matches with client names (NO phone/wechat)
    const enriched = [];
    if (matches && Array.isArray(matches)) {
      for (const match of matches as Array<Record<string, unknown>>) {
        const { data: clientData } = await client
          .from("clients")
          .select("name")
          .eq("id", match.client_id as string)
          .maybeSingle();

        enriched.push({
          id: match.id,
          clientId: match.client_id,
          clientName: clientData?.name ?? "未知客户",
          score: match.score,
          matchLevel: match.match_level,
          matchedReasons: match.matched_reasons,
          unmatchedReasons: match.unmatched_reasons,
          needsConfirmation: match.needs_confirmation,
          status: match.status,
          createdAt: match.created_at,
          updatedAt: match.updated_at,
        });
      }
    }

    return jsonResponse(
      { data: enriched, error: null },
      { headers: h }
    );
  } catch {
    return jsonResponse(
      { data: null, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500, headers: h }
    );
  }
}
