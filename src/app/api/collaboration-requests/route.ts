import type { NextRequest } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";

function urlOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost";
  return `${proto}://${host}`;
}
const cors = (o: string) => ({ "Access-Control-Allow-Origin": o, "Access-Control-Allow-Credentials": "true" });

// Columns for collaboration request list — join property title and workspace names
const REQUEST_COLS =
  "id,requester_workspace_id,owner_workspace_id,property_id,message,status,requested_at,responded_at,created_at,updated_at";

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

    const workspaceId = member.workspace_id;

    // 3. Query params: tab = "received" | "sent"
    const tab = request.nextUrl.searchParams.get("tab") ?? "received";
    const page = parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10) || 1;
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") ?? "20", 10) || 20, 100);

    // 4. Build query
    let query = client
      .from("collaboration_requests")
      .select(REQUEST_COLS, { count: "exact", head: false });

    if (tab === "received") {
      // Requests where my workspace is the owner
      query = query.eq("owner_workspace_id", workspaceId);
    } else {
      // Requests where my workspace is the requester
      query = query.eq("requester_workspace_id", workspaceId);
    }

    query = query.order("requested_at", { ascending: false });

    // Pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    // 5. Execute
    const { data, error, count } = await query;

    if (error) {
      return jsonResponse(
        { data: null, error: { code: "INTERNAL_ERROR", message: "查询失败" } },
        { status: 500, headers: h }
      );
    }

    if (!data || data.length === 0) {
      return jsonResponse(
        { data: { requests: [], total: 0, page, limit }, error: null },
        { headers: h }
      );
    }

    // 6. Enrich: fetch property titles and workspace names
    const propertyIds = [...new Set(data.map((r) => r.property_id))];
    const workspaceIds = [
      ...new Set([
        ...data.map((r) => r.requester_workspace_id),
        ...data.map((r) => r.owner_workspace_id),
      ]),
    ];

    // Fetch property titles (only desensitized fields)
    const { data: properties } = await client
      .from("properties")
      .select("id, title, community_name, district, city")
      .in("id", propertyIds);

    const propMap = new Map((properties ?? []).map((p) => [p.id, p]));

    // Fetch workspace names
    const { data: workspaces } = await client
      .from("workspaces")
      .select("id, name")
      .in("id", workspaceIds);

    const wsMap = new Map((workspaces ?? []).map((w) => [w.id, w]));

    // Enrich each request
    const enriched = data.map((r) => ({
      ...r,
      property: propMap.get(r.property_id) ?? null,
      requester_workspace: wsMap.get(r.requester_workspace_id)?.name ?? null,
      owner_workspace: wsMap.get(r.owner_workspace_id)?.name ?? null,
    }));

    return jsonResponse(
      { data: { requests: enriched, total: count ?? 0, page, limit }, error: null },
      { headers: h }
    );
  } catch {
    return jsonResponse(
      { data: null, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500, headers: h }
    );
  }
}
