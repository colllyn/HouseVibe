import type { NextRequest } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { createClient } from "@/lib/supabase/server";
import { stripExif } from "@/lib/media/strip-exif";
import {
  ALLOWED_MEDIA_MIME_TYPES,
  MAX_MEDIA_FILE_SIZE,
  MAX_MEDIA_PER_PROPERTY,
  MAX_FILES_PER_UPLOAD,
} from "@/features/properties/schemas";

function urlOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost";
  return `${proto}://${host}`;
}
const cors = (o: string) => ({ "Access-Control-Allow-Origin": o, "Access-Control-Allow-Credentials": "true" });

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

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

// GET /api/properties/[id]/media — List non-deleted media with signed URLs
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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

    // Query media
    const { data: media, error: mediaErr, count } = await client
      .from("property_media")
      .select("*", { count: "exact" })
      .eq("property_id", id)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (mediaErr) {
      return jsonResponse(
        { data: null, error: { code: "INTERNAL_ERROR", message: "查询失败" } },
        { status: 500, headers: h },
      );
    }

    // Generate signed URLs
    const serverClient = await createClient();
    const expiry = signedUrlExpiry();
    const expiresAt = new Date(Date.now() + expiry * 1000).toISOString();

    const mediaWithUrls = await Promise.all(
      (media ?? []).map(async (m: MediaRecord) => {
        const { data: signedData } = await serverClient.storage
          .from("property-private")
          .createSignedUrl(m.storage_path, expiry);

        return toApiMedia(m, signedData?.signedUrl ?? null, expiresAt);
      }),
    );

    return jsonResponse(
      {
        data: { media: mediaWithUrls, total: count ?? 0 },
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

// POST /api/properties/[id]/media — Upload media files (multipart/form-data)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const origin = urlOrigin(request);
  const h = cors(origin);
  const { client, jsonResponse } = await createRouteHandlerClient(request);

  try {
    // 1. Auth + workspace membership
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

    // 2. Verify property belongs to workspace
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

    // 3. Count existing active media
    const { count: existingCount, error: countErr } = await client
      .from("property_media")
      .select("id", { count: "exact", head: true })
      .eq("property_id", id)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null);

    if (countErr) {
      return jsonResponse(
        { data: null, error: { code: "INTERNAL_ERROR", message: "查询失败" } },
        { status: 500, headers: h },
      );
    }

    // 4. Validate content type
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return jsonResponse(
        { data: null, error: { code: "VALIDATION_FAILED", message: "Content-Type 必须为 multipart/form-data" } },
        { status: 400, headers: h },
      );
    }

    // 5. Parse form data
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return jsonResponse(
        { data: null, error: { code: "VALIDATION_FAILED", message: "表单数据解析失败" } },
        { status: 400, headers: h },
      );
    }

    const rawFiles = formData.getAll("files");
    const files = rawFiles.filter((f): f is File => f instanceof File);

    if (files.length === 0) {
      return jsonResponse(
        { data: null, error: { code: "VALIDATION_FAILED", message: "未提供文件" } },
        { status: 400, headers: h },
      );
    }

    if (files.length > MAX_FILES_PER_UPLOAD) {
      return jsonResponse(
        {
          data: null,
          error: {
            code: "VALIDATION_FAILED",
            message: `单次最多上传 ${MAX_FILES_PER_UPLOAD} 个文件`,
          },
        },
        { status: 400, headers: h },
      );
    }

    // 6. Check per-property limit
    if ((existingCount ?? 0) + files.length > MAX_MEDIA_PER_PROPERTY) {
      return jsonResponse(
        {
          data: null,
          error: {
            code: "MEDIA_LIMIT_EXCEEDED",
            message: `房源图片已超过上限 (${MAX_MEDIA_PER_PROPERTY} 张)`,
          },
        },
        { status: 422, headers: h },
      );
    }

    // 7. Check for existing cover
    const { data: existingCover } = await client
      .from("property_media")
      .select("id")
      .eq("property_id", id)
      .eq("workspace_id", workspaceId)
      .eq("is_cover", true)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    const hasCover = !!existingCover;

    // 8. Process each file
    const serverClient = await createClient();
    const expiry = signedUrlExpiry();
    const expiresAt = new Date(Date.now() + expiry * 1000).toISOString();

    const rejections: Array<{ index: number; code: string; message: string }> = [];
    const uploaded: ReturnType<typeof toApiMedia>[] = [];

    let firstSuccess = hasCover; // already has cover -> no new cover needed

    for (const [i, file] of files.entries()) {
      // a. Validate MIME type — positive allowlist
      if (!(ALLOWED_MEDIA_MIME_TYPES as readonly string[]).includes(file.type)) {
        // Differentiate video deferred vs unsupported
        if (file.type.startsWith("video/")) {
          rejections.push({
            index: i,
            code: "MEDIA_VIDEO_DEFERRED",
            message: `文件 "${file.name}" 为视频格式，暂不支持`,
          });
        } else {
          rejections.push({
            index: i,
            code: "MEDIA_UNSUPPORTED_TYPE",
            message: `文件 "${file.name}" 格式不支持`,
          });
        }
        continue;
      }

      // b. Validate size
      if (file.size > MAX_MEDIA_FILE_SIZE) {
        rejections.push({
          index: i,
          code: "MEDIA_FILE_TOO_LARGE",
          message: `文件 "${file.name}" 超过 10 MB`,
        });
        continue;
      }

      // c. Generate storage path: {workspace_id}/{user_id}/{uuid}.{ext}
      const ext = MIME_TO_EXT[file.type] ?? "jpg";
      const fileUuid = crypto.randomUUID();
      const storagePath = `${workspaceId}/${user.id}/${fileUuid}.${ext}`;

      // d. Read file buffer and strip EXIF metadata (P1-001).
      //    Both operations in one try/catch: if we can't read the file
      //    or strip metadata, reject the upload — never pass raw files through.
      let uploadBody: Buffer;
      try {
        const originalBuffer = Buffer.from(await file.arrayBuffer());
        uploadBody = await stripExif(originalBuffer, file.type);
      } catch (stripErr) {
        console.error(
          "[media-upload] file processing failed, rejecting upload:",
          stripErr instanceof Error ? stripErr.message : String(stripErr),
        );
        rejections.push({
          index: i,
          code: "MEDIA_EXIF_STRIP_FAILED",
          message: `文件 "${file.name}" 处理失败，请重新上传`,
        });
        continue;
      }

      // e. Upload to Supabase Storage
      const { error: uploadErr } = await serverClient.storage
        .from("property-private")
        .upload(storagePath, uploadBody, { contentType: file.type, upsert: false });

      if (uploadErr) {
        rejections.push({
          index: i,
          code: "INTERNAL_ERROR",
          message: `文件 "${file.name}" 上传失败`,
        });
        continue;
      }

      // g. Insert property_media row
      const { data: inserted, error: insertErr } = await client
        .from("property_media")
        .insert({
          workspace_id: workspaceId,
          property_id: id,
          storage_path: storagePath,
          media_type: "image",
          is_cover: !firstSuccess,
          sort_order: (existingCount ?? 0) + uploaded.length,
        })
        .select("*")
        .single();

      if (insertErr || !inserted) {
        // h. Compensation: delete storage object on DB failure
        const { error: removeErr } = await serverClient.storage.from("property-private").remove([storagePath]);
        if (removeErr) {
          console.error("Media upload compensation failed for", storagePath, removeErr);
        }
        rejections.push({
          index: i,
          code: "INTERNAL_ERROR",
          message: `文件 "${file.name}" 保存失败`,
        });
        continue;
      }

      firstSuccess = true; // cover assigned to first successful upload

      // Generate signed URL
      const { data: signedData } = await serverClient.storage
        .from("property-private")
        .createSignedUrl(storagePath, expiry);

      uploaded.push(
        toApiMedia(inserted as unknown as MediaRecord, signedData?.signedUrl ?? null, expiresAt),
      );
    }

    // 9. Build response
    if (uploaded.length === 0) {
      // All files failed
      return jsonResponse(
        {
          data: null,
          error: {
            code: "VALIDATION_FAILED",
            message: "所有文件上传失败",
            details: { rejections },
          },
        },
        { status: 400, headers: h },
      );
    }

    const status = rejections.length > 0 ? 207 : 201;
    const body: Record<string, unknown> = {
      data: { media: uploaded, total: uploaded.length },
      error: null,
    };
    if (rejections.length > 0) {
      (body.data as Record<string, unknown>).rejections = rejections;
    }

    return jsonResponse(body, { status, headers: h });
  } catch {
    return jsonResponse(
      { data: null, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500, headers: h },
    );
  }
}
