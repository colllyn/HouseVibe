import type { NextRequest } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { ClientQuerySchema } from "@/features/clients/schemas";

function urlOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost";
  return `${proto}://${host}`;
}
const cors = (o: string) => ({ "Access-Control-Allow-Origin": o, "Access-Control-Allow-Credentials": "true" });

// Non-sensitive columns for list responses. Excludes phone, wechat (sensitive).
const LIST_COLS = "id,workspace_id,created_by,name,source_platform,source_content_id,first_property_id,budget_min,budget_max,preferred_districts,preferred_communities,bedrooms,rental_type,available_from,minimum_lease_months,pets_required,cooking_required,commute_destination,hard_requirements,soft_preferences,deal_breakers,stage,raw_input_text,next_follow_up_at,last_interaction_at,created_at,updated_at,deleted_at";

function sortClause(sortBy: string, sortOrder: string): { column: string; ascending: boolean; nullsLast: boolean } {
  switch (sortBy) {
    case "created_at":
      return { column: "created_at", ascending: sortOrder === "asc", nullsLast: false };
    case "next_follow_up_at":
      return { column: "next_follow_up_at", ascending: sortOrder === "asc", nullsLast: true };
    case "last_interaction_at":
      return { column: "last_interaction_at", ascending: sortOrder === "asc", nullsLast: true };
    case "budget_min":
      return { column: "budget_min", ascending: sortOrder === "asc", nullsLast: true };
    case "budget_max":
      return { column: "budget_max", ascending: sortOrder === "asc", nullsLast: true };
    default: // "updated_at"
      return { column: "updated_at", ascending: sortOrder === "asc", nullsLast: false };
  }
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
    const raw: Record<string, string> = {};
    request.nextUrl.searchParams.forEach((v, k) => { raw[k] = v; });

    const parsed = ClientQuerySchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const msg = first ? `${first.path.join(".")}: ${first.message}` : "查询参数无效";
      return jsonResponse(
        { data: null, error: { code: "VALIDATION_FAILED", message: msg } },
        { status: 422, headers: h }
      );
    }

    const q = parsed.data;

    // 3. Build query — mandatory filters
    let query = client.from("clients")
      .select(LIST_COLS, { count: "exact", head: false })
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null);

    // 4. Conditional filters
    if (q.stage)               query = query.eq("stage", q.stage);
    if (q.rentalType)          query = query.eq("rental_type", q.rentalType);
    if (q.bedrooms != null)    query = query.eq("bedrooms", q.bedrooms);
    if (q.minBudget != null)   query = query.gte("budget_max", q.minBudget);
    if (q.maxBudget != null)   query = query.lte("budget_min", q.maxBudget);

    // hasFollowUp: filter to clients with next_follow_up_at set
    if (q.hasFollowUp === true)  query = query.not("next_follow_up_at", "is", null);
    if (q.hasFollowUp === false) query = query.is("next_follow_up_at", null);

    // Text search across name and commute_destination
    if (q.search) {
      const pattern = `%${q.search}%`;
      query = query.or(
        `name.ilike.${pattern},commute_destination.ilike.${pattern}`
      );
    }

    // 5. Sort with tie-breaker
    const sort = sortClause(q.sortBy, q.sortOrder);
    query = query.order(sort.column, { ascending: sort.ascending, nullsFirst: !sort.nullsLast });
    query = query.order("id", { ascending: true }); // deterministic tie-breaker

    // 6. Pagination
    const from = (q.page - 1) * q.limit;
    const to = from + q.limit - 1;
    query = query.range(from, to);

    // 7. Execute
    const { data, error, count } = await query;

    if (error) {
      return jsonResponse(
        { data: null, error: { code: "INTERNAL_ERROR", message: "查询失败" } },
        { status: 500, headers: h }
      );
    }

    return jsonResponse(
      { data: { clients: data ?? [], total: count ?? 0, page: q.page, limit: q.limit }, error: null },
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

    // Validate required fields
    if (!body.name || typeof body.name !== "string" || body.name.trim().length === 0) {
      return jsonResponse(
        { data: null, error: { code: "VALIDATION_FAILED", message: "客户姓名不能为空" } },
        { status: 422, headers: h },
      );
    }

    // Validate stage if provided
    const validStages = ["new","qualified","properties_sent","viewing_scheduled","viewed","considering","closed_won","paused","lost","deleted"];
    if (body.stage && !validStages.includes(body.stage)) {
      return jsonResponse(
        { data: null, error: { code: "VALIDATION_FAILED", message: `无效的客户阶段: ${body.stage}` } },
        { status: 422, headers: h },
      );
    }

    // Parse comma-separated strings to arrays
    const parseArray = (v: unknown): string[] | null => {
      if (typeof v === "string") {
        const trimmed = v.trim();
        if (trimmed === "") return null;
        return trimmed.split(",").map((s) => s.trim()).filter(Boolean);
      }
      if (Array.isArray(v)) return v.filter(Boolean);
      return null;
    };

    // Parse JSON
    const parseJson = (v: unknown): unknown | null => {
      if (typeof v === "string") {
        try { return JSON.parse(v); } catch { return null; }
      }
      return v ?? null;
    };

    const { data: clientData, error: insertError } = await client.from("clients")
      .insert({
        workspace_id: member.workspace_id,
        created_by: user.id,
        name: body.name,
        phone: body.phone ?? null,
        wechat: body.wechat ?? null,
        source_platform: body.source_platform ?? null,
        budget_min: body.budget_min ?? null,
        budget_max: body.budget_max ?? null,
        preferred_districts: parseArray(body.preferred_districts) ?? [],
        preferred_communities: parseArray(body.preferred_communities) ?? [],
        bedrooms: body.bedrooms ?? null,
        rental_type: body.rental_type ?? null,
        available_from: body.available_from ?? null,
        minimum_lease_months: body.minimum_lease_months ?? null,
        pets_required: body.pets_required ?? null,
        cooking_required: body.cooking_required ?? null,
        commute_destination: body.commute_destination ?? null,
        hard_requirements: parseJson(body.hard_requirements) ?? [],
        soft_preferences: parseJson(body.soft_preferences) ?? [],
        deal_breakers: parseArray(body.deal_breakers) ?? [],
        stage: body.stage ?? "new",
        raw_input_text: body.raw_input_text ?? null,
        next_follow_up_at: body.next_follow_up_at ?? null,
      })
      .select("id")
      .single();

    if (insertError) {
      return jsonResponse({ error: "创建失败" }, { status: 500, headers: h });
    }

    return jsonResponse({ id: clientData.id }, { status: 201, headers: h });
  } catch {
    return jsonResponse({ error: "服务器错误" }, { status: 500, headers: h });
  }
}
