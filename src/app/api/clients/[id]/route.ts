import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
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
  if (!user) return jsonResponse({ error: "未登录" }, { status: 401, headers: h });
  const { data: member } = await client.from("workspace_members")
    .select("workspace_id").eq("user_id", user.id).eq("status", "active").limit(1).single();
  if (!member) return jsonResponse({ error: "无权限" }, { status: 403, headers: h });

  const { data: clientData } = await client.from("clients")
    .select("*")
    .eq("id", id).eq("workspace_id", member.workspace_id).is("deleted_at", null).single();
  if (!clientData) return jsonResponse({ error: "客户不存在" }, { status: 404, headers: h });

  return jsonResponse(clientData, { headers: h });
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
      .select("id").eq("id", id).eq("workspace_id", member.workspace_id).is("deleted_at", null).single();
    if (!existing) return jsonResponse({ error: "客户不存在" }, { status: 404, headers: h });

    // Validate stage if provided
    const validStages = ["new","qualified","properties_sent","viewing_scheduled","viewed","considering","closed_won","paused","lost","deleted"];
    if (body.stage !== undefined && !validStages.includes(body.stage)) {
      return jsonResponse(
        { data: null, error: { code: "VALIDATION_FAILED", message: `无效的客户阶段: ${body.stage}` } },
        { status: 422, headers: h },
      );
    }

    // Validate name if provided
    if (body.name !== undefined && (typeof body.name !== "string" || body.name.trim().length === 0)) {
      return jsonResponse(
        { data: null, error: { code: "VALIDATION_FAILED", message: "客户姓名不能为空" } },
        { status: 422, headers: h },
      );
    }

    // Parse helpers
    const parseArray = (v: unknown): string[] | undefined => {
      if (v === undefined) return undefined;
      if (typeof v === "string") {
        const trimmed = v.trim();
        if (trimmed === "") return [];
        return trimmed.split(",").map((s) => s.trim()).filter(Boolean);
      }
      if (Array.isArray(v)) return v.filter(Boolean);
      return undefined;
    };

    const parseJson = (v: unknown): unknown | undefined => {
      if (v === undefined) return undefined;
      if (typeof v === "string") {
        try { return JSON.parse(v); } catch { return []; }
      }
      return v;
    };

    // Columns on clients table that can be updated
    const clientCols = [
      "name", "phone", "wechat", "source_platform",
      "budget_min", "budget_max",
      "preferred_districts", "preferred_communities",
      "bedrooms", "rental_type", "available_from", "minimum_lease_months",
      "pets_required", "cooking_required", "commute_destination",
      "hard_requirements", "soft_preferences", "deal_breakers",
      "stage", "raw_input_text", "next_follow_up_at",
    ];

    const boolCols = new Set(["pets_required", "cooking_required"]);
    const dateCols = new Set(["available_from", "next_follow_up_at"]);
    const intCols = new Set(["budget_min", "budget_max", "bedrooms", "minimum_lease_months"]);
    const arrayCols = new Set(["preferred_districts", "preferred_communities", "deal_breakers"]);
    const jsonCols = new Set(["hard_requirements", "soft_preferences"]);

    const boolTruthy = new Set([true, "true", "on", "1"]);
    const boolFalsy = new Set([false, "false", "off", "0"]);

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

    for (const f of clientCols) {
      if (!(f in body) || body[f] === undefined) continue;
      let v: unknown = body[f];

      if (boolCols.has(f)) {
        if (boolTruthy.has(v as string | boolean)) { v = true; }
        else if (boolFalsy.has(v as string | boolean)) { v = false; }
        else { return jsonResponse({ error: `无效的布尔值: ${f}` }, { status: 422, headers: h }); }
      } else if (v === "" && (dateCols.has(f) || intCols.has(f))) {
        v = null;
      } else if (intCols.has(f)) {
        if (v === "") continue;
        if (typeof v === "string") { const n = parseInt(v, 10); if (isNaN(n)) return jsonResponse({ error: `无效的数值: ${f}` }, { status: 422, headers: h }); v = n; }
      } else if (arrayCols.has(f)) {
        const arr = parseArray(v);
        if (arr !== undefined) v = arr;
        else continue;
      } else if (jsonCols.has(f)) {
        const j = parseJson(v);
        if (j !== undefined) v = j;
        else continue;
      }

      update[f] = v;
    }

    const { error: updateErr } = await client.from("clients")
      .update(update)
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
      .select("workspace_id, role").eq("user_id", user.id).eq("status", "active").limit(1).single();
    if (!member) return jsonResponse({ error: "无权限" }, { status: 403, headers: h });

    // Verify client exists and belongs to workspace (not already deleted)
    const { data: existing } = await client.from("clients")
      .select("id, stage").eq("id", id).eq("workspace_id", member.workspace_id).is("deleted_at", null).single();
    if (!existing) {
      return jsonResponse(
        { data: null, error: { code: "RESOURCE_NOT_FOUND", message: "客户不存在" } },
        { status: 404, headers: h },
      );
    }

    // Cannot delete closed_won clients
    if (existing.stage === "closed_won") {
      return jsonResponse(
        { data: null, error: { code: "VALIDATION_FAILED", message: "已成交客户不能直接删除" } },
        { status: 422, headers: h },
      );
    }

    const now = new Date().toISOString();
    const { error: delErr } = await client.from("clients")
      .update({ deleted_at: now, updated_at: now, stage: "deleted" })
      .eq("id", id).eq("workspace_id", member.workspace_id).is("deleted_at", null);
    if (delErr) return jsonResponse({ error: "删除失败" }, { status: 500, headers: h });

    return jsonResponse(
      { data: { deleted: true, clientId: id, deletedAt: now }, error: null },
      { headers: h },
    );
  } catch {
    return jsonResponse({ error: "服务器错误" }, { status: 500, headers: h });
  }
}
