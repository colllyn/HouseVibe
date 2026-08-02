import type { NextRequest } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { createClient } from "@/lib/supabase/server";
import { UpdateMediaInputSchema } from "@/features/properties/schemas";

function urlOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost";
  return `${proto}://${host}`;
}
const cors = (o: string) => ({ "Access-Control-Allow-Origin": o, "Access-Control-Allow-Credentials": "true" });

function signedUrlExpiry(): number {
  return parseInt(process.env.MEDIA_SIGNED_URL_EXPIRY_SECONDS || "3600", 10);
}

interface MediaRecord {
  id: string;
  property_id: string;
  storage_path: string;
  media_type: string;
  scene_tag: string | null;
  is_cover: boolean;
  sort_order: number;
  width: number | null;
  height: number | null;
  ai_labels: unknown;
  ai_analysis_status: string;
  created_at: string;
}

function toApiMedia(m: MediaRecord, signedUrl: string | null, expiresAt: string) {
  return {
    id: m.id,
    propertyId: m.property_id,
    storagePath: m.storage_path,
    mediaType: m.media_type,
    sceneTag: m.scene_tag,
    isCover: m.is_cover,
    sortOrder: m.sort_order,
    width: m.width,
    height: m.height,
    aiLabels: m.ai_labels,
    aiAnalysisStatus: m.ai_analysis_status,
    signedUrl,
    signedUrlExpiresAt: expiresAt,
    createdAt: m.created_at,
  };
}

// PATCH /api/properties/[id]/media/[mediaId] — Update media metadata
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; mediaId: string }> },
) {
  const { id, mediaId } = await params;
  const origin = urlOrigin(request);
  const h = cors(origin);
  const { client, jsonResponse } = await createRouteHandlerClient(request);

  try {
    // Auth
    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      return jsonResponse(
        { data: null, error: { code: "UNAUTHENTICATED", message: "未登录" } },
        { status: 401, headers: h },
      );
    }

    const { data: member } = await client
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .single();
    if (!member) {
      return jsonResponse(
        { data: null, error: { code: "WORKSPACE_ACCESS_DENIED", message: "无权限" } },
        { status: 403, headers: h },
      );
    }

    const workspaceId = member.workspace_id;

    // Verify property belongs to workspace
    const { data: property } = await client
      .from("properties")
      .select("id")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .single();
    if (!property) {
      return jsonResponse(
        { data: null, error: { code: "RESOURCE_NOT_FOUND", message: "房源不存在" } },
        { status: 404, headers: h },
      );
    }

    // Verify media belongs to property
    const { data: media } = await client
      .from("property_media")
      .select("*")
      .eq("id", mediaId)
      .eq("property_id", id)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .single();
    if (!media) {
      return jsonResponse(
        { data: null, error: { code: "RESOURCE_NOT_FOUND", message: "媒体文件不存在" } },
        { status: 404, headers: h },
      );
    }

    // Parse and validate body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonResponse(
        { data: null, error: { code: "VALIDATION_FAILED", message: "请求体无效" } },
        { status: 400, headers: h },
      );
    }

    const parsed = UpdateMediaInputSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const msg = first ? `${first.path.join(".")}: ${first.message}` : "参数无效";
      return jsonResponse(
        { data: null, error: { code: "VALIDATION_FAILED", message: msg } },
        { status: 422, headers: h },
      );
    }

    const input = parsed.data;

    // If setting isCover = true, unset cover on all other media first
    if (input.isCover === true) {
      await client
        .from("property_media")
        .update({ is_cover: false })
        .eq("property_id", id)
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .neq("id", mediaId);
    }

    // Build update payload
    const updatePayload: Record<string, unknown> = {};
    if (input.isCover !== undefined) updatePayload.is_cover = input.isCover;
    if (input.sortOrder !== undefined) updatePayload.sort_order = input.sortOrder;
    if (input.sceneTag !== undefined) updatePayload.scene_tag = input.sceneTag;

    if (Object.keys(updatePayload).length === 0) {
      return jsonResponse(
        { data: null, error: { code: "VALIDATION_FAILED", message: "未提供要更新的字段" } },
        { status: 400, headers: h },
      );
    }

    const { data: updated, error: updateErr } = await client
      .from("property_media")
      .update(updatePayload)
      .eq("id", mediaId)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (updateErr || !updated) {
      return jsonResponse(
        { data: null, error: { code: "INTERNAL_ERROR", message: "更新失败" } },
        { status: 500, headers: h },
      );
    }

    // Generate signed URL
    const serverClient = await createClient();
    const expiry = signedUrlExpiry();
    const expiresAt = new Date(Date.now() + expiry * 1000).toISOString();
    const { data: signedData } = await serverClient.storage
      .from("property-private")
      .createSignedUrl(updated.storage_path, expiry);

    return jsonResponse(
      {
        data: toApiMedia(updated as unknown as MediaRecord, signedData?.signedUrl ?? null, expiresAt),
        error: null,
      },
      { headers: h },
    );
  } catch {
    return jsonResponse(
      { data: null, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500, headers: h },
    );
  }
}

