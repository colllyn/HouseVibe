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
  const { data: property } = await client.from("properties").select("*")
    .eq("id", id).eq("workspace_id", member.workspace_id).is("deleted_at", null).single();
  if (!property) return jsonResponse({ error: "房源不存在" }, { status: 404, headers: h });
  const { data: pd } = await client.from("property_private_details").select("*")
    .eq("property_id", id).eq("workspace_id", member.workspace_id).maybeSingle();
  return jsonResponse({ ...property, private_details: pd ?? null }, { headers: h });
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

    // Verify property belongs to workspace
    const { data: existing } = await client.from("properties")
      .select("id").eq("id", id).eq("workspace_id", member.workspace_id).is("deleted_at", null).single();
    if (!existing) return jsonResponse({ error: "房源不存在" }, { status: 404, headers: h });

    // Columns that live on the properties table
    const propCols = ["title","city","rental_type","district","business_area","community_name",
      "address_text","building_no","unit_no","room_no","monthly_rent","deposit_terms",
      "bedrooms","living_rooms","bathrooms","area_sqm","floor","total_floors",
      "orientation","decoration","available_from","minimum_lease_months",
      "has_elevator","pets_allowed","cooking_allowed","subway_text","description",
      "tags","selling_points","drawbacks",
      "status","is_shared","allow_marketing_reuse","shared_expires_at","commission_split"];
    // Columns that live on property_private_details
    const privateCols = ["owner_name","owner_phone","owner_wechat","exact_address","key_location","internal_notes"];

    // Type coercion sets
    const boolCols = new Set(["has_elevator","pets_allowed","cooking_allowed","is_shared","allow_marketing_reuse"]);
    const dateCols = new Set(["available_from","shared_expires_at"]);
    const intCols = new Set(["monthly_rent","bedrooms","living_rooms","bathrooms","floor","total_floors","minimum_lease_months"]);
    const numericCols = new Set(["area_sqm"]);
    const arrayCols = new Set(["tags","selling_points","drawbacks"]);
    // Boolean coercion: explicit truthy/falsy maps — no Boolean() implicit cast
    const boolTruthy = new Set([true, "true", "on", "1"]);
    const boolFalsy = new Set([false, "false", "off", "0"]);

    const propUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const f of propCols) {
      if (!(f in body) || body[f] === undefined) continue;
      let v: unknown = body[f];

      // Boolean coercion — explicit maps only; invalid → 422
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
      // Numeric columns: empty string → keep existing; string → parse; invalid → 422
      else if (numericCols.has(f)) {
        if (v === "") continue;
        if (typeof v === "string") { const n = parseFloat(v); if (isNaN(n)) return jsonResponse({ error: `无效的数值: ${f}` }, { status: 422, headers: h }); v = n; }
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

      propUpdate[f] = v;
    }

    const privateUpdate: Record<string, unknown> = {};
    for (const f of privateCols) { if (f in body && body[f] !== undefined) privateUpdate[f] = body[f]; }

    // Update properties table
    const { error: propErr } = await client.from("properties").update(propUpdate)
      .eq("id", id).eq("workspace_id", member.workspace_id).is("deleted_at", null);
    if (propErr) return jsonResponse({ error: "更新失败" }, { status: 500, headers: h });

    // Update property_private_details if any private fields were sent
    if (Object.keys(privateUpdate).length > 0) {
      privateUpdate.updated_at = new Date().toISOString();
      const { error: pdErr } = await client.from("property_private_details")
        .upsert({ property_id: id, workspace_id: member.workspace_id, ...privateUpdate },
          { onConflict: "property_id" });
      if (pdErr) return jsonResponse({ error: "更新失败" }, { status: 500, headers: h });
    }

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
      .select("workspace_id").eq("user_id", user.id).eq("status", "active").limit(1).single();
    if (!member) return jsonResponse({ error: "无权限" }, { status: 403, headers: h });
    const now = new Date().toISOString();
    const { error: delErr } = await client.from("properties")
      .update({ deleted_at: now, updated_at: now })
      .eq("id", id).eq("workspace_id", member.workspace_id).is("deleted_at", null);
    if (delErr) return jsonResponse({ error: "删除失败" }, { status: 500, headers: h });
    return jsonResponse({ success: true }, { headers: h });
  } catch {
    return jsonResponse({ error: "服务器错误" }, { status: 500, headers: h });
  }
}
