// ============================================================
// Content Project Versions API — P3-AI-021
// GET  /api/content/projects/[id]/versions     — list versions
// POST /api/content/projects/[id]/versions     — save generated content as version
// ============================================================

import type { NextRequest } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { requireFeature } from "@/features/access-control/guards";
import { CreateContentVersionSchema } from "@/features/content-projects/schemas";

// ============================================================
// GET — list versions for a content project
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

    // P1-3: Defense-in-depth — filter by workspace_id alongside content_project_id
    const { data, error } = await client.from("content_versions")
      .select("*")
      .eq("content_project_id", id)
      .eq("workspace_id", member.workspace_id)
      .order("version_number", { ascending: false });

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
// POST — save generated content as a new version
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
      .select("id").eq("id", id).eq("workspace_id", workspaceId).is("deleted_at", null).single();
    if (!project) return jsonResponse(
      { data: null, error: { code: "NOT_FOUND", message: "内容项目不存在" } },
      { status: 404 }
    );

    // Parse and validate
    const body = await request.json();
    const parsed = CreateContentVersionSchema.safeParse(body);
    if (!parsed.success) return jsonResponse(
      { data: null, error: { code: "VALIDATION_FAILED", message: "参数校验失败", details: parsed.error.flatten() } },
      { status: 400 }
    );

    // P0-2: Server-side compliance consistency check
    // If compliance_flags is non-empty, compliance_status must NOT be "clean"
    const flags = parsed.data.compliance_flags ?? [];
    const status = parsed.data.compliance_status ?? "clean";
    if (flags.length > 0 && status === "clean") {
      return jsonResponse(
        { data: null, error: { code: "COMPLIANCE_INCONSISTENT", message: "存在合规标记时状态不能为clean" } },
        { status: 400 }
      );
    }

    // Compute next version number with retry for race condition (P0-1)
    let nextVersion = 1;
    const MAX_RETRIES = 3;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const { data: lastVersion } = await client.from("content_versions")
        .select("version_number")
        .eq("content_project_id", id)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      nextVersion = (lastVersion?.version_number ?? 0) + 1;

      // Insert version — P1-6: explicit model_provider
      const { data: created, error } = await client.from("content_versions")
        .insert({
          workspace_id: workspaceId,
          content_project_id: id,
          version_number: nextVersion,
          model_provider: "deepseek",
          model_name: parsed.data.model_name,
          prompt_version: parsed.data.prompt_version,
          input_snapshot: parsed.data.input_snapshot,
          output_json: parsed.data.output_json,
          facts_used: parsed.data.facts_used ?? [],
          missing_information: parsed.data.missing_information ?? [],
          risk_flags: parsed.data.risk_flags ?? [],
          compliance_status: status,
          compliance_flags: flags,
          created_by: user.id,
        })
        .select()
        .single();

      // P0-1: If unique violation, retry; otherwise break
      if (error) {
        if (error.code === "23505") {
          continue; // retry with fresh version_number
        }
        return jsonResponse(
          { data: null, error: { code: "DB_ERROR", message: error.message } },
          { status: 500 }
        );
      }

      return jsonResponse({ data: created, error: null }, { status: 201 });
    }

    // Exhausted retries — still got unique violation
    return jsonResponse(
      { data: null, error: { code: "VERSION_RACE", message: "版本号冲突，请重试" } },
      { status: 409 }
    );
  } catch (err) {
    return jsonResponse(
      { data: null, error: { code: "INTERNAL_ERROR", message: err instanceof Error ? err.message : "服务器错误" } },
      { status: 500 }
    );
  }
}
