import type { NextRequest } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { PropertyQuerySchema } from "@/features/properties/schemas";
import { computeFieldDiff, shouldRecordDiff } from "@/features/ai-corrections/diff";

const DEFERRED_PARAMS = new Set(["hasContent", "last_content_at", "last_published_at"]);

function urlOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost";
  return `${proto}://${host}`;
}
const cors = (o: string) => ({ "Access-Control-Allow-Origin": o, "Access-Control-Allow-Credentials": "true" });

// Non-sensitive columns for list responses. Excludes building_no, unit_no, room_no.
const LIST_COLS = "id,workspace_id,created_by,title,city,district,business_area,community_name,address_text,rental_type,monthly_rent,deposit_terms,bedrooms,living_rooms,bathrooms,area_sqm,floor,total_floors,has_elevator,orientation,decoration,available_from,minimum_lease_months,pets_allowed,cooking_allowed,subway_text,facilities,tags,selling_points,drawbacks,description,visual_summary,visual_fact_flags,status,is_shared,allow_marketing_reuse,marketing_reuse_granted_at,shared_at,shared_expires_at,commission_split,raw_input_text,source_type,created_at,updated_at,deleted_at";

// Sort config: sortBy → SQL ORDER BY clause
function sortClause(sortBy: string, sortOrder: string): { column: string; ascending: boolean; nullsLast: boolean } {
  switch (sortBy) {
    case "monthly_rent_asc":
      return { column: "monthly_rent", ascending: true, nullsLast: true };
    case "monthly_rent_desc":
      return { column: "monthly_rent", ascending: false, nullsLast: true };
    case "available_from":
      return { column: "available_from", ascending: sortOrder === "asc", nullsLast: true };
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

    // 2. Check for deferred params (from Phase 3 content_factory — not yet implemented)
    for (const k of request.nextUrl.searchParams.keys()) {
      if (DEFERRED_PARAMS.has(k)) {
        return jsonResponse(
          { data: null, error: { code: "DEFERRED_FEATURE", message: `参数 "${k}" 尚未实现` } },
          { status: 422, headers: h }
        );
      }
    }

    // 3. Parse query params
    const raw: Record<string, string> = {};
    request.nextUrl.searchParams.forEach((v, k) => { raw[k] = v; });

    const parsed = PropertyQuerySchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const msg = first ? `${first.path.join(".")}: ${first.message}` : "查询参数无效";
      return jsonResponse(
        { data: null, error: { code: "VALIDATION_FAILED", message: msg } },
        { status: 422, headers: h }
      );
    }

    const q = parsed.data;

    // 4. Build query — mandatory filters
    let query = client.from("properties")
      .select(LIST_COLS, { count: "exact", head: false })
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null);

    // 5. Conditional filters
    if (q.status)           query = query.eq("status", q.status);
    if (q.district) {
      if (Array.isArray(q.district)) {
        query = query.in("district", q.district);
      } else {
        query = query.ilike("district", `%${q.district}%`);
      }
    }
    if (q.city)             query = query.ilike("city", `%${q.city}%`);
    if (q.businessArea)     query = query.ilike("business_area", `%${q.businessArea}%`);
    if (q.communityName)    query = query.ilike("community_name", `%${q.communityName}%`);
    if (q.rentalType)       query = query.eq("rental_type", q.rentalType);
    if (q.bedrooms != null) query = query.eq("bedrooms", q.bedrooms);
    if (q.minRent != null)  query = query.gte("monthly_rent", q.minRent);
    if (q.maxRent != null)  query = query.lte("monthly_rent", q.maxRent);
    if (q.minArea != null)  query = query.gte("area_sqm", q.minArea);
    if (q.maxArea != null)  query = query.lte("area_sqm", q.maxArea);
    if (q.petsAllowed !== undefined)    query = query.eq("pets_allowed", q.petsAllowed);
    if (q.cookingAllowed !== undefined) query = query.eq("cooking_allowed", q.cookingAllowed);
    if (q.hasElevator !== undefined)    query = query.eq("has_elevator", q.hasElevator);
    if (q.availableBefore) query = query.lte("available_from", q.availableBefore);
    if (q.availableAfter)  query = query.gte("available_from", q.availableAfter);
    if (q.isShared !== undefined)       query = query.eq("is_shared", q.isShared);
    if (q.subwayText)      query = query.ilike("subway_text", `%${q.subwayText}%`);

    // Text search across multiple fields
    if (q.search) {
      const pattern = `%${q.search}%`;
      query = query.or(
        `title.ilike.${pattern},description.ilike.${pattern},community_name.ilike.${pattern},subway_text.ilike.${pattern}`
      );
    }

    // 6. Sort with tie-breaker
    const sort = sortClause(q.sortBy, q.sortOrder);
    query = query.order(sort.column, { ascending: sort.ascending, nullsFirst: !sort.nullsLast });
    query = query.order("id", { ascending: true }); // deterministic tie-breaker

    // 7. Pagination
    const from = (q.page - 1) * q.limit;
    const to = from + q.limit - 1;
    query = query.range(from, to);

    // 8. Execute
    const { data, error, count } = await query;

    if (error) {
      return jsonResponse(
        { data: null, error: { code: "INTERNAL_ERROR", message: "查询失败" } },
        { status: 500, headers: h }
      );
    }

    return jsonResponse(
      { data: { properties: data ?? [], total: count ?? 0, page: q.page, limit: q.limit }, error: null },
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
    const workspaceId = member.workspace_id;
    const body = await request.json();

    // P3-AI-012: Extract AI correction fields
    // NOTE: aiOriginalOutput is currently client-provided. Per ai-contract §9,
    // the server should retrieve the original AI output from server-side storage
    // keyed by requestId. This is a known limitation until server-side extraction
    // result storage is implemented (tracked as P3-AI-012-STORAGE).
    const requestId: string | undefined = body.requestId;
    const aiOriginalOutput: Record<string, unknown> | undefined = body.aiOriginalOutput;
    const shouldDiff = shouldRecordDiff(requestId);

    const { data: propertyId, error } = await client.rpc("create_property_with_private_details", {
      p_workspace_id: workspaceId,
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

    // P3-AI-012: Record AI correction diff if requestId is present
    if (shouldDiff && requestId && aiOriginalOutput && propertyId) {
      try {
        // Build user-confirmed data from the same fields sent to the RPC
        const userConfirmed: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(body)) {
          if (k !== "requestId" && k !== "aiOriginalOutput") {
            userConfirmed[k] = v;
          }
        }

        // Sanitize sensitive fields from both objects before storage
        const EXCLUDED = new Set([
          "owner_phone", "owner_wechat", "exact_address", "key_location",
          "phone", "wechat", "internal_notes", "client_id_number",
        ]);
        function sanitize(obj: Record<string, unknown>): Record<string, unknown> {
          const out: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(obj)) {
            if (EXCLUDED.has(k)) continue;
            out[k] = v;
          }
          return out;
        }

        const diffs = computeFieldDiff(aiOriginalOutput, userConfirmed);
        if (diffs.length > 0) {
          await client.rpc("record_ai_correction", {
            p_user_id: user.id,
            p_workspace_id: workspaceId,
            p_feature: "ai_data_extraction",
            p_request_id: requestId,
            p_entity_type: "property",
            p_entity_id: propertyId,
            p_prompt_version: "1",
            p_model_name: "deepseek-v4-flash",
            p_original_output: sanitize(aiOriginalOutput),
            p_corrected_output: sanitize(userConfirmed),
            p_diff: diffs,
          });
        }
      } catch {
        // Correction recording is best-effort; property creation already succeeded
      }
    }

    return jsonResponse({ id: propertyId }, { status: 201, headers: h });
  } catch {
    return jsonResponse({ error: "服务器错误" }, { status: 500, headers: h });
  }
}
