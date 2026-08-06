// ============================================================
// Publishing Records API — P3-AI-021
// GET  /api/content/projects/[id]/publishing — list records
// POST /api/content/projects/[id]/publishing — create record
// ============================================================

import type { NextRequest } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { requireFeature } from "@/features/access-control/guards";
import {
  CreatePublishingRecordSchema,
  PublishingRecordsQuerySchema,
} from "@/features/content-projects/schemas";

// ============================================================
// GET — list publishing records for a content project
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

    // Verify project belongs to workspace
    const { data: project } = await client.from("content_projects")
      .select("id").eq("id", id).eq("workspace_id", member.workspace_id).is("deleted_at", null).single();
    if (!project) return jsonResponse(
      { data: null, error: { code: "NOT_FOUND", message: "内容项目不存在" } },
      { status: 404 }
    );

    // Parse query params
    const url = new URL(request.url);
    const query = PublishingRecordsQuerySchema.safeParse({
      platform: url.searchParams.get("platform") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
    });

    if (!query.success) return jsonResponse(
      { data: null, error: { code: "VALIDATION_FAILED", message: "查询参数无效", details: query.error.flatten() } },
      { status: 400 }
    );

    let dbQuery = client.from("publishing_records")
      .select("*")
      .eq("content_project_id", id)
      .eq("workspace_id", member.workspace_id)
      .order("published_at", { ascending: false });

    if (query.data.platform) dbQuery = dbQuery.eq("platform", query.data.platform);
    dbQuery = dbQuery.range(query.data.offset, query.data.offset + query.data.limit - 1);

    const { data, error } = await dbQuery;

    if (error) return jsonResponse(
      { data: null, error: { code: "DB_ERROR", message: error.message } },
      { status: 500 }
    );

    return jsonResponse({ data: data ?? [], error: null });
  } catch (err) {
    return jsonResponse(
      { data: null, error: { code: "INTERNAL_ERROR", message: err instanceof Error ? err.message : "服务器错误" } },
      { status: 500 }
    );
  }
}

// ============================================================
// POST — create a new publishing record
// ============================================================

export async function POST(
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

    const workspaceId = member.workspace_id;

    try { await requireFeature("content_factory"); } catch {
      return jsonResponse(
        { data: null, error: { code: "FEATURE_DENIED", message: "需要内容工厂权限" } },
        { status: 403 }
      );
    }

    // Verify project belongs to workspace
    const { data: project } = await client.from("content_projects")
      .select("id, platform").eq("id", id).eq("workspace_id", workspaceId).is("deleted_at", null).single();
    if (!project) return jsonResponse(
      { data: null, error: { code: "NOT_FOUND", message: "内容项目不存在" } },
      { status: 404 }
    );

    // Parse and validate
    const body = await request.json();
    const parsed = CreatePublishingRecordSchema.safeParse(body);
    if (!parsed.success) return jsonResponse(
      { data: null, error: { code: "VALIDATION_FAILED", message: "参数校验失败", details: parsed.error.flatten() } },
      { status: 400 }
    );

    // Verify the content_version belongs to this project
    const { data: version } = await client.from("content_versions")
      .select("id").eq("id", parsed.data.content_version_id).eq("content_project_id", id).single();
    if (!version) return jsonResponse(
      { data: null, error: { code: "VERSION_NOT_FOUND", message: "关联版本不存在" } },
      { status: 400 }
    );

    // Insert record
    const { data: created, error } = await client.from("publishing_records")
      .insert({
        workspace_id: workspaceId,
        content_project_id: id,
        content_version_id: parsed.data.content_version_id,
        platform: parsed.data.platform,
        published_at: parsed.data.published_at,
        post_url: parsed.data.post_url || null,
        content_code: parsed.data.content_code ?? null,
        private_message_keyword: parsed.data.private_message_keyword ?? null,
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
