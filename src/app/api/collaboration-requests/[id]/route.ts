import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { RespondCollaborationRequestSchema } from "@/features/collaboration/schemas";
import type { NextRequest } from "next/server";

function urlOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost";
  return `${proto}://${host}`;
}
const cors = (o: string) => ({ "Access-Control-Allow-Origin": o, "Access-Control-Allow-Credentials": "true" });

export async function PATCH(
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
        { data: null, error: { code: "WORKSPACE_ACCESS_DENIED", message: "无权限" } },
        { status: 403, headers: h }
      );
    }

    const workspaceId = member.workspace_id;

    // 3. Find the request — must belong to this workspace as owner
    const { data: collabReq } = await client
      .from("collaboration_requests")
      .select("*")
      .eq("id", id)
      .eq("owner_workspace_id", workspaceId)
      .single();

    if (!collabReq) {
      return jsonResponse(
        { data: null, error: { code: "NOT_FOUND", message: "协作请求不存在" } },
        { status: 404, headers: h }
      );
    }

    if (collabReq.status !== "pending") {
      return jsonResponse(
        { data: null, error: { code: "INVALID_STATE", message: "该请求已处理，无法再次操作" } },
        { status: 400, headers: h }
      );
    }

    // 4. Parse body
    const body = await request.json();
    const parsed = RespondCollaborationRequestSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const msg = first ? `${first.path.join(".")}: ${first.message}` : "请求参数无效";
      return jsonResponse(
        { data: null, error: { code: "VALIDATION_FAILED", message: msg } },
        { status: 422, headers: h }
      );
    }

    const { action } = parsed.data;
    const now = new Date().toISOString();
    const newStatus = action === "accept" ? "accepted" : "rejected";

    // 5. Update the request
    const { error: updateErr } = await client
      .from("collaboration_requests")
      .update({
        status: newStatus,
        responded_at: now,
        updated_at: now,
      })
      .eq("id", id)
      .eq("owner_workspace_id", workspaceId);

    if (updateErr) {
      return jsonResponse(
        { data: null, error: { code: "INTERNAL_ERROR", message: "操作失败" } },
        { status: 500, headers: h }
      );
    }

    return jsonResponse(
      {
        data: { id, status: newStatus, respondedAt: now },
        error: null,
      },
      { headers: h }
    );
  } catch {
    return jsonResponse(
      { data: null, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500, headers: h }
    );
  }
}
