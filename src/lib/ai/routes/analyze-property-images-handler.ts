/**
 * Analyze Property Images Route Handler
 *
 * POST /api/ai/analyze-property-images
 * Server-side: auth, workspace, property/media ownership checks,
 * generates signed URLs, calls VisionProvider, saves results.
 */

import { type NextRequest } from "next/server";
import { z } from "zod";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { createClient } from "@/lib/supabase/server";
import type { DeepSeekVisionProvider, PropertyVisionResult } from "@/lib/ai/types";
import { DeepSeekProviderError } from "@/lib/ai/types";
import { createDeepSeekVisionProvider } from "@/lib/ai/providers/deepseek-vision-provider";

// ============================================================
// Request Schema
// ============================================================

const AnalyzeImagesRequestSchema = z.object({
  propertyId: z.string().uuid(),
  propertyMediaIds: z.array(z.string().uuid()).min(1).max(8),
  requestId: z.string().optional(),
});

// ============================================================
// Helpers
// ============================================================

const SIGNED_URL_EXPIRY = 300; // 5 minutes

interface MediaRecord {
  id: string;
  storage_path: string;
  property_id: string;
  workspace_id: string;
  ai_labels: unknown;
}

interface PropertyRecord {
  id: string;
  workspace_id: string;
  title: string;
  visual_summary: unknown;
  visual_fact_flags: unknown;
}

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
// Handler Factory
// ============================================================

export function createAnalyzeImagesHandler(
  providerFactory?: () => DeepSeekVisionProvider
) {
  return async function POST(request: NextRequest) {
    const origin = urlOrigin(request);
    const h = corsHeaders(origin);
    const { client, jsonResponse } = await createRouteHandlerClient(request);

    try {
      // 1. Authentication
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
          { data: null, error: { code: "WORKSPACE_ACCESS_DENIED", message: "无工作区权限" } },
          { status: 403, headers: h }
        );
      }

      const workspaceId = member.workspace_id;

      // 3. Parse body
      let body: unknown;
      try { body = await request.json(); } catch {
        return jsonResponse(
          { data: null, error: { code: "VALIDATION_FAILED", message: "请求体不是有效的 JSON" } },
          { status: 422, headers: h }
        );
      }

      const parsed = AnalyzeImagesRequestSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResponse(
          { data: null, error: { code: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "参数无效" } },
          { status: 422, headers: h }
        );
      }

      const { propertyId, propertyMediaIds, requestId } = parsed.data;
      const reqId = requestId ?? crypto.randomUUID();

      // 4. Verify property ownership (belongs to user's workspace)
      const { data: property } = await client
        .from("properties")
        .select("id, workspace_id, title")
        .eq("id", propertyId)
        .eq("workspace_id", workspaceId)
        .single();

      if (!property) {
        return jsonResponse(
          { data: null, error: { code: "RESOURCE_NOT_FOUND", message: "房源不存在或无权访问" } },
          { status: 404, headers: h }
        );
      }

      // 5. Verify media ownership (belongs to same property AND workspace)
      const { data: media, error: mediaError } = await client
        .from("property_media")
        .select("id, storage_path, property_id, workspace_id, ai_labels")
        .in("id", propertyMediaIds)
        .eq("property_id", propertyId)
        .eq("workspace_id", workspaceId);

      if (mediaError || !media || media.length === 0) {
        return jsonResponse(
          { data: null, error: { code: "RESOURCE_NOT_FOUND", message: "媒体文件不存在或无权访问" } },
          { status: 404, headers: h }
        );
      }

      // Verify all requested media IDs were found
      const foundIds = new Set((media as MediaRecord[]).map((m) => m.id));
      const missing = propertyMediaIds.filter((id) => !foundIds.has(id));
      if (missing.length > 0) {
        return jsonResponse(
          { data: null, error: { code: "VALIDATION_FAILED", message: `部分媒体文件不存在: ${missing.join(", ")}` } },
          { status: 422, headers: h }
        );
      }

      // 6. Generate short-lived signed URLs (server-side only)
      const supabase = await createClient();
      const signedUrls: string[] = [];
      const mediaMap = new Map<string, MediaRecord>();

      for (const m of (media as MediaRecord[])) {
        mediaMap.set(m.id, m);
        const { data: signed } = await supabase.storage
          .from("property-private")
          .createSignedUrl(m.storage_path, SIGNED_URL_EXPIRY);

        if (!signed?.signedUrl) {
          return jsonResponse(
            { data: null, error: { code: "INTERNAL_ERROR", message: "无法生成图片访问链接" } },
            { status: 500, headers: h }
          );
        }
        signedUrls.push(signed.signedUrl);
      }

      // 7. Call VisionProvider (fail-closed when key not configured)
      let provider: DeepSeekVisionProvider;
      try {
        provider = providerFactory
          ? providerFactory()
          : createDeepSeekVisionProvider();
      } catch (providerErr) {
        if (
          providerErr instanceof DeepSeekProviderError &&
          providerErr.code === "AI_NOT_CONFIGURED"
        ) {
          return jsonResponse(
            { data: null, error: { code: "AI_NOT_CONFIGURED", message: "视觉分析服务未配置" } },
            { status: 503, headers: h }
          );
        }
        throw providerErr;
      }

      // Build property facts from the property record
      const propertyFacts = {
        title: (property as PropertyRecord).title,
      };

      const result: PropertyVisionResult = await provider.analyzePropertyImages(
        {
          requestId: reqId,
          imageUrls: signedUrls,
          propertyFacts,
          schemaVersion: "1.0",
          promptVersion: "1",
          modelName: "deepseek-vl2",
        },
        request.signal
      );

      // 8. Save ai_labels to property_media (per-image)
      for (const mr of result.mediaResults) {
        // Map the mock mediaId back to real mediaId
        // (mock uses `mock-media-{i}`, we map by index)
        const idx = result.mediaResults.indexOf(mr);
        const realMediaId = propertyMediaIds[idx];
        if (!realMediaId) continue;

        const { error: updateErr } = await client
          .from("property_media")
          .update({ ai_labels: mr.aiLabels })
          .eq("id", realMediaId);

        if (updateErr) {
          console.error(`[analyze-images] Failed to save ai_labels for media ${realMediaId}: ${updateErr.message}`);
        }
      }

      // 9. Save visual_summary and visual_fact_flags to properties
      const { error: propUpdateErr } = await client
        .from("properties")
        .update({
          visual_summary: result.visualSummary,
          visual_fact_flags: result.factChecks,
        })
        .eq("id", propertyId);

      if (propUpdateErr) {
        console.error(`[analyze-images] Failed to save visual data for property ${propertyId}: ${propUpdateErr.message}`);
      }

      // 10. Return results
      return jsonResponse(
        {
          data: {
            requestId: reqId,
            mediaResults: result.mediaResults.map((mr, i) => ({
              ...mr,
              mediaId: propertyMediaIds[i] ?? mr.mediaId,
            })),
            visualSummary: result.visualSummary,
            factChecks: result.factChecks,
          },
          error: null,
        },
        { status: 200, headers: h }
      );
    } catch (err) {
      if (err instanceof DeepSeekProviderError) {
        if (err.code === "AI_REQUEST_ABORTED") throw err;
        return jsonResponse(
          { data: null, error: { code: err.code, message: err.message } },
          { status: 502, headers: h }
        );
      }
      console.error(`[analyze-images] Unexpected error: ${err instanceof Error ? err.message : "Unknown"}`);
      return jsonResponse(
        { data: null, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
        { status: 500, headers: h }
      );
    }
  };
}
