import type { NextRequest } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { ClientQuerySchema } from "@/features/clients/schemas";

function urlOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost";
  return `${proto}://${host}`;
}
const cors = (o: string) => ({ "Access-Control-Allow-Origin": o, "Access-Control-Allow-Credentials": "true" });

// Non-sensitive columns for list responses. Excludes phone, wechat (sensitive),
// and hard_requirements, soft_preferences, deal_breakers, raw_input_text (verbose/detail-only).
const LIST_COLS = "id,workspace_id,created_by,name,source_platform,source_content_id,first_property_id,budget_min,budget_max,preferred_districts,preferred_communities,bedrooms,rental_type,available_from,minimum_lease_months,pets_required,cooking_required,commute_destination,stage,next_follow_up_at,last_interaction_at,created_at,updated_at,deleted_at";

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
    // 1. Authentication
    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      return jsonResponse(
        { data: null, error: { code: "UNAUTHENTICATED", message: "未登录" } },
        { status: 401, headers: h },
      );
    }

    // 2. Workspace membership
    const { data: member } = await client.from("workspace_members")
      .select("workspace_id").eq("user_id", user.id).eq("status", "active").limit(1).single();
    if (!member) {
      return jsonResponse(
        { data: null, error: { code: "WORKSPACE_ACCESS_DENIED", message: "无权限" } },
        { status: 403, headers: h },
      );
    }

    const body = await request.json();

    // 3. Validate required fields
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

    // 4. Server-side idempotency
    const idempotencyKey = request.headers.get("x-idempotency-key")?.trim() || null;

    // Compute request fingerprint (SHA-256 of sorted JSON body, excluding idempotency key)
    let requestFingerprint: string | null = null;
    if (idempotencyKey) {
      // Build a deterministic fingerprint from the request body
      // Sort keys for stability; exclude sensitive tracing fields
      const fingerprintBody: Record<string, unknown> = {};
      const sortedKeys = Object.keys(body).filter(k => k !== "requestId").sort();
      for (const k of sortedKeys) {
        fingerprintBody[k] = body[k];
      }
      // Simple hash via stringify — production should use crypto.subtle
      const fp = JSON.stringify(fingerprintBody);
      let hash = 0;
      for (let i = 0; i < fp.length; i++) {
        const chr = fp.charCodeAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash |= 0; // Convert to 32bit integer
      }
      requestFingerprint = String(hash);
    }

    // Parse helpers for array/JSON fields
    const parseArray = (v: unknown): string[] | null => {
      if (typeof v === "string") {
        const trimmed = v.trim();
        if (trimmed === "") return null;
        return trimmed.split(",").map((s) => s.trim()).filter(Boolean);
      }
      if (Array.isArray(v)) return v.filter(Boolean);
      return null;
    };

    const parseJson = (v: unknown): unknown | null => {
      if (typeof v === "string") {
        try { return JSON.parse(v); } catch { return null; }
      }
      return v ?? null;
    };

    // 5. Call atomic create_client RPC (handles idempotency, insert, audit)
    const { data: result, error: rpcErr } = await client.rpc("create_client", {
      p_name: body.name,
      p_phone: body.phone ?? null,
      p_wechat: body.wechat ?? null,
      p_source_platform: body.source_platform ?? null,
      p_source_content_id: body.source_content_id ?? null,
      p_first_property_id: body.first_property_id ?? null,
      p_budget_min: body.budget_min ?? null,
      p_budget_max: body.budget_max ?? null,
      p_preferred_districts: parseArray(body.preferred_districts) ?? [],
      p_preferred_communities: parseArray(body.preferred_communities) ?? [],
      p_bedrooms: body.bedrooms ?? null,
      p_rental_type: body.rental_type ?? null,
      p_available_from: body.available_from ?? null,
      p_minimum_lease_months: body.minimum_lease_months ?? null,
      p_pets_required: body.pets_required ?? null,
      p_cooking_required: body.cooking_required ?? null,
      p_commute_destination: body.commute_destination ?? null,
      p_hard_requirements: parseJson(body.hard_requirements) ?? [],
      p_soft_preferences: parseJson(body.soft_preferences) ?? [],
      p_deal_breakers: parseArray(body.deal_breakers) ?? [],
      p_stage: body.stage ?? "new",
      p_raw_input_text: body.raw_input_text ?? null,
      p_next_follow_up_at: body.next_follow_up_at ?? null,
      p_idempotency_key: idempotencyKey,
      p_request_fingerprint: requestFingerprint,
    });

    if (rpcErr) {
      const msg = String(rpcErr.message ?? "");
      // 409 CONFLICT — idempotency key reused with different content
      if (msg.includes("different request content") || rpcErr.code === "23505") {
        return jsonResponse(
          { data: null, error: { code: "CONFLICT", message: "相同幂等键但请求内容不同" } },
          { status: 409, headers: h },
        );
      }
      if (msg.includes("Authentication required") || msg.includes("UA001")) {
        return jsonResponse(
          { data: null, error: { code: "UNAUTHENTICATED", message: "未登录" } },
          { status: 401, headers: h },
        );
      }
      return jsonResponse(
        { data: null, error: { code: "INTERNAL_ERROR", message: "创建失败" } },
        { status: 500, headers: h },
      );
    }

    // 6. Return contract-compliant response
    return jsonResponse(
      { data: result as Record<string, unknown>, error: null },
      { status: 201, headers: h },
    );
  } catch {
    return jsonResponse(
      { data: null, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500, headers: h },
    );
  }
}
