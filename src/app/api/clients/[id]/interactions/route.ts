import type { NextRequest } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import {
  CreateInteractionInputSchema,
  InteractionQuerySchema,
} from "@/features/clients/schemas";

function urlOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost";
  return `${proto}://${host}`;
}
const cors = (o: string) => ({ "Access-Control-Allow-Origin": o, "Access-Control-Allow-Credentials": "true" });

// List columns exclude verbose fields (raw_text, next_action) per contract §3.4
const LIST_COLS =
  "id,workspace_id,client_id,interaction_type,summary,occurred_at,created_at,created_by,property_id,updated_at";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;
  const origin = urlOrigin(request);
  const h = cors(origin);
  const { client, jsonResponse } = await createRouteHandlerClient(request);

  try {
    // 1. Auth
    const { data: { user } } = await client.auth.getUser();
    if (!user)
      return jsonResponse(
        { data: null, error: { code: "UNAUTHENTICATED", message: "未登录" } },
        { status: 401, headers: h }
      );

    // 2. Workspace membership
    const { data: member } = await client
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .single();
    if (!member)
      return jsonResponse(
        { data: null, error: { code: "WORKSPACE_ACCESS_DENIED", message: "无权限" } },
        { status: 403, headers: h }
      );

    const workspaceId = member.workspace_id;

    // 3. Verify client exists in workspace
    const { data: clientExists } = await client
      .from("clients")
      .select("id")
      .eq("id", clientId)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .single();
    if (!clientExists)
      return jsonResponse(
        { data: null, error: { code: "RESOURCE_NOT_FOUND", message: "客户不存在" } },
        { status: 404, headers: h }
      );

    // 4. Parse query params
    const raw: Record<string, string> = {};
    request.nextUrl.searchParams.forEach((v, k) => {
      raw[k] = v;
    });

    const parsed = InteractionQuerySchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const msg = first
        ? `${first.path.join(".")}: ${first.message}`
        : "查询参数无效";
      return jsonResponse(
        { data: null, error: { code: "VALIDATION_FAILED", message: msg } },
        { status: 422, headers: h }
      );
    }

    const q = parsed.data;

    // 5. Build query
    let query = client
      .from("interactions")
      .select(LIST_COLS, { count: "exact", head: false })
      .eq("workspace_id", workspaceId)
      .eq("client_id", clientId)
      .is("deleted_at", null);

    // 6. Type filter
    if (q.type) query = query.eq("interaction_type", q.type);

    // 7. Sort: occurred_at (primary) + created_at DESC tie-breaker + id ASC final
    query = query.order("occurred_at", {
      ascending: q.sortOrder === "asc",
    });
    query = query.order("created_at", { ascending: false });
    query = query.order("id", { ascending: true });

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
      {
        data: {
          interactions: data ?? [],
          total: count ?? 0,
          page: q.page,
          limit: q.limit,
        },
        error: null,
      },
      { headers: h }
    );
  } catch {
    return jsonResponse(
      { data: null, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500, headers: h }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;
  const origin = urlOrigin(request);
  const h = cors(origin);
  const { client, jsonResponse } = await createRouteHandlerClient(request);

  try {
    // 1. Auth
    const { data: { user } } = await client.auth.getUser();
    if (!user)
      return jsonResponse(
        { data: null, error: { code: "UNAUTHENTICATED", message: "未登录" } },
        { status: 401, headers: h }
      );

    // 2. Workspace membership
    const { data: member } = await client
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .single();
    if (!member)
      return jsonResponse(
        { data: null, error: { code: "WORKSPACE_ACCESS_DENIED", message: "无权限" } },
        { status: 403, headers: h }
      );

    const workspaceId = member.workspace_id;

    // 3. Parse body
    const body = await request.json();

    // 4. Zod validation
    const parsed = CreateInteractionInputSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const msg = first
        ? `${first.path.join(".")}: ${first.message}`
        : "请求参数无效";
      return jsonResponse(
        { data: null, error: { code: "VALIDATION_FAILED", message: msg } },
        { status: 422, headers: h }
      );
    }

    const validated = parsed.data;

    // 5. Verify client exists in workspace
    const { data: clientExists } = await client
      .from("clients")
      .select("id")
      .eq("id", clientId)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .single();
    if (!clientExists)
      return jsonResponse(
        { data: null, error: { code: "RESOURCE_NOT_FOUND", message: "客户不存在" } },
        { status: 404, headers: h }
      );

    // 6. Call atomic create_interaction RPC
    const { data: result, error: rpcErr } = await client.rpc(
      "create_interaction",
      {
        p_client_id: clientId,
        p_interaction_type: validated.interaction_type,
        p_summary: validated.summary ?? null,
        p_raw_text: validated.raw_text ?? null,
        p_next_action: validated.next_action ?? null,
        p_occurred_at: validated.occurred_at,
        p_property_id: validated.property_id ?? null,
      }
    );

    if (rpcErr) {
      const msg = String(rpcErr.message ?? "");
      if (msg.includes("Authentication required")) {
        return jsonResponse(
          { data: null, error: { code: "UNAUTHENTICATED", message: "未登录" } },
          { status: 401, headers: h }
        );
      }
      return jsonResponse(
        { data: null, error: { code: "INTERNAL_ERROR", message: "创建失败" } },
        { status: 500, headers: h }
      );
    }

    return jsonResponse(
      { data: result as Record<string, unknown>, error: null },
      { status: 201, headers: h }
    );
  } catch {
    return jsonResponse(
      { data: null, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500, headers: h }
    );
  }
}
