/**
 * Transcribe Route Handler Factory
 *
 * Receives multipart/form-data with an audio file, validates everything
 * server-side, delegates to a TranscriptionProvider, and returns the text.
 *
 * Contract: docs/contracts/ai-contract.md v2.0 §2.1
 *           docs/contracts/api-contract.md §10.1
 */

import { type NextRequest } from "next/server";
import { z } from "zod";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import {
  createTranscriptionProvider,
  type TranscriptionProvider,
} from "@/lib/ai/providers/transcription-provider";

// ============================================================
// Constants
// ============================================================

const ALLOWED_MIME_TYPES = [
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-m4a",
] as const;

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_AUDIO_DURATION_SECONDS = 60;

// ============================================================
// Helpers
// ============================================================

function urlOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host =
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    "localhost";
  return `${proto}://${host}`;
}

const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Credentials": "true",
});

// ============================================================
// Handler Factory (injectable Provider for testing)
// ============================================================

export function createTranscribeHandler(
  providerFactory?: () => TranscriptionProvider
) {
  const getProvider =
    providerFactory ?? (() => createTranscriptionProvider());

  return async function POST(request: NextRequest) {
    const origin = urlOrigin(request);
    const h = corsHeaders(origin);

    const { client, jsonResponse } = await createRouteHandlerClient(request);

    try {
      // 1. Authentication
      const {
        data: { user },
      } = await client.auth.getUser();
      if (!user) {
        return jsonResponse(
          {
            data: null,
            error: { code: "UNAUTHENTICATED", message: "未登录" },
          },
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
          {
            data: null,
            error: {
              code: "WORKSPACE_ACCESS_DENIED",
              message: "无工作区权限",
            },
          },
          { status: 403, headers: h }
        );
      }

      // 3. Content-Type validation — must be multipart/form-data
      const contentType = request.headers.get("content-type") ?? "";
      if (!contentType.includes("multipart/form-data")) {
        return jsonResponse(
          {
            data: null,
            error: {
              code: "VALIDATION_FAILED",
              message: "请求格式必须为 multipart/form-data",
            },
          },
          { status: 422, headers: h }
        );
      }

      // 4. Parse multipart form data
      let formData: FormData;
      try {
        formData = await request.formData();
      } catch {
        return jsonResponse(
          {
            data: null,
            error: {
              code: "VALIDATION_FAILED",
              message: "无法解析上传表单",
            },
          },
          { status: 422, headers: h }
        );
      }

      const audioFile = formData.get("audio") as File | null;
      const purposeRaw = formData.get("purpose") as string | null;
      const languageRaw = formData.get("language") as string | null;
      const requestIdRaw = formData.get("requestId") as string | null;

      // 5. Validate audio file presence
      if (!audioFile || typeof audioFile !== "object") {
        return jsonResponse(
          {
            data: null,
            error: {
              code: "VALIDATION_FAILED",
              message: "缺少音频文件",
            },
          },
          { status: 422, headers: h }
        );
      }

      // 6. Validate file size
      if (audioFile.size > MAX_FILE_BYTES) {
        return jsonResponse(
          {
            data: null,
            error: {
              code: "TRANSCRIPTION_TOO_LARGE",
              message: `音频文件不能超过 ${MAX_FILE_BYTES / (1024 * 1024)} MB`,
            },
          },
          { status: 413, headers: h }
        );
      }

      if (audioFile.size === 0) {
        return jsonResponse(
          {
            data: null,
            error: {
              code: "VALIDATION_FAILED",
              message: "音频文件为空",
            },
          },
          { status: 422, headers: h }
        );
      }

      // 7. Validate MIME type
      if (!ALLOWED_MIME_TYPES.includes(audioFile.type as typeof ALLOWED_MIME_TYPES[number])) {
        return jsonResponse(
          {
            data: null,
            error: {
              code: "TRANSCRIPTION_UNSUPPORTED_MEDIA",
              message: `不支持的音频格式: ${audioFile.type || "未知"}`,
            },
          },
          { status: 415, headers: h }
        );
      }

      // 8. Validate optional fields
      const purpose = purposeRaw
        ? z.enum(["property", "client"]).safeParse(purposeRaw)
        : { success: true, data: undefined };
      if (!purpose.success) {
        return jsonResponse(
          {
            data: null,
            error: {
              code: "VALIDATION_FAILED",
              message: "purpose 必须是 property 或 client",
            },
          },
          { status: 422, headers: h }
        );
      }

      const language = languageRaw
        ? z.enum(["zh", "en"]).safeParse(languageRaw)
        : { success: true, data: undefined };
      if (!language.success) {
        return jsonResponse(
          {
            data: null,
            error: {
              code: "VALIDATION_FAILED",
              message: "language 必须是 zh 或 en",
            },
          },
          { status: 422, headers: h }
        );
      }

      // 9. Duration validation (client-provided hint from MediaRecorder)
      const durationRaw = formData.get("duration") as string | null;
      if (durationRaw) {
        const duration = z.coerce
          .number()
          .min(0)
          .max(MAX_AUDIO_DURATION_SECONDS)
          .safeParse(durationRaw);
        if (!duration.success) {
          return jsonResponse(
            {
              data: null,
              error: {
                code: "TRANSCRIPTION_DURATION_EXCEEDED",
                message: `录音时长不能超过 ${MAX_AUDIO_DURATION_SECONDS} 秒`,
              },
            },
            { status: 422, headers: h }
          );
        }
      }

      // 11. Call TranscriptionProvider
      const provider = getProvider();
      const result = await provider.transcribe({
        audioFile,
        purpose: purpose.data as "property" | "client" | undefined,
        language: language.data,
        requestId: requestIdRaw ?? undefined,
      });

      // 12. Handle provider errors
      if (result.error) {
        const errorCode = result.error.code;
        switch (errorCode) {
          case "TRANSCRIPTION_NOT_CONFIGURED":
            return jsonResponse(
              {
                data: null,
                error: {
                  code: "AI_NOT_CONFIGURED",
                  message: "语音转文本服务未配置，请联系管理员",
                },
              },
              { status: 503, headers: h }
            );
          case "TRANSCRIPTION_TIMEOUT":
            return jsonResponse(
              {
                data: null,
                error: {
                  code: "TRANSCRIPTION_TIMEOUT",
                  message: "语音转文本服务超时，请重试",
                },
              },
              { status: 504, headers: h }
            );
          case "TRANSCRIPTION_DURATION_EXCEEDED":
            return jsonResponse(
              {
                data: null,
                error: {
                  code: "TRANSCRIPTION_DURATION_EXCEEDED",
                  message: `录音时长不能超过 ${MAX_AUDIO_DURATION_SECONDS} 秒`,
                },
              },
              { status: 422, headers: h }
            );
          case "TRANSCRIPTION_TOO_LARGE":
            return jsonResponse(
              {
                data: null,
                error: {
                  code: "TRANSCRIPTION_TOO_LARGE",
                  message: `音频文件不能超过 ${MAX_FILE_BYTES / (1024 * 1024)} MB`,
                },
              },
              { status: 413, headers: h }
            );
          case "TRANSCRIPTION_UNSUPPORTED_MEDIA":
            return jsonResponse(
              {
                data: null,
                error: {
                  code: "TRANSCRIPTION_UNSUPPORTED_MEDIA",
                  message: "不支持的音频格式",
                },
              },
              { status: 415, headers: h }
            );
          case "TRANSCRIPTION_UPSTREAM_ERROR":
          case "TRANSCRIPTION_INVALID_RESPONSE":
            return jsonResponse(
              {
                data: null,
                error: {
                  code: "INTERNAL_ERROR",
                  message: "语音转文本服务暂时不可用",
                },
              },
              { status: 502, headers: h }
            );
          default:
            return jsonResponse(
              {
                data: null,
                error: {
                  code: "INTERNAL_ERROR",
                  message: "转写失败，请重试",
                },
              },
              { status: 500, headers: h }
            );
        }
      }

      // 13. Success — return transcription
      return jsonResponse(
        {
          data: {
            text: result.text,
            segments: result.segments ?? [],
            durationSeconds: result.durationSeconds,
            provider: result.provider,
            requestId: result.requestId,
          },
          error: null,
        },
        { status: 200, headers: h }
      );
    } catch (err) {
      // Log the error for debugging (message only, no stack traces with tokens)
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error";
      console.error(
        `[transcribe] Unexpected error: ${errorMessage}`
      );

      return jsonResponse(
        {
          data: null,
          error: { code: "INTERNAL_ERROR", message: "服务器错误" },
        },
        { status: 500, headers: h }
      );
    }
  };
}
