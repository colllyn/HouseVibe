// ============================================================
// TranscriptionProvider — Interface & Implementation
// Owner: ai-deepseek-engineer
// Contract: docs/contracts/ai-contract.md v2.0 §2.1
//           docs/contracts/api-contract.md §10.1
// ============================================================
//
// STT is an independent subsystem, NOT part of LLM/VLM.
// This provider delegates to a configured STT service.
// When no STT service is configured, it fails-closed with TRANSCRIPTION_NOT_CONFIGURED.

import { getServerEnv } from "@/config/env";

// ============================================================
// Types (per ai-contract §2.1)
// ============================================================

export interface TranscriptionInput {
  audioFile: File;
  purpose?: "property" | "client";
  language?: string;
  requestId?: string;
}

export interface TranscriptionResult {
  text: string;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
  durationSeconds: number;
  provider: string;
  requestId: string;
  error?: TranscriptionError;
}

export interface TranscriptionError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface TranscriptionProvider {
  transcribe(input: TranscriptionInput): Promise<TranscriptionResult>;
}

// ============================================================
// Error Codes
// ============================================================

export const TRANSCRIPTION_ERROR_CODES = {
  NOT_CONFIGURED: "TRANSCRIPTION_NOT_CONFIGURED",
  TIMEOUT: "TRANSCRIPTION_TIMEOUT",
  TOO_LARGE: "TRANSCRIPTION_TOO_LARGE",
  UNSUPPORTED_MEDIA: "TRANSCRIPTION_UNSUPPORTED_MEDIA",
  DURATION_EXCEEDED: "TRANSCRIPTION_DURATION_EXCEEDED",
  UPSTREAM_ERROR: "TRANSCRIPTION_UPSTREAM_ERROR",
  INVALID_RESPONSE: "TRANSCRIPTION_INVALID_RESPONSE",
} as const;

export type TranscriptionErrorCode =
  (typeof TRANSCRIPTION_ERROR_CODES)[keyof typeof TRANSCRIPTION_ERROR_CODES];

// ============================================================
// Provider Implementation
// ============================================================

export function createTranscriptionProvider(): TranscriptionProvider {
  const env = getServerEnv();

  return {
    async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
      const requestId = input.requestId ?? crypto.randomUUID();

      const sttBaseUrl = env.STT_BASE_URL;
      const sttApiKey = env.STT_API_KEY;

      if (!sttBaseUrl || !sttApiKey) {
        return {
          text: "",
          durationSeconds: 0,
          provider: "none",
          requestId,
          error: {
            code: TRANSCRIPTION_ERROR_CODES.NOT_CONFIGURED,
            message: "语音转文本服务未配置，请联系管理员",
          },
        };
      }

      const formData = new FormData();
      formData.append("audio", input.audioFile);
      if (input.language) formData.append("language", input.language);
      if (input.purpose) formData.append("purpose", input.purpose);

      const controller = new AbortController();
      const timeoutMs = 30_000; // 30s per ai-contract §10.5
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(`${sttBaseUrl}/v1/transcribe`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${sttApiKey}`,
          },
          body: formData,
          signal: controller.signal,
        });

        if (!response.ok) {
          return {
            text: "",
            durationSeconds: 0,
            provider: "stt_service",
            requestId,
            error: {
              code: TRANSCRIPTION_ERROR_CODES.UPSTREAM_ERROR,
              message: `STT 服务返回错误: ${response.status}`,
              details: { httpStatus: response.status },
            },
          };
        }

        const body = (await response.json()) as {
          text?: string;
          segments?: Array<{ start: number; end: number; text: string }>;
          duration?: number;
        };

        if (!body.text && body.text !== "") {
          return {
            text: "",
            durationSeconds: body.duration ?? 0,
            provider: "stt_service",
            requestId,
            error: {
              code: TRANSCRIPTION_ERROR_CODES.INVALID_RESPONSE,
              message: "STT 服务返回格式异常",
            },
          };
        }

        return {
          text: body.text,
          segments: body.segments,
          durationSeconds: body.duration ?? 0,
          provider: "stt_service",
          requestId,
        };
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return {
            text: "",
            durationSeconds: 0,
            provider: "stt_service",
            requestId,
            error: {
              code: TRANSCRIPTION_ERROR_CODES.TIMEOUT,
              message: "语音转文本服务超时",
            },
          };
        }

        return {
          text: "",
          durationSeconds: 0,
          provider: "stt_service",
          requestId,
          error: {
            code: TRANSCRIPTION_ERROR_CODES.UPSTREAM_ERROR,
            message: "语音转文本服务连接失败",
          },
        };
      } finally {
        clearTimeout(timeoutId);
      }
    },
  };
}
