import type { NextRequest } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import {
  SharedPropertyQuerySchema,
  SHARED_PROPERTY_COLS,
} from "@/features/collaboration/schemas";

function urlOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost";
  return `${proto}://${host}`;
}
const cors = (o: string) => ({ "Access-Control-Allow-Origin": o, "Access-Control-Allow-Credentials": "true" });

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
  const origin = urlOrigin(request);
  const h = cors(origin);
  const { client, jsonResponse } = await createRouteHandlerClient(request);

  try {
    // 1. Auth
    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      return jsonResponse(
        { data: null, error: { code: "UNAUTHENTICATED", message: "未登录" } },
        { status: 401, headers: h }
      );
    }

    // 2. Workspace membership
    const { data: member } = await client
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .single();
    if (!member) {
      return jsonResponse(
        { data: null, error: { code: "WORKSPACE_ACCESS_DENIED", message: "无权限" } },
        { status: 403, headers: h }
      );
    }

    // 3. Feature entitlement check: shared_property_pool
    const { data: entitlement } = await client
      .from("feature_entitlements")
      .select("id, expires_at")
      .eq("user_id", user.id)
      .eq("feature", "shared_property_pool")
      .eq("status", "active")
      .maybeSingle();

    if (!entitlement) {
      return jsonResponse(
        { data: null, error: { code: "FEATURE_NOT_ALLOWED", message: "共享房源池功能未授权，请联系管理员开通" } },
        { status: 403, headers: h }
      );
    }

    if (entitlement.expires_at && new Date(entitlement.expires_at) <= new Date()) {
      return jsonResponse(
        { data: null, error: { code: "FEATURE_EXPIRED", message: "共享房源池功能已过期，请联系管理员续期" } },
        { status: 403, headers: h }
      );
    }

    // 4. Parse query params
    const raw: Record<string, string> = {};
    request.nextUrl.searchParams.forEach((v, k) => {
      raw[k] = v;
    });

    const parsed = SharedPropertyQuerySchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const msg = first ? `${first.path.join(".")}: ${first.message}` : "查询参数无效";
      return jsonResponse(
        { data: null, error: { code: "VALIDATION_FAILED", message: msg } },
        { status: 422, headers: h }
      );
    }

    const q = parsed.data;

    // 5. Build query — shared properties (cross-workspace)
    // is_shared = true, not deleted, not expired
    let query = client
      .from("properties")
      .select(SHARED_PROPERTY_COLS, { count: "exact", head: false })
      .eq("is_shared", true)
      .is("deleted_at", null);

    // Filter: shared_expires_at is NULL or > now()
    // Since OR in Supabase client is limited, we handle this as:
    // shared_expires_at IS NULL OR shared_expires_at > now()
    const now = new Date().toISOString();
    query = query.or(`shared_expires_at.is.null,shared_expires_at.gt.${now}`);

    // 6. Conditional filters (same as properties route)
    if (q.district) {
      if (Array.isArray(q.district)) {
        query = query.in("district", q.district);
      } else {
        query = query.ilike("district", `%${q.district}%`);
      }
    }
    if (q.city)             query = query.ilike("city", `%${q.city}`);
    if (q.businessArea)     query = query.ilike("business_area", `%${q.businessArea}`);
    if (q.communityName)    query = query.ilike("community_name", `%${q.communityName}`);
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
    if (q.subwayText)      query = query.ilike("subway_text", `%${q.subwayText}%`);

    // Text search across multiple fields
    if (q.search) {
      const pattern = `%${q.search}%`;
      query = query.or(
        `title.ilike.${pattern},description.ilike.${pattern},community_name.ilike.${pattern},subway_text.ilike.${pattern}`
      );
    }

    // 7. Sort with tie-breaker
    const sort = sortClause(q.sortBy, q.sortOrder);
    query = query.order(sort.column, { ascending: sort.ascending, nullsFirst: !sort.nullsLast });
    query = query.order("id", { ascending: true }); // deterministic tie-breaker

    // 8. Pagination
    const from = (q.page - 1) * q.limit;
    const to = from + q.limit - 1;
    query = query.range(from, to);

    // 9. Execute
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
