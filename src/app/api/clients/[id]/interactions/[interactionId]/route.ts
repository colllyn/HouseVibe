import type { NextRequest } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { UpdateInteractionInputSchema } from "@/features/clients/schemas";

function urlOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost";
  return `${proto}://${host}`;
}
const cors = (o: string) => ({
  "Access-Control-Allow-Origin": o,
  "Access-Control-Allow-Credentials": "true",
});

// Full detail columns include raw_text and next_action (verbose fields)
const DETAIL_COLS = "*";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; interactionId: string }> }
) {
  const { id: clientId, interactionId } = await params;
  const origin = urlOrigin(request);
  const h = cors(origin);
  const { client, jsonResponse } = await createRouteHandlerClient(request);

  try {
    // 1. Auth
    const {
      data: { user },
    } = await client.auth.getUser();
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

    // 3. Verify client exists in workspace
    const { data: clientExists } = await client
      .from("clients")
      .select("id")
      .eq("id", clientId)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .single();
    if (!clientExists)
      return jsonResponse(
        { data: null, error: { code: "RESOURCE_NOT_FOUND", message: "客户不存在" } },
        { status: 404, headers: h }
      );

    // 4. Fetch interaction (full detail)
    const { data: interaction, error } = await client
      .from("interactions")
      .select(DETAIL_COLS)
      .eq("id", interactionId)
      .eq("client_id", clientId)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .single();

    if (error || !interaction) {
      return jsonResponse(
        { data: null, error: { code: "RESOURCE_NOT_FOUND", message: "沟通记录不存在" } },
        { status: 404, headers: h }
      );
    }

    return jsonResponse({ data: interaction, error: null }, { headers: h });
  } catch {
    return jsonResponse(
      { data: null, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500, headers: h }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; interactionId: string }> }
) {
  const { id: clientId, interactionId } = await params;
  const origin = urlOrigin(request);
  const h = cors(origin);
  const { client, jsonResponse } = await createRouteHandlerClient(request);

  try {
    // 1. Auth
    const {
      data: { user },
    } = await client.auth.getUser();
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

    // 3. Parse body
    const body = await request.json();

    // 4. Zod validation
    const parsed = UpdateInteractionInputSchema.safeParse(body);
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

    const validated = parsed.data;

    // 5. Verify interaction exists and belongs to client
    const { data: existing } = await client
      .from("interactions")
      .select("id")
      .eq("id", interactionId)
      .eq("client_id", clientId)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .single();
    if (!existing)
      return jsonResponse(
        { data: null, error: { code: "RESOURCE_NOT_FOUND", message: "沟通记录不存在" } },
        { status: 404, headers: h }
      );

    // 6. Call atomic update_interaction RPC
    const { error: rpcErr } = await client.rpc(
      "update_interaction",
      {
        p_interaction_id: interactionId,
        p_interaction_type: validated.interaction_type ?? null,
        p_summary: validated.summary ?? null,
        p_raw_text: validated.raw_text ?? null,
        p_next_action: validated.next_action ?? null,
        p_occurred_at: validated.occurred_at ?? null,
        p_property_id: validated.property_id ?? null,
      }
    );

    if (rpcErr) {
      const msg = String(rpcErr.message ?? "");
      if (msg.includes("not found")) {
        return jsonResponse(
          { data: null, error: { code: "RESOURCE_NOT_FOUND", message: "沟通记录不存在" } },
          { status: 404, headers: h }
        );
      }
      if (msg.includes("Authentication required")) {
        return jsonResponse(
          { data: null, error: { code: "UNAUTHENTICATED", message: "未登录" } },
          { status: 401, headers: h }
        );
      }
      return jsonResponse(
        { data: null, error: { code: "INTERNAL_ERROR", message: "更新失败" } },
        { status: 500, headers: h }
      );
    }

    return jsonResponse(
      { data: { success: true }, error: null },
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
  { params }: { params: Promise<{ id: string; interactionId: string }> }
) {
  const { id: clientId, interactionId } = await params;
  const origin = urlOrigin(request);
  const h = cors(origin);
  const { client, jsonResponse } = await createRouteHandlerClient(request);

  try {
    // 1. Auth
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user)
      return jsonResponse(
        { data: null, error: { code: "UNAUTHENTICATED", message: "未登录" } },
        { status: 401, headers: h }
      );

    // 2. Workspace membership (any active member can delete interactions)
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

    // 3. Verify interaction exists, belongs to client, and is not already deleted
    const { data: existing } = await client
      .from("interactions")
      .select("id")
      .eq("id", interactionId)
      .eq("client_id", clientId)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .single();
    if (!existing)
      return jsonResponse(
        { data: null, error: { code: "RESOURCE_NOT_FOUND", message: "沟通记录不存在" } },
        { status: 404, headers: h }
      );

    // 4. Call atomic soft_delete_interaction RPC
    const { data: result, error: rpcErr } = await client.rpc(
      "soft_delete_interaction",
      { p_interaction_id: interactionId }
    );

    if (rpcErr) {
      const msg = String(rpcErr.message ?? "");
      if (msg.includes("not found")) {
        return jsonResponse(
          { data: null, error: { code: "RESOURCE_NOT_FOUND", message: "沟通记录不存在" } },
          { status: 404, headers: h }
        );
      }
      return jsonResponse(
        { data: null, error: { code: "INTERNAL_ERROR", message: "删除失败" } },
        { status: 500, headers: h }
      );
    }

    return jsonResponse(
      {
        data: {
          deleted: true,
          deletedAt:
            (result as Record<string, unknown>)?.deletedAt ??
            new Date().toISOString(),
        },
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
