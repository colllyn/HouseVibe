/**
 * AI Content Feedback Route Handler — P3-AI-011
 *
 * POST /api/ai/feedback
 * Records 👍/👎 feedback on AI-generated content.
 * Writes to ai_correction_logs AND updates content_versions.feedback_score.
 *
 * Contract: implementation-plan.md §P3-AI-011, ai-contract.md §9
 */

import { type NextRequest } from "next/server";
import { z } from "zod";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { hasFeature } from "@/features/access-control/guards";

// ============================================================
// Schema
// ============================================================

const VALID_FEEDBACK_TYPES = [
  "fact_error",
  "wrong_tone",
  "too_verbose",
  "format_error",
  "platform_mismatch",
  "other",
] as const;

const FeedbackRequestSchema = z.object({
  contentVersionId: z.string().uuid(),
  score: z.number().int().min(-1).max(1),
  feedbackType: z.enum(VALID_FEEDBACK_TYPES).optional(),
  comment: z.string().max(500).optional(),
  promptVersion: z.string().optional(),
  modelName: z.string().optional(),
});

// ============================================================
// Helpers
// ============================================================

function urlOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost";
  return `${proto}://${host}`;
}

const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Credentials": "true",
});

// ============================================================
// Handler
// ============================================================

export async function POST(request: NextRequest) {
  const origin = urlOrigin(request);
  const h = corsHeaders(origin);
  const { client, jsonResponse } = await createRouteHandlerClient(request);

  try {
    // 1. Auth
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
    const workspaceId = member.workspace_id;

    // 3. Entitlement check — requires content_factory
    const entitled = await hasFeature("content_factory");
    if (!entitled) {
      return jsonResponse(
        { data: null, error: { code: "FEATURE_NOT_ALLOWED", message: "需要 content_factory 功能授权" } },
        { status: 403, headers: h },
      );
    }

    // 4. Parse and validate body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonResponse(
        { data: null, error: { code: "VALIDATION_FAILED", message: "请求体不是有效的 JSON" } },
        { status: 400, headers: h },
      );
    }

    const parsed = FeedbackRequestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonResponse(
        { data: null, error: { code: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "参数无效" } },
        { status: 400, headers: h },
      );
    }

    const { contentVersionId, score, feedbackType, comment, promptVersion, modelName } = parsed.data;

    // 5. Verify content_version exists and belongs to workspace
    const { data: version } = await client.from("content_versions")
      .select("id, content_project_id")
      .eq("id", contentVersionId)
      .eq("workspace_id", workspaceId)
      .single();

    if (!version) {
      return jsonResponse(
        { data: null, error: { code: "NOT_FOUND", message: "内容版本不存在或无权访问" } },
        { status: 404, headers: h },
      );
    }

    // 6. Record feedback into ai_correction_logs via RPC
    const requestId = crypto.randomUUID();

    const { error: insertErr } = await client.rpc("record_ai_correction", {
      p_user_id: user.id,
      p_workspace_id: workspaceId,
      p_feature: "content_factory",
      p_request_id: requestId,
      p_entity_type: "content",
      p_entity_id: contentVersionId,
      p_content_version_id: contentVersionId,
      p_prompt_version: promptVersion ?? "1",
      p_model_name: modelName ?? "deepseek",
      p_original_output: {} as Record<string, unknown>,
      p_corrected_output: {
        score,
        feedbackType: feedbackType ?? null,
        comment: comment ?? null,
      } as unknown as Record<string, unknown>,
      p_diff: [] as unknown as Record<string, unknown>,
    });

    if (insertErr) {
      return jsonResponse(
        { data: null, error: { code: "INTERNAL_ERROR", message: "反馈保存失败" } },
        { status: 500, headers: h },
      );
    }

    // 7. Update content_versions with feedback (upsert — overwrites previous)
    const { error: updateErr } = await client.from("content_versions")
      .update({
        feedback_score: score,
        feedback_type: feedbackType ?? null,
        feedback_comment: comment ?? null,
      })
      .eq("id", contentVersionId)
      .eq("workspace_id", workspaceId);

    if (updateErr) {
      // Non-fatal — correction log was written, version update is best-effort
      console.warn("Failed to update content_versions feedback:", updateErr.message);
    }

    // 8. Success
    return jsonResponse(
      { data: { recorded: true, versionId: contentVersionId, score }, error: null },
      { status: 200, headers: h },
    );
  } catch {
    return jsonResponse(
      { data: null, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500, headers: h },
    );
  }
}
