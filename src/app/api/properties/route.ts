import type { NextRequest } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";

function urlOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost";
  return `${proto}://${host}`;
}
const cors = (o: string) => ({ "Access-Control-Allow-Origin": o, "Access-Control-Allow-Credentials": "true" });

export async function GET(request: NextRequest) {
  const origin = urlOrigin(request); const h = cors(origin);
  const { client, jsonResponse } = await createRouteHandlerClient(request);
  const { data: { user } } = await client.auth.getUser();
  if (!user) return jsonResponse([], { headers: h });
  const { data: member } = await client.from("workspace_members")
    .select("workspace_id").eq("user_id", user.id).eq("status", "active").limit(1).single();
  if (!member) return jsonResponse([], { headers: h });
  const { data: properties } = await client.from("properties").select("*")
    .eq("workspace_id", member.workspace_id).is("deleted_at", null)
    .order("updated_at", { ascending: false });
  return jsonResponse(properties ?? [], { headers: h });
}

export async function POST(request: NextRequest) {
  const origin = urlOrigin(request); const h = cors(origin);
  const { client, jsonResponse } = await createRouteHandlerClient(request);
  try {
    const { data: { user } } = await client.auth.getUser();
    if (!user) return jsonResponse({ error: "未登录" }, { status: 401, headers: h });
    const { data: member } = await client.from("workspace_members")
      .select("workspace_id").eq("user_id", user.id).eq("status", "active").limit(1).single();
    if (!member) return jsonResponse({ error: "无权限" }, { status: 403, headers: h });
    const body = await request.json();
    const { data: propertyId, error } = await client.rpc("create_property_with_private_details", {
      p_workspace_id: member.workspace_id,
      p_title: body.title, p_city: body.city, p_rental_type: body.rental_type ?? "whole_unit",
      p_district: body.district ?? null, p_business_area: body.business_area ?? null,
      p_community_name: body.community_name ?? null, p_address_text: body.address_text ?? null,
      p_monthly_rent: body.monthly_rent ?? null, p_deposit_terms: body.deposit_terms ?? null,
      p_bedrooms: body.bedrooms ?? null, p_living_rooms: body.living_rooms ?? null,
      p_bathrooms: body.bathrooms ?? null, p_area_sqm: body.area_sqm ?? null,
      p_floor: body.floor ?? null, p_total_floors: body.total_floors ?? null,
      p_has_elevator: body.has_elevator ?? null, p_orientation: body.orientation ?? null,
      p_decoration: body.decoration ?? null, p_available_from: body.available_from ?? null,
      p_pets_allowed: body.pets_allowed ?? null, p_cooking_allowed: body.cooking_allowed ?? null,
      p_subway_text: body.subway_text ?? null, p_tags: body.tags ?? null,
      p_description: body.description ?? null,
      p_owner_name: body.owner_name ?? null, p_owner_phone: body.owner_phone ?? null,
      p_owner_wechat: body.owner_wechat ?? null, p_exact_address: body.exact_address ?? null,
      p_key_location: body.key_location ?? null, p_internal_notes: body.internal_notes ?? null,
    });
    if (error) return jsonResponse({ error: "创建失败" }, { status: 500, headers: h });
    return jsonResponse({ id: propertyId }, { status: 201, headers: h });
  } catch {
    return jsonResponse({ error: "服务器错误" }, { status: 500, headers: h });
  }
}
