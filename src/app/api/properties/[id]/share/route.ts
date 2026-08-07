import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { SharePropertyInputSchema } from "@/features/collaboration/schemas";
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

    // 3. Verify property belongs to workspace
    const { data: existing } = await client
      .from("properties")
      .select("id, workspace_id")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .single();
    if (!existing) {
      return jsonResponse(
        { data: null, error: { code: "NOT_FOUND", message: "房源不存在" } },
        { status: 404, headers: h }
      );
    }

    // 4. Parse body
    const body = await request.json();
    const parsed = SharePropertyInputSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const msg = first ? `${first.path.join(".")}: ${first.message}` : "请求参数无效";
      return jsonResponse(
        { data: null, error: { code: "VALIDATION_FAILED", message: msg } },
        { status: 422, headers: h }
      );
    }

    const input = parsed.data;

    // 5. Update property — share
    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = {
      is_shared: true,
      shared_at: now,
      allow_marketing_reuse: input.allowMarketingReuse,
      updated_at: now,
    };

    if (input.sharedExpiresAt) {
      updateData.shared_expires_at = input.sharedExpiresAt;
    }
    if (input.commissionSplit !== undefined) {
      updateData.commission_split = input.commissionSplit || null;
    }

    const { error: updateErr } = await client
      .from("properties")
      .update(updateData)
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null);

    if (updateErr) {
      return jsonResponse(
        { data: null, error: { code: "INTERNAL_ERROR", message: "共享设置失败" } },
        { status: 500, headers: h }
      );
    }

    // 6. Audit log (via SECURITY DEFINER RPC — P0-3 fix)
    await client.rpc("write_audit_log", {
      p_workspace_id: workspaceId,
      p_action: "property.shared",
      p_entity_type: "property",
      p_entity_id: id,
      p_after_data: {
        shared_at: now,
        shared_expires_at: input.sharedExpiresAt ?? null,
        allow_marketing_reuse: input.allowMarketingReuse,
        commission_split: input.commissionSplit ?? null,
      },
    });

    return jsonResponse(
      { data: { shared: true, sharedAt: now }, error: null },
      { headers: h }
    );
  } catch {
    return jsonResponse(
      { data: null, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500, headers: h }
    );
  }
}

export async function DELETE(
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

    // 3. Verify property belongs to workspace
    const { data: existing } = await client
      .from("properties")
      .select("id, workspace_id")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .single();
    if (!existing) {
      return jsonResponse(
        { data: null, error: { code: "NOT_FOUND", message: "房源不存在" } },
        { status: 404, headers: h }
      );
    }

    // 4. Unshare — reset both is_shared and allow_marketing_reuse
    const now = new Date().toISOString();
    const { error: updateErr } = await client
      .from("properties")
      .update({
        is_shared: false,
        allow_marketing_reuse: false,
        shared_at: null,
        shared_expires_at: null,
        updated_at: now,
      })
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null);

    if (updateErr) {
      return jsonResponse(
        { data: null, error: { code: "INTERNAL_ERROR", message: "取消共享失败" } },
        { status: 500, headers: h }
      );
    }

    // 5. Audit log (via SECURITY DEFINER RPC — P0-3 fix)
    await client.rpc("write_audit_log", {
      p_workspace_id: workspaceId,
      p_action: "property.unshared",
      p_entity_type: "property",
      p_entity_id: id,
      p_after_data: { unshared_at: now },
    });

    return jsonResponse(
      { data: { shared: false, unsharedAt: now }, error: null },
      { headers: h }
    );
  } catch {
    return jsonResponse(
      { data: null, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500, headers: h }
    );
  }
}
