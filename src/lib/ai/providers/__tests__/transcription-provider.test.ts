// ============================================================
// TranscriptionProvider Unit Tests
// Owner: test-engineer
// Contract: ai-contract.md v2.0 §2.1
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================
// Mock env
// ============================================================

function mockEnv(overrides: Record<string, string | undefined> = {}) {
  vi.doMock("@/config/env", () => ({
    getServerEnv: () => ({
      NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      STT_BASE_URL: undefined,
      STT_API_KEY: undefined,
      DEEPSEEK_MODEL: "deepseek-v4-flash",
      DEEPSEEK_FALLBACK_MODEL: "deepseek-v4-pro",
      DEEPSEEK_VISION_MODEL: "deepseek-vl2",
      DEEPSEEK_VISION_MAX_IMAGES: 8,
      DEEPSEEK_REQUEST_TIMEOUT_MS: 45000,
      MAX_AUDIO_DURATION_SECONDS: 60,
      MAX_AUDIO_UPLOAD_BYTES: 10485760,
      AI_DAILY_CONTENT_LIMIT: 10,
      AI_DAILY_COST_LIMIT_USD: 10,
      AI_PREFERENCE_MIN_EVIDENCE: 3,
      AI_FAILURE_THRESHOLD: 3,
      AI_FAILURE_WINDOW_SECONDS: 300,
      AI_QUOTA_TIMEZONE: "Asia/Shanghai",
      COMPLIANCE_BLOCK_COPY: true,
      INVITE_TOKEN_SECRET: "test-secret-32-chars-minimum-here",
      ...overrides,
    }),
  }));
}

// ============================================================
// Tests
// ============================================================

