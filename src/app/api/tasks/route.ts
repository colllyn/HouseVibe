import type { NextRequest } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { CreateTaskInputSchema, TaskQuerySchema } from "@/features/tasks/schemas";

function urlOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost";
  return `${proto}://${host}`;
}
const cors = (o: string) => ({ "Access-Control-Allow-Origin": o, "Access-Control-Allow-Credentials": "true" });

// Non-sensitive columns for list responses.
const LIST_COLS = "id,workspace_id,assigned_to,task_type,title,description,property_id,client_id,content_project_id,collaboration_request_id,status,due_at,completed_at,created_at,updated_at,deleted_at";

function sortClause(sortBy: string, sortOrder: string): { column: string; ascending: boolean; nullsLast: boolean } {
  switch (sortBy) {
    case "updated_at":
      return { column: "updated_at", ascending: sortOrder === "asc", nullsLast: false };
    case "due_at":
      return { column: "due_at", ascending: sortOrder === "asc", nullsLast: true };
    default: // "created_at"
      return { column: "created_at", ascending: sortOrder === "asc", nullsLast: false };
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

    const parsed = TaskQuerySchema.safeParse(raw);
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
    let query = client.from("tasks")
      .select(LIST_COLS, { count: "exact", head: false })
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null);

    // 4. Conditional filters
    if (q.status)      query = query.eq("status", q.status);
    if (q.taskType)    query = query.eq("task_type", q.taskType);
    if (q.assignedTo)  query = query.eq("assigned_to", q.assignedTo);
    if (q.dueBefore)   query = query.lte("due_at", q.dueBefore);
    if (q.dueAfter)    query = query.gte("due_at", q.dueAfter);

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
      { data: { tasks: data ?? [], total: count ?? 0, page: q.page, limit: q.limit }, error: null },
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

    // 3. Validate
    const parsed = CreateTaskInputSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const msg = first ? `${first.path.join(".")}: ${first.message}` : "请求参数无效";
      return jsonResponse(
        { data: null, error: { code: "VALIDATION_FAILED", message: msg } },
        { status: 422, headers: h },
      );
    }

    const validated = parsed.data;

    // 4. Insert task directly
    const { data: inserted, error: insertErr } = await client.from("tasks")
      .insert({
        workspace_id: member.workspace_id,
        assigned_to: user.id,
        task_type: validated.taskType,
        title: validated.title,
        description: validated.description ?? null,
        property_id: validated.propertyId ?? null,
        client_id: validated.clientId ?? null,
        due_at: validated.dueAt ?? null,
        content_project_id: validated.contentProjectId ?? null,
        collaboration_request_id: validated.collaborationRequestId ?? null,
        status: "todo",
      })
      .select("*")
      .single();

    if (insertErr) {
      return jsonResponse(
        { data: null, error: { code: "INTERNAL_ERROR", message: "创建失败" } },
        { status: 500, headers: h },
      );
    }

    // 5. Return contract-compliant response
    return jsonResponse(
      { data: inserted as Record<string, unknown>, error: null },
      { status: 201, headers: h },
    );
  } catch {
    return jsonResponse(
      { data: null, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500, headers: h },
    );
  }
}
