// ============================================================
// Content Projects API — P3-AI-021 (Content Tables Foundation)
// GET  /api/content/projects     — list workspace content projects
// POST /api/content/projects     — create content project
// ============================================================

import type { NextRequest } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { requireFeature } from "@/features/access-control/guards";
import {
  CreateContentProjectSchema,
  ContentProjectsQuerySchema,
} from "@/features/content-projects/schemas";

// ============================================================
// GET — list content projects for current workspace
// ============================================================

export async function GET(request: NextRequest) {
  const { client, jsonResponse } = await createRouteHandlerClient(request);

  try {
    // Auth
    const { data: { user } } = await client.auth.getUser();
    if (!user) return jsonResponse(
      { data: null, error: { code: "UNAUTHENTICATED", message: "未登录" } },
      { status: 401 }
    );

    // Workspace
    const { data: member } = await client.from("workspace_members")
      .select("workspace_id").eq("user_id", user.id).eq("status", "active").limit(1).single();
    if (!member) return jsonResponse(
      { data: null, error: { code: "WORKSPACE_ACCESS_DENIED", message: "无工作区权限" } },
      { status: 403 }
    );

    const workspaceId = member.workspace_id;

    // Feature check
    try { await requireFeature("content_factory"); } catch {
      return jsonResponse(
        { data: null, error: { code: "FEATURE_DENIED", message: "需要内容工厂权限" } },
        { status: 403 }
      );
    }

    // Parse query
    const raw: Record<string, string> = {};
    new URL(request.url).searchParams.forEach((v, k) => { raw[k] = v; });
    const parsed = ContentProjectsQuerySchema.safeParse(raw);
    if (!parsed.success) return jsonResponse(
      { data: null, error: { code: "VALIDATION_FAILED", message: "参数校验失败", details: parsed.error.flatten() } },
      { status: 400 }
    );

    const { status, platform, limit, offset } = parsed.data;

    // Build query
    let query = client.from("content_projects")
      .select("*, properties!inner(title, city, district, community_name)", { count: "exact" })
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq("status", status);
    if (platform) query = query.eq("platform", platform);

    const { data, error, count } = await query;

    if (error) return jsonResponse(
      { data: null, error: { code: "DB_ERROR", message: error.message } },
      { status: 500 }
    );

    return jsonResponse({
      data: {
        data: data ?? [],
        total: count ?? 0,
        limit,
        offset,
      },
      error: null,
    });
  } catch (err) {
    return jsonResponse(
      { data: null, error: { code: "INTERNAL_ERROR", message: err instanceof Error ? err.message : "服务器错误" } },
      { status: 500 }
    );
  }
}

// ============================================================
// POST — create content project
// ============================================================

export async function POST(request: NextRequest) {
  const { client, jsonResponse } = await createRouteHandlerClient(request);

  try {
    // Auth
    const { data: { user } } = await client.auth.getUser();
    if (!user) return jsonResponse(
      { data: null, error: { code: "UNAUTHENTICATED", message: "未登录" } },
      { status: 401 }
    );

    // Workspace
    const { data: member } = await client.from("workspace_members")
      .select("workspace_id").eq("user_id", user.id).eq("status", "active").limit(1).single();
    if (!member) return jsonResponse(
      { data: null, error: { code: "WORKSPACE_ACCESS_DENIED", message: "无工作区权限" } },
      { status: 403 }
    );

    const workspaceId = member.workspace_id;

    // Feature check
    try { await requireFeature("content_factory"); } catch {
      return jsonResponse(
        { data: null, error: { code: "FEATURE_DENIED", message: "需要内容工厂权限" } },
        { status: 403 }
      );
    }

    // Verify property belongs to workspace
    const body = await request.json();
    const parsed = CreateContentProjectSchema.safeParse(body);
    if (!parsed.success) return jsonResponse(
      { data: null, error: { code: "VALIDATION_FAILED", message: "参数校验失败", details: parsed.error.flatten() } },
      { status: 400 }
    );

    const { property_id, ...rest } = parsed.data;

    const { data: property } = await client.from("properties")
      .select("id, allow_marketing_reuse")
      .eq("id", property_id)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .single();

    if (!property) return jsonResponse(
      { data: null, error: { code: "PROPERTY_NOT_FOUND", message: "房源不存在或无权访问" } },
      { status: 404 }
    );

    if (!property.allow_marketing_reuse) return jsonResponse(
      { data: null, error: { code: "MARKETING_REUSE_DENIED", message: "该房源未授权营销复用" } },
      { status: 403 }
    );

    // Insert
    const { data: created, error } = await client.from("content_projects")
      .insert({
        workspace_id: workspaceId,
        property_id,
        created_by: user.id,
        ...rest,
      })
      .select()
      .single();

    if (error) return jsonResponse(
      { data: null, error: { code: "DB_ERROR", message: error.message } },
      { status: 500 }
    );

    return jsonResponse({ data: created, error: null }, { status: 201 });
  } catch (err) {
    return jsonResponse(
      { data: null, error: { code: "INTERNAL_ERROR", message: err instanceof Error ? err.message : "服务器错误" } },
      { status: 500 }
    );
  }
}
