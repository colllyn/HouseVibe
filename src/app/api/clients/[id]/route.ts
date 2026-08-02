import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import type { NextRequest } from "next/server";
import { ClientStageEnum } from "@/features/properties/schemas";

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
  if (!user) return jsonResponse({ error: "未登录" }, { status: 401, headers: h });
  const { data: member } = await client.from("workspace_members")
    .select("workspace_id").eq("user_id", user.id).eq("status", "active").limit(1).single();
  if (!member) return jsonResponse({ error: "无权限" }, { status: 403, headers: h });
  const { data: clientRow } = await client.from("clients").select("*")
    .eq("id", id).eq("workspace_id", member.workspace_id).is("deleted_at", null).single();
  if (!clientRow) return jsonResponse({ error: "客户不存在" }, { status: 404, headers: h });
  return jsonResponse(clientRow, { headers: h });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const origin = urlOrigin(request); const h = cors(origin);
  const { client, jsonResponse } = await createRouteHandlerClient(request);
  try {
    const { data: { user } } = await client.auth.getUser();
    if (!user) return jsonResponse({ error: "未登录" }, { status: 401, headers: h });
    const { data: member } = await client.from("workspace_members")
      .select("workspace_id").eq("user_id", user.id).eq("status", "active").limit(1).single();
    if (!member) return jsonResponse({ error: "无权限" }, { status: 403, headers: h });
    const body = await request.json();

    // Verify client belongs to workspace
    const { data: existing } = await client.from("clients")
      .select("id,stage").eq("id", id).eq("workspace_id", member.workspace_id).is("deleted_at", null).single();
    if (!existing) return jsonResponse({ error: "客户不存在" }, { status: 404, headers: h });

    // Columns that live on the clients table and are updatable via this handler
    const updatableCols = [
      "name", "phone", "wechat", "source_platform",
      "budget_min", "budget_max", "preferred_districts", "preferred_communities",
      "bedrooms", "rental_type", "available_from", "minimum_lease_months",
      "pets_required", "cooking_required", "commute_destination",
      "stage", "next_follow_up_at",
    ];

    // Type coercion sets
    const boolCols = new Set(["pets_required", "cooking_required"]);
    const intCols = new Set(["budget_min", "budget_max", "bedrooms", "minimum_lease_months"]);
    const dateCols = new Set(["available_from", "next_follow_up_at"]);
    const arrayCols = new Set(["preferred_districts", "preferred_communities"]);
    const boolTruthy = new Set([true, "true", "on", "1"]);
    const boolFalsy = new Set([false, "false", "off", "0"]);

    const clientUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };

    for (const f of updatableCols) {
      if (!(f in body) || body[f] === undefined) continue;
      let v: unknown = body[f];

      // Boolean coercion
      if (boolCols.has(f)) {
        if (boolTruthy.has(v as string | boolean)) { v = true; }
        else if (boolFalsy.has(v as string | boolean)) { v = false; }
        else { return jsonResponse({ error: `无效的布尔值: ${f}` }, { status: 422, headers: h }); }
      }
      // Date columns: empty string → null
      else if (v === "" && dateCols.has(f)) { v = null; }
      // Integer columns: empty string → keep existing; string → parse; invalid → 422
      else if (intCols.has(f)) {
        if (v === "") continue;
        if (typeof v === "string") { const n = parseInt(v, 10); if (isNaN(n)) return jsonResponse({ error: `无效的数值: ${f}` }, { status: 422, headers: h }); v = n; }
      }
      // Array columns: comma-separated string → string[]; empty string → []
      else if (arrayCols.has(f)) {
        if (typeof v === "string") {
          v = v.trim() === "" ? [] : v.split(",").map((s: string) => s.trim()).filter(Boolean);
        } else if (Array.isArray(v)) {
          // already an array, keep as-is
        } else {
          v = [];
        }
      }

      clientUpdate[f] = v;
    }

    // Validate stage if provided
    if ("stage" in clientUpdate) {
      const stageParsed = ClientStageEnum.safeParse(clientUpdate.stage);
      if (!stageParsed.success) {
        return jsonResponse({ error: "无效的客户阶段" }, { status: 422, headers: h });
      }
      clientUpdate.stage = stageParsed.data;
    }

    // Update clients table
    const { error: updateErr } = await client.from("clients").update(clientUpdate)
      .eq("id", id).eq("workspace_id", member.workspace_id).is("deleted_at", null);
    if (updateErr) return jsonResponse({ error: "更新失败" }, { status: 500, headers: h });

    return jsonResponse({ success: true }, { headers: h });
  } catch {
    return jsonResponse({ error: "服务器错误" }, { status: 500, headers: h });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const origin = urlOrigin(request); const h = cors(origin);
  const { client, jsonResponse } = await createRouteHandlerClient(request);
  try {
    const { data: { user } } = await client.auth.getUser();
    if (!user) return jsonResponse({ error: "未登录" }, { status: 401, headers: h });
    const { data: member } = await client.from("workspace_members")
      .select("workspace_id,role").eq("user_id", user.id).eq("status", "active").limit(1).single();
    if (!member) return jsonResponse({ error: "无权限" }, { status: 403, headers: h });

    // Owner check — only the workspace owner can soft-delete clients
    if (member.role !== "owner") {
      return jsonResponse({ error: "只有工作区创建者才能删除客户" }, { status: 403, headers: h });
    }

    const now = new Date().toISOString();
    const { error: delErr } = await client.from("clients")
      .update({ deleted_at: now, updated_at: now })
      .eq("id", id).eq("workspace_id", member.workspace_id).is("deleted_at", null);
    if (delErr) return jsonResponse({ error: "删除失败" }, { status: 500, headers: h });
    return jsonResponse({ success: true }, { headers: h });
  } catch {
    return jsonResponse({ error: "服务器错误" }, { status: 500, headers: h });
  }
}
