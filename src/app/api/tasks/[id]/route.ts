import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { UpdateTaskInputSchema } from "@/features/tasks/schemas";
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
  if (!user) return jsonResponse({ data: null, error: { code: "UNAUTHENTICATED", message: "未登录" } }, { status: 401, headers: h });
  const { data: member } = await client.from("workspace_members")
    .select("workspace_id").eq("user_id", user.id).eq("status", "active").limit(1).single();
  if (!member) return jsonResponse({ data: null, error: { code: "WORKSPACE_ACCESS_DENIED", message: "无权限" } }, { status: 403, headers: h });

  const { data: task } = await client.from("tasks")
    .select("*")
    .eq("id", id).eq("workspace_id", member.workspace_id).is("deleted_at", null).single();
  if (!task) return jsonResponse({ data: null, error: { code: "RESOURCE_NOT_FOUND", message: "任务不存在" } }, { status: 404, headers: h });

  return jsonResponse({ data: task, error: null }, { headers: h });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const origin = urlOrigin(request); const h = cors(origin);
  const { client, jsonResponse } = await createRouteHandlerClient(request);
  try {
    const { data: { user } } = await client.auth.getUser();
    if (!user) return jsonResponse({ data: null, error: { code: "UNAUTHENTICATED", message: "未登录" } }, { status: 401, headers: h });
    const { data: member } = await client.from("workspace_members")
      .select("workspace_id").eq("user_id", user.id).eq("status", "active").limit(1).single();
    if (!member) return jsonResponse({ data: null, error: { code: "WORKSPACE_ACCESS_DENIED", message: "无权限" } }, { status: 403, headers: h });

    const body = await request.json();

    // Zod validation
    const parsed = UpdateTaskInputSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const msg = first ? `${first.path.join(".")}: ${first.message}` : "请求参数无效";
      return jsonResponse(
        { data: null, error: { code: "VALIDATION_FAILED", message: msg } },
        { status: 422, headers: h },
      );
    }

    const validated = parsed.data;

    // Verify task belongs to workspace
    const { data: existing } = await client.from("tasks")
      .select("id,status").eq("id", id).eq("workspace_id", member.workspace_id).is("deleted_at", null).single();
    if (!existing) return jsonResponse({ data: null, error: { code: "RESOURCE_NOT_FOUND", message: "任务不存在" } }, { status: 404, headers: h });

    // Build update payload from validated Zod data
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

    // Map Zod keys to DB column names
    const keyMap: Record<string, string> = {
      taskType: "task_type",
      title: "title",
      description: "description",
      propertyId: "property_id",
      clientId: "client_id",
      dueAt: "due_at",
      status: "status",
      contentProjectId: "content_project_id",
      collaborationRequestId: "collaboration_request_id",
    };

    for (const [zodKey, dbKey] of Object.entries(keyMap)) {
      if (validated[zodKey as keyof typeof validated] !== undefined) {
        update[dbKey] = validated[zodKey as keyof typeof validated];
      }
    }

    // If status changes to "done", set completed_at
    if (validated.status === "done" && existing.status !== "done") {
      update.completed_at = new Date().toISOString();
    }

    // If status changes away from "done", clear completed_at
    if (validated.status && validated.status !== "done" && existing.status === "done") {
      update.completed_at = null;
    }

    const { error: updateErr } = await client.from("tasks")
      .update(update)
      .eq("id", id).eq("workspace_id", member.workspace_id).is("deleted_at", null);

    if (updateErr) return jsonResponse({ data: null, error: { code: "INTERNAL_ERROR", message: "更新失败" } }, { status: 500, headers: h });

    return jsonResponse({ data: { success: true }, error: null }, { headers: h });
  } catch {
    return jsonResponse({ data: null, error: { code: "INTERNAL_ERROR", message: "服务器错误" } }, { status: 500, headers: h });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const origin = urlOrigin(request); const h = cors(origin);
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

    // 3. Verify task exists and belongs to workspace (not already deleted)
    const { data: existing } = await client.from("tasks")
      .select("id").eq("id", id).eq("workspace_id", member.workspace_id).is("deleted_at", null).single();
    if (!existing) {
      return jsonResponse(
        { data: null, error: { code: "RESOURCE_NOT_FOUND", message: "任务不存在" } },
        { status: 404, headers: h },
      );
    }

    // 4. Soft delete via update
    const now = new Date().toISOString();
    const { error: deleteErr } = await client.from("tasks")
      .update({ deleted_at: now, updated_at: now })
      .eq("id", id).eq("workspace_id", member.workspace_id).is("deleted_at", null);

    if (deleteErr) return jsonResponse(
      { data: null, error: { code: "INTERNAL_ERROR", message: "删除失败" } },
      { status: 500, headers: h },
    );

    // 5. Return contract-compliant response
    return jsonResponse(
      { data: { deleted: true, deletedAt: now }, error: null },
      { headers: h },
    );
  } catch {
    return jsonResponse(
      { data: null, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500, headers: h },
    );
  }
}
