// ============================================================
// DeepSeekVisionProvider Unit Tests
// Owner: test-engineer
// Contract: ai-contract.md v2.0 §2.3
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { VisionAnalysisInput } from "../../types";

// ============================================================
// Test Helpers
// ============================================================

function mockEnv(overrides: Record<string, string | undefined> = {}) {
  vi.doMock("@/config/env", () => ({
    getServerEnv: () => ({
      NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      DEEPSEEK_VISION_API_KEY: undefined,
      DEEPSEEK_VISION_BASE_URL_PRIMARY: undefined,
      DEEPSEEK_VISION_BASE_URL_FALLBACK: undefined,
      DEEPSEEK_VISION_MODEL: "deepseek-vl2",
      DEEPSEEK_VISION_MAX_IMAGES: 8,
      DEEPSEEK_MODEL: "deepseek-v4-flash",
      DEEPSEEK_FALLBACK_MODEL: "deepseek-v4-pro",
      DEEPSEEK_REQUEST_TIMEOUT_MS: 45000,
      STT_BASE_URL: undefined,
      STT_API_KEY: undefined,
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

function makeInput(overrides?: Partial<VisionAnalysisInput>): VisionAnalysisInput {
  return {
    requestId: "test-req-1",
    imageUrls: ["https://storage.example.com/img1.jpg"],
    propertyFacts: {},
    schemaVersion: "1.0",
    promptVersion: "1",
    modelName: "deepseek-vl2",
    ...overrides,
  };
}

// ============================================================
// Mock Provider Tests
// ============================================================

describe("DeepSeekVisionProvider (Mock)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns mock results when no API key configured", async () => {
    mockEnv();
    const { createDeepSeekVisionProvider } = await import(
      "../deepseek-vision-provider"
    );
    const provider = createDeepSeekVisionProvider();

    const result = await provider.analyzePropertyImages(makeInput());

    expect(result.mediaResults).toBeDefined();
    expect(result.mediaResults.length).toBe(1);
    expect(result.mediaResults[0]?.status).toBe("completed");
    expect(result.mediaResults[0]?.aiLabels.sceneType).toBe(
      "indoor_living_room"
    );
    expect(result.visualSummary).toBeDefined();
    expect(result.visualSummary.length).toBeGreaterThan(0);
    expect(result.factChecks).toBeDefined();
    expect(result.factChecks.length).toBeGreaterThan(0);
    expect(result.usage).toBeDefined();
  });

  it("handles multiple images", async () => {
    mockEnv();
    const { createDeepSeekVisionProvider } = await import(
      "../deepseek-vision-provider"
    );
    const provider = createDeepSeekVisionProvider();

    const result = await provider.analyzePropertyImages(
      makeInput({
        imageUrls: [
          "https://storage.example.com/img1.jpg",
          "https://storage.example.com/img2.jpg",
          "https://storage.example.com/img3.jpg",
        ],
      })
    );

    expect(result.mediaResults.length).toBe(3);
    expect(result.mediaResults[0]?.status).toBe("completed");
    expect(result.mediaResults[1]?.aiLabels).toBeDefined();
  });

  it("returns consistent result shape", async () => {
    mockEnv();
    const { createDeepSeekVisionProvider } = await import(
      "../deepseek-vision-provider"
    );
    const provider = createDeepSeekVisionProvider();

    const result = await provider.analyzePropertyImages(makeInput());

    // Verify all required fields are present
    for (const mr of result.mediaResults) {
      expect(mr.mediaId).toBeDefined();
      expect(mr.status).toMatch(/completed|failed/);
      expect(mr.aiLabels.sceneType).toBeDefined();
      expect(mr.aiLabels.styles).toBeInstanceOf(Array);
      expect(mr.aiLabels.visibleFeatures).toBeInstanceOf(Array);
      expect(mr.aiLabels.condition).toBeInstanceOf(Array);
      expect(mr.aiLabels.lighting).toBeInstanceOf(Array);
      expect(mr.aiLabels.appliances).toBeInstanceOf(Array);
      expect(mr.aiLabels.confidence).toBeGreaterThanOrEqual(0);
      expect(mr.aiLabels.confidence).toBeLessThanOrEqual(1);
      expect(mr.aiLabels.evidence).toBeInstanceOf(Array);
      expect(mr.aiLabels.uncertainLabels).toBeInstanceOf(Array);
    }

    expect(result.usage.estimatedCostUsd).toBe(0); // mock has no cost
  });

  it("includes visual summary for property description", async () => {
    mockEnv();
    const { createDeepSeekVisionProvider } = await import(
      "../deepseek-vision-provider"
    );
    const provider = createDeepSeekVisionProvider();

    const result = await provider.analyzePropertyImages(
      makeInput({
        propertyFacts: {
          title: "Modern apartment",
          decoration: "精装修",
        },
      })
    );

    expect(result.visualSummary.toLowerCase()).toContain("living");
    expect(result.factChecks).toBeDefined();
  });

  it("returns zero-cost usage for mock", async () => {
    mockEnv();
    const { createDeepSeekVisionProvider } = await import(
      "../deepseek-vision-provider"
    );
    const provider = createDeepSeekVisionProvider();

    const result = await provider.analyzePropertyImages(makeInput());
    expect(result.usage.estimatedCostUsd).toBe(0);
  });
});

// ============================================================
// SSRF Protection Tests
// ============================================================

describe("DeepSeekVisionProvider SSRF Protection", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("rejects localhost URLs", async () => {
    mockEnv({
      DEEPSEEK_VISION_API_KEY: "test-key",
      DEEPSEEK_VISION_BASE_URL_PRIMARY: "https://api.deepseek.com",
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: "{}" } }],
      }),
    });

    const { createDeepSeekVisionProvider } = await import(
      "../deepseek-vision-provider"
    );
    const provider = createDeepSeekVisionProvider(mockFetch);

    await expect(
      provider.analyzePropertyImages(
        makeInput({ imageUrls: ["http://localhost:3000/img.jpg"] })
      )
    ).rejects.toThrow("Image URL must use HTTPS");
  });

  it("rejects metadata service URLs", async () => {
    mockEnv({
      DEEPSEEK_VISION_API_KEY: "test-key",
      DEEPSEEK_VISION_BASE_URL_PRIMARY: "https://api.deepseek.com",
    });

    const { createDeepSeekVisionProvider } = await import(
      "../deepseek-vision-provider"
    );
    const provider = createDeepSeekVisionProvider();

    await expect(
      provider.analyzePropertyImages(
        makeInput({
          imageUrls: ["https://169.254.169.254/latest/meta-data"],
        })
      )
    ).rejects.toThrow("Internal network URLs are not allowed");
  });

  it("rejects IP-based URLs", async () => {
    mockEnv({
      DEEPSEEK_VISION_API_KEY: "test-key",
      DEEPSEEK_VISION_BASE_URL_PRIMARY: "https://api.deepseek.com",
    });

    const { createDeepSeekVisionProvider } = await import(
      "../deepseek-vision-provider"
    );
    const provider = createDeepSeekVisionProvider();

    await expect(
      provider.analyzePropertyImages(
        makeInput({ imageUrls: ["https://192.168.1.1/admin"] })
      )
    ).rejects.toThrow("IP-based image URLs are not allowed");
  });

  it("accepts valid HTTPS storage URLs", async () => {
    mockEnv({
      DEEPSEEK_VISION_API_KEY: "test-key",
      DEEPSEEK_VISION_BASE_URL_PRIMARY: "https://api.deepseek.com",
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                mediaResults: [
                  {
                    mediaId: "img-1",
                    aiLabels: {
                      sceneType: "bedroom",
                      styles: ["modern"],
                      visibleFeatures: ["bed"],
                      condition: ["good"],
                      lighting: ["natural"],
                      appliances: [],
                      confidence: 0.9,
                      evidence: ["bed_visible"],
                      uncertainLabels: [],
                    },
                    status: "completed",
                  },
                ],
                visualSummary: "A modern bedroom",
                factChecks: [],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      }),
    });

    const { createDeepSeekVisionProvider } = await import(
      "../deepseek-vision-provider"
    );
    const provider = createDeepSeekVisionProvider(mockFetch);

    const result = await provider.analyzePropertyImages(
      makeInput({
        imageUrls: ["https://supabase-storage.example.com/property/img1.jpg"],
      })
    );

    expect(result.mediaResults[0]?.aiLabels.sceneType).toBe("bedroom");
  });

  it("rejects bare IP addresses", async () => {
    mockEnv({
      DEEPSEEK_VISION_API_KEY: "test-key",
      DEEPSEEK_VISION_BASE_URL_PRIMARY: "https://api.deepseek.com",
    });

    const { createDeepSeekVisionProvider } = await import(
      "../deepseek-vision-provider"
    );
    const provider = createDeepSeekVisionProvider();

    await expect(
      provider.analyzePropertyImages(
        makeInput({ imageUrls: ["https://10.0.0.1/internal"] })
      )
    ).rejects.toThrow("IP-based image URLs are not allowed");
  });
});

// ============================================================
// Result Structure Tests
// ============================================================

describe("PropertyVisionResult structure", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("fact check has required fields", async () => {
    mockEnv();
    const { createDeepSeekVisionProvider } = await import(
      "../deepseek-vision-provider"
    );
    const provider = createDeepSeekVisionProvider();

    const result = await provider.analyzePropertyImages(makeInput());

    for (const fc of result.factChecks) {
      expect(fc.textClaim).toBeDefined();
      expect(fc.fieldName).toBeDefined();
      expect(fc.visualResult).toBeDefined();
      expect([
        "not_verified_by_images",
        "insufficient_evidence",
        "weak_visual_support",
        "confirmed_visual_support",
        "possible_conflict",
      ]).toContain(fc.visualResult);
      expect(fc.confidence).toBeGreaterThanOrEqual(0);
      expect(fc.confidence).toBeLessThanOrEqual(1);
      expect(fc.suggestion).toBeDefined();
    }
  });
});
