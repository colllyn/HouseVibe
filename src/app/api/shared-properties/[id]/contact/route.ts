import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { ContactSharedPropertyInputSchema } from "@/features/collaboration/schemas";
import type { NextRequest } from "next/server";

function urlOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost";
  return `${proto}://${host}`;
}
const cors = (o: string) => ({ "Access-Control-Allow-Origin": o, "Access-Control-Allow-Credentials": "true" });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const origin = urlOrigin(request);
  const h = cors(origin);
  const { client, jsonResponse } = await createRouteHandlerClient(request);

  try {
    // 1. Auth
    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      return jsonResponse(
        { data: null, error: { code: "UNAUTHENTICATED", message: "未登录" } },
        { status: 401, headers: h }
      );
    }

    // 2. Workspace membership (requester)
    const { data: member } = await client
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .single();
    if (!member) {
      return jsonResponse(
        { data: null, error: { code: "WORKSPACE_ACCESS_DENIED", message: "无权限" } },
        { status: 403, headers: h }
      );
    }

    const requesterWorkspaceId = member.workspace_id;

    // 3. Feature entitlement check: shared_property_pool
    const { data: entitlement } = await client
      .from("feature_entitlements")
      .select("id, expires_at")
      .eq("user_id", user.id)
      .eq("feature", "shared_property_pool")
      .eq("status", "active")
      .maybeSingle();

    if (!entitlement) {
      return jsonResponse(
        { data: null, error: { code: "FEATURE_NOT_ALLOWED", message: "共享房源池功能未授权" } },
        { status: 403, headers: h }
      );
    }

    if (entitlement.expires_at && new Date(entitlement.expires_at) <= new Date()) {
      return jsonResponse(
        { data: null, error: { code: "FEATURE_EXPIRED", message: "共享房源池功能已过期" } },
        { status: 403, headers: h }
      );
    }

    // 4. Verify property exists and is shared
    const { data: property } = await client
      .from("properties")
      .select("id, workspace_id, is_shared, title")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (!property) {
      return jsonResponse(
        { data: null, error: { code: "NOT_FOUND", message: "房源不存在" } },
        { status: 404, headers: h }
      );
    }

    if (!property.is_shared) {
      return jsonResponse(
        { data: null, error: { code: "NOT_SHARED", message: "该房源未共享" } },
        { status: 400, headers: h }
      );
    }

    // 5. Prevent self-request
    if (property.workspace_id === requesterWorkspaceId) {
      return jsonResponse(
        { data: null, error: { code: "SELF_REQUEST", message: "不能对自己的房源发起协作请求" } },
        { status: 400, headers: h }
      );
    }

    // 6. Parse body
    const body = await request.json();
    const parsed = ContactSharedPropertyInputSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const msg = first ? `${first.path.join(".")}: ${first.message}` : "请求参数无效";
      return jsonResponse(
        { data: null, error: { code: "VALIDATION_FAILED", message: msg } },
        { status: 422, headers: h }
      );
    }

    const input = parsed.data;

    // 7. Check for existing pending request (idempotency)
    const { data: existingReq } = await client
      .from("collaboration_requests")
      .select("id")
      .eq("property_id", id)
      .eq("requester_workspace_id", requesterWorkspaceId)
      .eq("status", "pending")
      .maybeSingle();

    if (existingReq) {
      return jsonResponse(
        { data: null, error: { code: "DUPLICATE_REQUEST", message: "已存在待处理的协作请求" } },
        { status: 409, headers: h }
      );
    }

    // 8. Create collaboration request
    const now = new Date().toISOString();
    const { data: newRequest, error: insertErr } = await client
      .from("collaboration_requests")
      .insert({
        requester_workspace_id: requesterWorkspaceId,
        owner_workspace_id: property.workspace_id,
        property_id: id,
        message: input.message,
        status: "pending",
        requested_at: now,
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();

    if (insertErr) {
      return jsonResponse(
        { data: null, error: { code: "INTERNAL_ERROR", message: "创建协作请求失败" } },
        { status: 500, headers: h }
      );
    }

    return jsonResponse(
      {
        data: {
          collaborationRequestId: newRequest.id,
          status: "pending",
        },
        error: null,
      },
      { status: 201, headers: h }
    );
  } catch {
    return jsonResponse(
      { data: null, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500, headers: h }
    );
  }
}
