// ============================================================
// Publishing Record Detail API — P3-AI-021
// PATCH /api/content/projects/[id]/publishing/[recordId] — update metrics
// ============================================================

import type { NextRequest } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { requireFeature } from "@/features/access-control/guards";
import { UpdatePublishingRecordSchema } from "@/features/content-projects/schemas";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; recordId: string }> }
) {
  const { client, jsonResponse } = await createRouteHandlerClient(request);
  const { id, recordId } = await params;

  try {
    const { data: { user } } = await client.auth.getUser();
    if (!user) return jsonResponse(
      { data: null, error: { code: "UNAUTHENTICATED", message: "未登录" } },
      { status: 401 }
    );

    const { data: member } = await client.from("workspace_members")
      .select("workspace_id").eq("user_id", user.id).eq("status", "active").limit(1).single();
    if (!member) return jsonResponse(
      { data: null, error: { code: "WORKSPACE_ACCESS_DENIED", message: "无工作区权限" } },
      { status: 403 }
    );

    try { await requireFeature("content_factory"); } catch {
      return jsonResponse(
        { data: null, error: { code: "FEATURE_DENIED", message: "需要内容工厂权限" } },
        { status: 403 }
      );
    }

    // Verify project belongs to workspace
    const { data: project } = await client.from("content_projects")
      .select("id").eq("id", id).eq("workspace_id", member.workspace_id).is("deleted_at", null).single();
    if (!project) return jsonResponse(
      { data: null, error: { code: "NOT_FOUND", message: "内容项目不存在" } },
      { status: 404 }
    );

    // Verify the record exists and belongs to this workspace
    const { data: record } = await client.from("publishing_records")
      .select("id").eq("id", recordId).eq("workspace_id", member.workspace_id).single();
    if (!record) return jsonResponse(
      { data: null, error: { code: "NOT_FOUND", message: "发布记录不存在" } },
      { status: 404 }
    );

    // Parse and validate
    const body = await request.json();
    const parsed = UpdatePublishingRecordSchema.safeParse(body);
    if (!parsed.success) return jsonResponse(
      { data: null, error: { code: "VALIDATION_FAILED", message: "参数校验失败", details: parsed.error.flatten() } },
      { status: 400 }
    );

    // Only include fields that were actually submitted
    const updateData: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed.data)) {
      if (v !== undefined) updateData[k] = v;
    }

    if (Object.keys(updateData).length === 0) return jsonResponse(
      { data: null, error: { code: "VALIDATION_FAILED", message: "没有可更新的字段" } },
      { status: 400 }
    );

    const { data: updated, error } = await client.from("publishing_records")
      .update(updateData)
      .eq("id", recordId)
      .eq("workspace_id", member.workspace_id)
      .select()
      .single();

    if (error) return jsonResponse(
      { data: null, error: { code: "DB_ERROR", message: error.message } },
      { status: 500 }
    );

    return jsonResponse({ data: updated, error: null });
  } catch (err) {
    return jsonResponse(
      { data: null, error: { code: "INTERNAL_ERROR", message: err instanceof Error ? err.message : "服务器错误" } },
      { status: 500 }
    );
  }
}
