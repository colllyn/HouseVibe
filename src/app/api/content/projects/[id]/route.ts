// ============================================================
// Content Project [id] API — P3-AI-021
// GET    /api/content/projects/[id]  — get single project
// PATCH  /api/content/projects/[id]  — update project
// DELETE /api/content/projects/[id]  — soft delete
// ============================================================

import type { NextRequest } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { requireFeature } from "@/features/access-control/guards";
import { UpdateContentProjectSchema } from "@/features/content-projects/schemas";

// ============================================================
// GET — single content project
// ============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { client, jsonResponse } = await createRouteHandlerClient(request);
  const { id } = await params;

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

    const { data, error } = await client.from("content_projects")
      .select("*, properties(title, city, district, community_name)")
      .eq("id", id)
      .eq("workspace_id", member.workspace_id)
      .is("deleted_at", null)
      .single();

    if (error || !data) return jsonResponse(
      { data: null, error: { code: "NOT_FOUND", message: "内容项目不存在" } },
      { status: 404 }
    );

    return jsonResponse({ data, error: null });
  } catch (err) {
    return jsonResponse(
      { data: null, error: { code: "INTERNAL_ERROR", message: err instanceof Error ? err.message : "服务器错误" } },
      { status: 500 }
    );
  }
}

// ============================================================
// PATCH — update content project
// ============================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { client, jsonResponse } = await createRouteHandlerClient(request);
  const { id } = await params;

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

    // Verify project exists in workspace
    const { data: existing } = await client.from("content_projects")
      .select("id").eq("id", id).eq("workspace_id", member.workspace_id).is("deleted_at", null).single();
    if (!existing) return jsonResponse(
      { data: null, error: { code: "NOT_FOUND", message: "内容项目不存在" } },
      { status: 404 }
    );

    const body = await request.json();
    const parsed = UpdateContentProjectSchema.safeParse(body);
    if (!parsed.success) return jsonResponse(
      { data: null, error: { code: "VALIDATION_FAILED", message: "参数校验失败", details: parsed.error.flatten() } },
      { status: 400 }
    );

    const { data, error } = await client.from("content_projects")
      .update(parsed.data)
      .eq("id", id)
      .eq("workspace_id", member.workspace_id)
      .select()
      .single();

    if (error) return jsonResponse(
      { data: null, error: { code: "DB_ERROR", message: error.message } },
      { status: 500 }
    );

    return jsonResponse({ data, error: null });
  } catch (err) {
    return jsonResponse(
      { data: null, error: { code: "INTERNAL_ERROR", message: err instanceof Error ? err.message : "服务器错误" } },
      { status: 500 }
    );
  }
}

// ============================================================
// DELETE — soft delete content project
// ============================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { client, jsonResponse } = await createRouteHandlerClient(request);
  const { id } = await params;

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

    // Verify exists
    const { data: existing } = await client.from("content_projects")
      .select("id").eq("id", id).eq("workspace_id", member.workspace_id).is("deleted_at", null).single();
    if (!existing) return jsonResponse(
      { data: null, error: { code: "NOT_FOUND", message: "内容项目不存在" } },
      { status: 404 }
    );

    // Soft delete
    const { error } = await client.from("content_projects")
      .update({ deleted_at: new Date().toISOString(), status: "archived" })
      .eq("id", id)
      .eq("workspace_id", member.workspace_id);

    if (error) return jsonResponse(
      { data: null, error: { code: "DB_ERROR", message: error.message } },
      { status: 500 }
    );

    return jsonResponse({ data: { id, deleted: true }, error: null });
  } catch (err) {
    return jsonResponse(
      { data: null, error: { code: "INTERNAL_ERROR", message: err instanceof Error ? err.message : "服务器错误" } },
      { status: 500 }
    );
  }
}