describe("TranscriptionProvider", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe("when STT is not configured", () => {
    it("returns TRANSCRIPTION_NOT_CONFIGURED error", async () => {
      mockEnv({ STT_BASE_URL: undefined, STT_API_KEY: undefined });
      const { createTranscriptionProvider } = await import(
        "../transcription-provider"
      );
      const provider = createTranscriptionProvider();

      const file = new File(["fake audio data"], "test.webm", {
        type: "audio/webm",
      });
      const result = await provider.transcribe({ audioFile: file });

      expect(result.text).toBe("");
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe("TRANSCRIPTION_NOT_CONFIGURED");
    });

    it("returns empty text when STT_BASE_URL is missing", async () => {
      mockEnv({ STT_BASE_URL: undefined, STT_API_KEY: "some-key" });
      const { createTranscriptionProvider } = await import(
        "../transcription-provider"
      );
      const provider = createTranscriptionProvider();

      const file = new File(["fake audio data"], "test.webm", {
        type: "audio/webm",
      });
      const result = await provider.transcribe({ audioFile: file });

      expect(result.error?.code).toBe("TRANSCRIPTION_NOT_CONFIGURED");
    });

    it("returns empty text when STT_API_KEY is missing", async () => {
      mockEnv({ STT_BASE_URL: "https://stt.example.com", STT_API_KEY: undefined });
      const { createTranscriptionProvider } = await import(
        "../transcription-provider"
      );
      const provider = createTranscriptionProvider();

      const file = new File(["fake audio data"], "test.webm", {
        type: "audio/webm",
      });
      const result = await provider.transcribe({ audioFile: file });

      expect(result.error?.code).toBe("TRANSCRIPTION_NOT_CONFIGURED");
    });
  });

  describe("when STT is configured", () => {
    it("sends multipart/form-data to the STT service", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ text: "测试转写结果", duration: 5.2 }),
      });

      mockEnv({
        STT_BASE_URL: "https://stt.example.com",
        STT_API_KEY: "test-api-key",
      });

      const { createTranscriptionProvider } = await import(
        "../transcription-provider"
      );
      const provider = createTranscriptionProvider();

      // Inject fetch mock by overriding global fetch temporarily
      const originalFetch = globalThis.fetch;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fetch = mockFetch;

      try {
        const file = new File(["fake audio"], "test.webm", {
          type: "audio/webm",
        });
        const result = await provider.transcribe({
          audioFile: file,
          language: "zh",
          purpose: "property",
        });

        expect(result.text).toBe("测试转写结果");
        expect(result.durationSeconds).toBe(5.2);
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const callUrl = (mockFetch.mock.calls[0] as string[])[0];
        expect(callUrl).toBe("https://stt.example.com/v1/transcribe");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("handles upstream error response", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: "internal" }),
      });

      mockEnv({
        STT_BASE_URL: "https://stt.example.com",
        STT_API_KEY: "test-api-key",
      });

      const { createTranscriptionProvider } = await import(
        "../transcription-provider"
      );
      const provider = createTranscriptionProvider();

      const originalFetch = globalThis.fetch;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fetch = mockFetch;

      try {
        const file = new File(["fake audio"], "test.webm", {
          type: "audio/webm",
        });
        const result = await provider.transcribe({
          audioFile: file,
        });

        expect(result.text).toBe("");
        expect(result.error?.code).toBe("TRANSCRIPTION_UPSTREAM_ERROR");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("handles network failure", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));

      mockEnv({
        STT_BASE_URL: "https://stt.example.com",
        STT_API_KEY: "test-api-key",
      });

      const { createTranscriptionProvider } = await import(
        "../transcription-provider"
      );
      const provider = createTranscriptionProvider();

      const originalFetch = globalThis.fetch;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fetch = mockFetch;

      try {
        const file = new File(["fake audio"], "test.webm", {
          type: "audio/webm",
        });
        const result = await provider.transcribe({
          audioFile: file,
        });

        expect(result.text).toBe("");
        expect(result.error?.code).toBe("TRANSCRIPTION_UPSTREAM_ERROR");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("TranscriptionResult structure", () => {
    it("always includes provider name", async () => {
      mockEnv();
      const { createTranscriptionProvider } = await import(
        "../transcription-provider"
      );
      const provider = createTranscriptionProvider();

      const file = new File(["fake audio data"], "test.webm", {
        type: "audio/webm",
      });
      const result = await provider.transcribe({ audioFile: file });

      expect(result.provider).toBeDefined();
      expect(typeof result.provider).toBe("string");
    });

    it("always includes a requestId", async () => {
      mockEnv();
      const { createTranscriptionProvider } = await import(
        "../transcription-provider"
      );
      const provider = createTranscriptionProvider();

      const file = new File(["fake audio data"], "test.webm", {
        type: "audio/webm",
      });
      const result = await provider.transcribe({ audioFile: file });

      expect(result.requestId).toBeDefined();
      expect(typeof result.requestId).toBe("string");
      expect(result.requestId.length).toBeGreaterThan(0);
    });

    it("uses provided requestId when given", async () => {
      mockEnv();
      const { createTranscriptionProvider } = await import(
        "../transcription-provider"
      );
      const provider = createTranscriptionProvider();

      const file = new File(["fake audio data"], "test.webm", {
        type: "audio/webm",
      });
      const result = await provider.transcribe({
        audioFile: file,
        requestId: "my-custom-id",
      });

      expect(result.requestId).toBe("my-custom-id");
    });
  });

  describe("error codes", () => {
    it("all error codes are valid constants", async () => {
      const { TRANSCRIPTION_ERROR_CODES } = await import(
        "../transcription-provider"
      );
      expect(TRANSCRIPTION_ERROR_CODES.NOT_CONFIGURED).toBe(
        "TRANSCRIPTION_NOT_CONFIGURED"
      );
      expect(TRANSCRIPTION_ERROR_CODES.TIMEOUT).toBe("TRANSCRIPTION_TIMEOUT");
      expect(TRANSCRIPTION_ERROR_CODES.UPSTREAM_ERROR).toBe(
        "TRANSCRIPTION_UPSTREAM_ERROR"
      );
    });
  });
});
