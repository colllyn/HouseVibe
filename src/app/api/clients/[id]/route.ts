import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { UpdateClientInputSchema } from "@/features/clients/schemas";
import type { NextRequest } from "next/server";

function urlOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost";
  return `${proto}://${host}`;
}
const cors = (o: string) => ({ "Access-Control-Allow-Origin": o, "Access-Control-Allow-Credentials": "true" });

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const origin = urlOrigin(request); const h = cors(origin);
  const { client, jsonResponse } = await createRouteHandlerClient(request);
  const { data: { user } } = await client.auth.getUser();
  if (!user) return jsonResponse({ data: null, error: { code: "UNAUTHENTICATED", message: "未登录" } }, { status: 401, headers: h });
  const { data: member } = await client.from("workspace_members")
    .select("workspace_id").eq("user_id", user.id).eq("status", "active").limit(1).single();
  if (!member) return jsonResponse({ data: null, error: { code: "WORKSPACE_ACCESS_DENIED", message: "无权限" } }, { status: 403, headers: h });

  const { data: clientData } = await client.from("clients")
    .select("*")
    .eq("id", id).eq("workspace_id", member.workspace_id).is("deleted_at", null).single();
  if (!clientData) return jsonResponse({ data: null, error: { code: "RESOURCE_NOT_FOUND", message: "客户不存在" } }, { status: 404, headers: h });

  return jsonResponse({ data: clientData, error: null }, { headers: h });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const origin = urlOrigin(request); const h = cors(origin);
  const { client, jsonResponse } = await createRouteHandlerClient(request);
  try {
    const { data: { user } } = await client.auth.getUser();
    if (!user) return jsonResponse({ data: null, error: { code: "UNAUTHENTICATED", message: "未登录" } }, { status: 401, headers: h });
    const { data: member } = await client.from("workspace_members")
      .select("workspace_id").eq("user_id", user.id).eq("status", "active").limit(1).single();
    if (!member) return jsonResponse({ data: null, error: { code: "WORKSPACE_ACCESS_DENIED", message: "无权限" } }, { status: 403, headers: h });

    const body = await request.json();

    // Stage changes route through set_client_stage RPC (validated transitions)
    if (body.stage !== undefined) {
      const stageOnly = Object.keys(body).every(k => k === "stage");
      if (!stageOnly) {
        return jsonResponse(
          { data: null, error: { code: "VALIDATION_FAILED", message: "阶段变更不能与其它字段同时更新" } },
          { status: 422, headers: h },
        );
      }

      // Validate stage is a known enum value before calling RPC
      const validStages = ["new","qualified","properties_sent","viewing_scheduled","viewed","considering","closed_won","paused","lost","deleted"];
      if (!validStages.includes(body.stage)) {
        return jsonResponse(
          { data: null, error: { code: "VALIDATION_FAILED", message: `无效的客户阶段: ${body.stage}` } },
          { status: 422, headers: h },
        );
      }

      // Call the stage transition RPC
      const { error: stageErr } = await client.rpc("set_client_stage", {
        p_client_id: id,
        p_new_stage: body.stage,
      });

      if (stageErr) {
        const msg = String(stageErr.message ?? "");
        if (msg.includes("not allowed")) {
          return jsonResponse(
            { data: null, error: { code: "VALIDATION_FAILED", message: msg } },
            { status: 422, headers: h },
          );
        }
        return jsonResponse(
          { data: null, error: { code: "INTERNAL_ERROR", message: "阶段变更失败" } },
          { status: 500, headers: h },
        );
      }

      return jsonResponse({ data: { success: true }, error: null }, { headers: h });
    }

    // Zod validation for all other updatable fields (stage excluded from schema)
    const parsed = UpdateClientInputSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const msg = first ? `${first.path.join(".")}: ${first.message}` : "请求参数无效";
      return jsonResponse(
        { data: null, error: { code: "VALIDATION_FAILED", message: msg } },
        { status: 422, headers: h },
      );
    }

    const validated = parsed.data;

    // Verify client belongs to workspace
    const { data: existing } = await client.from("clients")
      .select("id").eq("id", id).eq("workspace_id", member.workspace_id).is("deleted_at", null).single();
    if (!existing) return jsonResponse({ data: null, error: { code: "RESOURCE_NOT_FOUND", message: "客户不存在" } }, { status: 404, headers: h });

    // Build update payload from validated zod data
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

    for (const [key, value] of Object.entries(validated)) {
      if (value === undefined) continue;
      update[key] = value;
    }

    const { error: updateErr } = await client.from("clients")
      .update(update)
      .eq("id", id).eq("workspace_id", member.workspace_id).is("deleted_at", null);

    if (updateErr) return jsonResponse({ data: null, error: { code: "INTERNAL_ERROR", message: "更新失败" } }, { status: 500, headers: h });

    return jsonResponse({ data: { success: true }, error: null }, { headers: h });
  } catch {
    return jsonResponse({ data: null, error: { code: "INTERNAL_ERROR", message: "服务器错误" } }, { status: 500, headers: h });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const origin = urlOrigin(request); const h = cors(origin);
  const { client, jsonResponse } = await createRouteHandlerClient(request);
  try {
    // 1. Authentication
    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      return jsonResponse(
        { data: null, error: { code: "UNAUTHENTICATED", message: "未登录" } },
        { status: 401, headers: h },
      );
    }

    // 2. Workspace membership + role check
    const { data: member } = await client.from("workspace_members")
      .select("workspace_id, role").eq("user_id", user.id).eq("status", "active").limit(1).single();
    if (!member) {
      return jsonResponse(
        { data: null, error: { code: "WORKSPACE_ACCESS_DENIED", message: "无权限" } },
        { status: 403, headers: h },
      );
    }

    // 3. Owner-only enforcement (per client-contract §4.5, §5.1)
    if (member.role !== "owner") {
      return jsonResponse(
        { data: null, error: { code: "FORBIDDEN", message: "仅工作区管理员可删除客户" } },
        { status: 403, headers: h },
      );
    }

    // 4. Verify client exists and belongs to workspace (not already deleted)
    const { data: existing } = await client.from("clients")
      .select("id, stage").eq("id", id).eq("workspace_id", member.workspace_id).is("deleted_at", null).single();
    if (!existing) {
      return jsonResponse(
        { data: null, error: { code: "RESOURCE_NOT_FOUND", message: "客户不存在" } },
        { status: 404, headers: h },
      );
    }

    // 5. Cannot delete closed_won clients
    if (existing.stage === "closed_won") {
      return jsonResponse(
        { data: null, error: { code: "VALIDATION_FAILED", message: "已成交客户不能直接删除" } },
        { status: 422, headers: h },
      );
    }

    // 6. Call atomic SECURITY DEFINER RPC (defense-in-depth: RLS + RPC)
    const { data: result, error: rpcErr } = await client.rpc("soft_delete_client", {
      p_client_id: id,
    });

    if (rpcErr) {
      // Map known RPC errors to proper HTTP codes
      const msg = String(rpcErr.message ?? "");
      if (msg.includes("not found") || msg.includes("Client not found")) {
        return jsonResponse(
          { data: null, error: { code: "RESOURCE_NOT_FOUND", message: "客户不存在" } },
          { status: 404, headers: h },
        );
      }
      if (msg.includes("closed_won")) {
        return jsonResponse(
          { data: null, error: { code: "VALIDATION_FAILED", message: "已成交客户不能直接删除" } },
          { status: 422, headers: h },
        );
      }
      if (msg.includes("owner") || msg.includes("insufficient_privilege")) {
        return jsonResponse(
          { data: null, error: { code: "FORBIDDEN", message: "仅工作区管理员可删除客户" } },
          { status: 403, headers: h },
        );
      }
      return jsonResponse(
        { data: null, error: { code: "INTERNAL_ERROR", message: "删除失败" } },
        { status: 500, headers: h },
      );
    }

    // 7. Return contract-compliant response
    return jsonResponse(
      {
        data: {
          deleted: (result as Record<string, unknown>)?.deleted ?? true,
          deletedAt: (result as Record<string, unknown>)?.deletedAt ?? new Date().toISOString(),
        },
        error: null,
      },
      { headers: h },
    );
  } catch {
    return jsonResponse(
      { data: null, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500, headers: h },
    );
  }
}
