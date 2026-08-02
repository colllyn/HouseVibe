import type { NextRequest } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { ClientStageEnum, CreateClientInputSchema } from "@/features/properties/schemas";

function urlOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost";
  return `${proto}://${host}`;
}
const cors = (o: string) => ({ "Access-Control-Allow-Origin": o, "Access-Control-Allow-Credentials": "true" });

// List columns — excludes phone and wechat (sensitive).
const LIST_COLS = "id,workspace_id,created_by,name,source_platform,source_content_id,first_property_id,budget_min,budget_max,preferred_districts,preferred_communities,bedrooms,rental_type,available_from,minimum_lease_months,pets_required,cooking_required,commute_destination,hard_requirements,soft_preferences,deal_breakers,stage,raw_input_text,next_follow_up_at,last_interaction_at,created_at,updated_at,deleted_at";

function toArray(value: string | undefined): string[] {
  if (!value || value.trim() === "") return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

export async function GET(request: NextRequest) {
  const origin = urlOrigin(request); const h = cors(origin);
  const { client, jsonResponse } = await createRouteHandlerClient(request);

  try {
    // 1. Auth
    const { data: { user } } = await client.auth.getUser();
    if (!user) return jsonResponse({ data: null, error: { code: "UNAUTHENTICATED", message: "未登录" } }, { status: 401, headers: h });

    const { data: member } = await client.from("workspace_members")
      .select("workspace_id").eq("user_id", user.id).eq("status", "active").limit(1).single();
    if (!member) return jsonResponse({ data: null, error: { code: "WORKSPACE_ACCESS_DENIED", message: "无权限" } }, { status: 403, headers: h });

    const workspaceId = member.workspace_id;

    // 2. Parse query params
    const stageParam = request.nextUrl.searchParams.get("stage");
    const searchParam = request.nextUrl.searchParams.get("search");

    // Validate stage if provided
    if (stageParam) {
      const parsed = ClientStageEnum.safeParse(stageParam);
      if (!parsed.success) {
        return jsonResponse(
          { data: null, error: { code: "VALIDATION_FAILED", message: "无效的客户阶段" } },
          { status: 422, headers: h }
        );
      }
    }

    // 3. Build query
    let query = client.from("clients")
      .select(LIST_COLS)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null);

    if (stageParam) query = query.eq("stage", stageParam);

    if (searchParam) {
      const pattern = `%${searchParam}%`;
      query = query.or(`name.ilike.${pattern},source_platform.ilike.${pattern},commute_destination.ilike.${pattern}`);
    }

    query = query.order("updated_at", { ascending: false });
    query = query.order("id", { ascending: true }); // deterministic tie-breaker

    // 4. Execute
    const { data, error } = await query;

    if (error) {
      return jsonResponse(
        { data: null, error: { code: "INTERNAL_ERROR", message: "查询失败" } },
        { status: 500, headers: h }
      );
    }

    return jsonResponse(
      { data: { clients: data ?? [] }, error: null },
      { headers: h }
    );
  } catch {
    return jsonResponse(
      { data: null, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500, headers: h }
    );
  }
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

    // Validate body
    const parsed = CreateClientInputSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const msg = first ? `${first.path.join(".")}: ${first.message}` : "请求参数无效";
      return jsonResponse({ error: msg }, { status: 422, headers: h });
    }

    const d = parsed.data;

    // Convert comma-separated strings to arrays
    const preferred_districts = toArray(d.preferred_districts);
    const preferred_communities = toArray(d.preferred_communities);

    const { data: inserted, error } = await client.from("clients").insert({
      workspace_id: member.workspace_id,
      created_by: user.id,
      name: d.name,
      phone: d.phone ?? null,
      wechat: d.wechat ?? null,
      source_platform: d.source_platform ?? null,
      budget_min: d.budget_min ?? null,
      budget_max: d.budget_max ?? null,
      preferred_districts,
      preferred_communities,
      bedrooms: d.bedrooms ?? null,
      rental_type: d.rental_type ?? null,
      available_from: d.available_from ?? null,
      minimum_lease_months: d.minimum_lease_months ?? null,
      pets_required: d.pets_required ?? null,
      cooking_required: d.cooking_required ?? null,
      commute_destination: d.commute_destination ?? null,
      stage: d.stage ?? "new",
      next_follow_up_at: d.next_follow_up_at ?? null,
    }).select("id").single();

    if (error) return jsonResponse({ error: "创建失败" }, { status: 500, headers: h });
    return jsonResponse({ id: inserted.id }, { status: 201, headers: h });
  } catch {
    return jsonResponse({ error: "服务器错误" }, { status: 500, headers: h });
  }
}