// DELETE /api/properties/[id]/media/[mediaId] — Soft delete (owner only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; mediaId: string }> },
) {
  const { id, mediaId } = await params;
  const origin = urlOrigin(request);
  const h = cors(origin);
  const { client, jsonResponse } = await createRouteHandlerClient(request);

  try {
    // Auth
    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      return jsonResponse(
        { data: null, error: { code: "UNAUTHENTICATED", message: "未登录" } },
        { status: 401, headers: h },
      );
    }

    const { data: member } = await client
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .single();
    if (!member) {
      return jsonResponse(
        { data: null, error: { code: "WORKSPACE_ACCESS_DENIED", message: "无权限" } },
        { status: 403, headers: h },
      );
    }

    // Verify caller is workspace OWNER
    if (member.role !== "owner") {
      return jsonResponse(
        { data: null, error: { code: "FORBIDDEN", message: "仅工作区所有者可删除媒体文件" } },
        { status: 403, headers: h },
      );
    }

    const workspaceId = member.workspace_id;

    // Verify property belongs to workspace
    const { data: property } = await client
      .from("properties")
      .select("id")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .single();
    if (!property) {
      return jsonResponse(
        { data: null, error: { code: "RESOURCE_NOT_FOUND", message: "房源不存在" } },
        { status: 404, headers: h },
      );
    }

    // Verify media belongs to property
    const { data: media } = await client
      .from("property_media")
      .select("id")
      .eq("id", mediaId)
      .eq("property_id", id)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .single();
    if (!media) {
      return jsonResponse(
        { data: null, error: { code: "RESOURCE_NOT_FOUND", message: "媒体文件不存在" } },
        { status: 404, headers: h },
      );
    }

    // Soft delete via RPC (SECURITY DEFINER, properly handles RLS)
    const now = new Date().toISOString();
    const { data: _deletedMedia, error: rpcErr } = await client
      .rpc("soft_delete_media", { p_media_id: mediaId });

    if (rpcErr) {
      const msg = String(rpcErr.message || rpcErr);
      if (msg.includes("UNAUTHENTICATED")) {
        return jsonResponse(
          { data: null, error: { code: "UNAUTHENTICATED", message: "未登录" } },
          { status: 401, headers: h },
        );
      }
      if (msg.includes("owner")) {
        return jsonResponse(
          { data: null, error: { code: "FORBIDDEN", message: "仅工作区所有者可删除媒体文件" } },
          { status: 403, headers: h },
        );
      }
      if (msg.includes("not found")) {
        return jsonResponse(
          { data: null, error: { code: "RESOURCE_NOT_FOUND", message: "媒体文件不存在" } },
          { status: 404, headers: h },
        );
      }
      return jsonResponse(
        { data: null, error: { code: "INTERNAL_ERROR", message: "删除失败" } },
        { status: 500, headers: h },
      );
    }

    return jsonResponse(
      {
        data: { deleted: true, mediaId, deletedAt: now },
        error: null,
      },
      { headers: h },
    );
  } catch {
    return jsonResponse(
      { data: null, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500, headers: h },
    );
  }
}
