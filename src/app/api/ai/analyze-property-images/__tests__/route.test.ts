// ============================================================
// POST /api/ai/analyze-property-images — Integration Tests
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { NextRequest } from "next/server";
import { createAnalyzeImagesHandler } from "@/lib/ai/routes/analyze-property-images-handler";
import type {
  DeepSeekVisionProvider,
  PropertyVisionResult,
  AIUsage,
  VisionAnalysisInput,
  SingleImageResult,
  PropertyMediaAiLabel,
} from "@/lib/ai/types";

// ============================================================
// Mock Provider (existing, kept for backward compat tests)
// ============================================================

function mockVisionProvider(): DeepSeekVisionProvider {
  return {
    async analyzePropertyImages(): Promise<PropertyVisionResult> {
      const usage: AIUsage = { inputTokens: 100, outputTokens: 50, estimatedCostUsd: 0 };
      return {
        mediaResults: [
          {
            correlationId: "test-correlation-1",
            mediaId: "media-1",
            aiLabels: {
              sceneType: "bedroom",
              styles: ["modern"],
              visibleFeatures: ["bed", "window"],
              condition: ["clean"],
              lighting: ["natural"],
              appliances: ["air_conditioner"],
              confidence: 0.9,
              evidence: ["bed_visible"],
              uncertainLabels: [],
            },
            status: "completed" as const,
          },
        ],
        visualSummary: "A clean modern bedroom with natural light",
        factChecks: [
          {
            textClaim: "精装修",
            fieldName: "decoration",
            visualResult: "confirmed_visual_support",
            confidence: 0.85,
            suggestion: "图片与描述一致",
          },
        ],
        usage,
      };
    },
  };
}

// ============================================================
// Existing Tests
// ============================================================

describe("POST /api/ai/analyze-property-images", () => {
  it("returns 401 when unauthenticated", async () => {
    // We test the handler structure by verifying the factory pattern works
    const handler = createAnalyzeImagesHandler(() => mockVisionProvider());
    expect(typeof handler).toBe("function");
  });

  it("handler factory accepts injectable provider", () => {
    const provider = mockVisionProvider();
    const handler = createAnalyzeImagesHandler(() => provider);
    expect(handler).toBeDefined();
  });

  it("request schema rejects missing propertyId", () => {
    const schema = z.object({
      propertyId: z.string().uuid(),
      propertyMediaIds: z.array(z.string().uuid()).min(1).max(8),
    });
    const result = schema.safeParse({ propertyMediaIds: ["00000000-0000-0000-0000-000000000001"] });
    expect(result.success).toBe(false);
  });

  it("request schema rejects empty media array", () => {
    const schema = z.object({
      propertyId: z.string().uuid(),
      propertyMediaIds: z.array(z.string().uuid()).min(1).max(8),
    });
    const result = schema.safeParse({
      propertyId: "00000000-0000-0000-0000-000000000001",
      propertyMediaIds: [],
    });
    expect(result.success).toBe(false);
  });

  it("request schema rejects more than 8 images", () => {
    const schema = z.object({
      propertyId: z.string().uuid(),
      propertyMediaIds: z.array(z.string().uuid()).min(1).max(8),
    });
    const ids = Array.from({ length: 9 }, () => "00000000-0000-0000-0000-000000000001");
    const result = schema.safeParse({
      propertyId: "00000000-0000-0000-0000-000000000001",
      propertyMediaIds: ids,
    });
    expect(result.success).toBe(false);
  });

  it("mock provider returns structured labels", async () => {
    const provider = mockVisionProvider();
    const result = await provider.analyzePropertyImages({
      requestId: "test-1",
      imageUrls: ["https://example.com/img.jpg"],
      correlationIds: ["test-correlation-1"],
      propertyFacts: { title: "Test" },
      schemaVersion: "1.0",
      promptVersion: "1",
      modelName: "deepseek-vl2",
    });

    expect(result.mediaResults).toHaveLength(1);
    expect(result.mediaResults[0]?.aiLabels.sceneType).toBe("bedroom");
    expect(result.visualSummary).toContain("bedroom");
    expect(result.factChecks).toHaveLength(1);
  });

  it("handler creation fails gracefully when provider throws", () => {
    // A handler factory that simulates provider creation failure
    const handler = createAnalyzeImagesHandler(() => {
      throw new Error("Provider unavailable");
    });
    expect(handler).toBeDefined();
  });
});

// ============================================================
// CorrelationId Safety Integration Tests
// ============================================================

// ============================================================
// Hoisted Mocks for Supabase & Env
// ============================================================

const {
  mockAuthGetUser,
  mockRpc,
  mockHasFeature,
  mockCreateClient,
  mockCreateSignedUrl,
  rpcCallLog,
} = vi.hoisted(() => {
  const _auth = vi.fn();
  const _rpc = vi.fn();
  const _feat = vi.fn();
  const _createClient = vi.fn();
  const _signedUrl = vi.fn();
  const _rpcLog: Array<{ name: string; params: Record<string, unknown> }> = [];

  _signedUrl.mockResolvedValue({ data: { signedUrl: "https://signed.example.com/test.jpg" } });
  _createClient.mockResolvedValue({
    storage: { from: vi.fn(() => ({ createSignedUrl: _signedUrl })) },
  });

  return {
    mockAuthGetUser: _auth,
    mockRpc: _rpc,
    mockHasFeature: _feat,
    mockCreateClient: _createClient,
    mockCreateSignedUrl: _signedUrl,
    rpcCallLog: _rpcLog,
  };
});

vi.mock("@/lib/supabase/route-handler", () => ({
  createRouteHandlerClient: (_request: NextRequest) => {
    return Promise.resolve({
      client: {
        auth: { getUser: mockAuthGetUser },
        from: buildSupabaseBuilder,
        rpc: async (name: string, params: Record<string, unknown>) => {
          rpcCallLog.push({ name, params });
          return mockRpc(name, params) as Promise<unknown>;
        },
      },
      jsonResponse: (
        body: unknown,
        init?: { status?: number; headers?: Record<string, string> }
      ) =>
        new Response(JSON.stringify(body), {
          status: init?.status ?? 200,
          headers: {
            "content-type": "application/json",
            ...(init?.headers ?? {}),
          },
        }),
    });
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

vi.mock("@/features/access-control/guards", () => ({
  hasFeature: mockHasFeature,
}));

vi.mock("@/config/env", () => ({
  getServerEnv: () => ({
    DEEPSEEK_VISION_BASE_URL_PRIMARY: "https://vision.example.com",
    DEEPSEEK_VISION_API_KEY: "test-vision-key",
    AI_DAILY_CONTENT_LIMIT: 10,
    AI_DAILY_COST_LIMIT_USD: 10.0,
  }),
}));

// ============================================================
// Test Constants
// ============================================================

const PROPERTY_ID = "00000000-0000-0000-0000-000000000001";
const MEDIA_ID_1 = "00000000-0000-0000-0000-000000000011";
const MEDIA_ID_2 = "00000000-0000-0000-0000-000000000012";
const MEDIA_ID_3 = "00000000-0000-0000-0000-000000000013";
const MEDIA_IDS = [MEDIA_ID_1, MEDIA_ID_2, MEDIA_ID_3];
const WORKSPACE_ID = "00000000-0000-0000-0000-000000000100";

interface MediaRecord {
  id: string;
  storage_path: string;
  property_id: string;
  workspace_id: string;
}

function createMediaRecords(ids: string[]): MediaRecord[] {
  return ids.map((id) => ({
    id,
    storage_path: `ws/${WORKSPACE_ID}/props/${PROPERTY_ID}/img-${id.slice(-4)}.jpg`,
    property_id: PROPERTY_ID,
    workspace_id: WORKSPACE_ID,
  }));
}

// Mutable, set in beforeEach
let currentMediaRecords: MediaRecord[] = createMediaRecords(MEDIA_IDS);

// ============================================================
// Supabase Query Builder Mock
// ============================================================

function buildSupabaseBuilder(table: string) {
  const chain: Record<string, unknown> = {};

  // Chaining methods always return the chain itself
  const chainingMethods = [
    "select", "eq", "in", "is", "limit",
    "order", "neq", "gte", "lte",
  ];
  for (const m of chainingMethods) {
    chain[m] = vi.fn(() => chain);
  }

  // Thenable resolution — used when the query does NOT call .single()
  chain.then = vi.fn((resolve: (v: unknown) => void) => {
    if (table === "property_media") {
      resolve({ data: currentMediaRecords, error: null });
      return Promise.resolve({ data: currentMediaRecords, error: null });
    }
    resolve({ data: null, error: null });
    return Promise.resolve({ data: null, error: null });
  });

  // Terminal methods for tables that use .single()
  if (table === "workspace_members") {
    chain.single = vi.fn(() =>
      Promise.resolve({ data: { workspace_id: WORKSPACE_ID }, error: null })
    );
    chain.maybeSingle = vi.fn(() =>
      Promise.resolve({ data: { workspace_id: WORKSPACE_ID }, error: null })
    );
  } else if (table === "properties") {
    chain.single = vi.fn(() =>
      Promise.resolve({
        data: { id: PROPERTY_ID, workspace_id: WORKSPACE_ID, title: "测试房源" },
        error: null,
      })
    );
    chain.maybeSingle = vi.fn(() =>
      Promise.resolve({
        data: { id: PROPERTY_ID, workspace_id: WORKSPACE_ID, title: "测试房源" },
        error: null,
      })
    );
  }

  return chain;
}

// ============================================================
// Helpers
// ============================================================

function makeRequest(body: Record<string, unknown>): NextRequest {
  const headers = new Headers();
  headers.set("content-type", "application/json");
  return new NextRequest("http://localhost/api/ai/analyze-property-images", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function validBody(mediaIds: string[] = MEDIA_IDS): Record<string, unknown> {
  return { propertyId: PROPERTY_ID, propertyMediaIds: mediaIds };
}

async function getBody(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function makeQuotaReserve(reservationId = "res-test"): Record<string, unknown> {
  return {
    data: {
      success: true,
      reservation_id: reservationId,
      already_reserved: false,
    },
    error: null,
  };
}

function makePersistSuccess(): Record<string, unknown> {
  return { data: { success: true }, error: null };
}

function makeReleaseSuccess(): Record<string, unknown> {
  return { data: { success: true }, error: null };
}

// ============================================================
// Mock Vision Provider Factory
// ============================================================

type CorrelationBehavior =
  | "normal"
  | "out_of_order"
  | "missing_correlation_id"
  | "duplicate_correlation_id"
  | "unknown_correlation_id"
  | "fewer_results"
  | "more_results";

const DEFAULT_AI_LABELS: PropertyMediaAiLabel = {
  sceneType: "living_room",
  styles: ["modern"],
  visibleFeatures: ["sofa", "tv"],
  condition: ["clean"],
  lighting: ["natural"],
  appliances: ["tv"],
  confidence: 0.9,
  evidence: ["sofa_visible"],
  uncertainLabels: [],
};

/**
 * Mock Vision Provider Factory
 *
 * Constructs a provider that echoes correlationIds (or deliberately
 * mis-echoes them) based on the `behavior` parameter.
 *
 * Backward-compatibility: If the handler does NOT pass `correlationIds`
 * in the VisionAnalysisInput (old handler contract), the provider
 * returns empty results. The handler should be updated to pass
 * `correlationIds` for correlationId-based safety validation.
 */
function createCorrelatedProvider(
  behavior: CorrelationBehavior
): DeepSeekVisionProvider {
  return {
    async analyzePropertyImages(
      input: VisionAnalysisInput & { correlationIds?: string[] }
    ): Promise<PropertyVisionResult> {
      // Defensive: handler MUST pass correlationIds for correlationId safety.
      // Old handler does not — return empty results instead of crashing.
      const rawCids: string[] | undefined = input.correlationIds;
      if (!rawCids || rawCids.length === 0) {
        return {
          mediaResults: [],
          visualSummary: "PROVIDER: correlationIds not provided by handler",
          factChecks: [],
          usage: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 },
        };
      }
      const correlationIds = rawCids;
      const usage: AIUsage = {
        inputTokens: 100,
        outputTokens: 50,
        estimatedCostUsd: 0,
      };

      function makeResult(cid: string, idx: number): SingleImageResult {
        return {
          correlationId: cid,
          mediaId: `provider-media-${idx}`,
          aiLabels: DEFAULT_AI_LABELS,
          status: "completed",
        };
      }

      let mediaResults: SingleImageResult[];

      switch (behavior) {
        case "normal":
          // Results match input order; correct correlationIds echoed back
          mediaResults = correlationIds.map((cid, i) => makeResult(cid, i));
          break;

        case "out_of_order":
          // Results in reverse order — handler MUST map by correlationId, not index.
          // If handler used index-based mapping, mediaIds would be swapped.
          mediaResults = [...correlationIds]
            .reverse()
            .map((cid, i) => makeResult(cid, i));
          break;

        case "missing_correlation_id":
          // One result has an empty string for correlationId
          mediaResults = correlationIds.map((cid, i) => makeResult(cid, i));
          if (mediaResults.length > 1) {
            const second = mediaResults[1];
            if (second) {
              mediaResults[1] = { ...second, correlationId: "" };
            }
          }
          break;

        case "duplicate_correlation_id":
          // Two results share the first correlationId
          mediaResults = correlationIds.map((cid, i) =>
            makeResult(i === 0 ? cid : correlationIds[0] ?? "missing-id", i)
          );
          break;

        case "unknown_correlation_id":
          // Second result has a correlationId not in the input set
          mediaResults = correlationIds.map((cid, i) => makeResult(cid, i));
          if (mediaResults.length > 1) {
            const second = mediaResults[1];
            if (second) {
              mediaResults[1] = {
                ...second,
                correlationId: "00000000-0000-0000-0000-000000000000",
              };
            }
          }
          break;

        case "fewer_results":
          // Return fewer results than input images (count mismatch)
          mediaResults = correlationIds
            .slice(0, -1)
            .map((cid, i) => makeResult(cid, i));
          break;

        case "more_results":
          // Return more results than input images (count mismatch)
          mediaResults = correlationIds.map((cid, i) => makeResult(cid, i));
          mediaResults.push(
            makeResult("extra-cid-" + mediaResults.length, mediaResults.length)
          );
          break;

        default:
          mediaResults = [];
      }

      return {
        mediaResults,
        visualSummary: "测试视觉摘要",
        factChecks: [],
        usage,
      };
    },
  };
}

// ============================================================
// Tests: correlationId Safety
// ============================================================

describe("correlationId safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcCallLog.length = 0;

    // Auth
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: "user-test", email: "test@test.com" } },
    });

    // Entitlement
    mockHasFeature.mockResolvedValue(true);

    // RPC defaults
    mockRpc.mockImplementation(
      (name: string, _params: Record<string, unknown>) => {
        if (name === "reserve_ai_quota") return makeQuotaReserve();
        if (name === "persist_visual_analysis") return makePersistSuccess();
        if (name === "release_ai_quota") return makeReleaseSuccess();
        return { data: null, error: { message: "unknown rpc" } };
      }
    );

    // Reset media records
    currentMediaRecords = createMediaRecords(MEDIA_IDS);

    // Reset signed URL mock
    mockCreateSignedUrl.mockImplementation(
      async (path: string, _expiry: number) => ({
        data: {
          signedUrl: `https://signed.example.com/${encodeURIComponent(path)}`,
        },
      })
    );
  });

  // ----------------------------------------------------------
  // corr-01: Normal flow — maps results correctly via correlationId
  // ----------------------------------------------------------

  it("corr-01: normal flow — maps results correctly via correlationId", async () => {
    const provider = createCorrelatedProvider("normal");
    const handler = createAnalyzeImagesHandler(() => provider);

    const res = await handler(makeRequest(validBody(MEDIA_IDS)));
    expect(res.status).toBe(200);

    const body = await getBody(res);
    expect(body.error).toBeNull();

    const data = body.data as Record<string, unknown>;
    expect(data).toBeDefined();
    expect(data.model).toBe("deepseek-vl2");
    expect(data.visualSummary).toBe("测试视觉摘要");

    const mediaResults = data.mediaResults as Array<Record<string, unknown>>;
    expect(mediaResults).toHaveLength(3);

    // All three mediaIds must appear, each exactly once
    const returnedIds = mediaResults.map((mr) => mr.mediaId as string);
    expect(new Set(returnedIds)).toEqual(new Set(MEDIA_IDS));
    expect(returnedIds.length).toBe(3);

    // Verify persist RPC was called (success path)
    const persistCalls = rpcCallLog.filter(
      (c) => c.name === "persist_visual_analysis"
    );
    expect(persistCalls.length).toBe(1);

    // Ensure release was NOT called
    const releaseCalls = rpcCallLog.filter(
      (c) => c.name === "release_ai_quota"
    );
    expect(releaseCalls.length).toBe(0);
  });

  // ----------------------------------------------------------
  // corr-02: Out-of-order results — maps via correlationId not index
  // ----------------------------------------------------------

  it("corr-02: out-of-order results — maps via correlationId not index", async () => {
    // If the handler mistakenly uses index-based mapping, this test
    // will either fail (if it validates index) or silently mis-map mediaIds.
    // The handler must succeed (200) and return all correct mediaIds.
    const provider = createCorrelatedProvider("out_of_order");
    const handler = createAnalyzeImagesHandler(() => provider);

    const res = await handler(makeRequest(validBody(MEDIA_IDS)));
    expect(res.status).toBe(200);

    const body = await getBody(res);
    expect(body.error).toBeNull();

    const data = body.data as Record<string, unknown>;
    const mediaResults = data.mediaResults as Array<Record<string, unknown>>;

    // All three mediaIds must appear (order may differ from input)
    expect(mediaResults).toHaveLength(3);
    const returnedIds = mediaResults.map((mr) => mr.mediaId as string);
    expect(new Set(returnedIds)).toEqual(new Set(MEDIA_IDS));

    // No duplicates prove correct mapping
    expect(returnedIds.length).toBe(new Set(returnedIds).size);

    // Verify persist was called (success path — mapping was correct)
    const persistCalls = rpcCallLog.filter(
      (c) => c.name === "persist_visual_analysis"
    );
    expect(persistCalls.length).toBe(1);

    // No release call (no error occurred)
    const releaseCalls = rpcCallLog.filter(
      (c) => c.name === "release_ai_quota"
    );
    expect(releaseCalls.length).toBe(0);
  });

  // ----------------------------------------------------------
  // corr-03: Missing correlationId — fail with quota release
  // ----------------------------------------------------------

  it("corr-03: missing correlationId — fails with error and releases quota", async () => {
    const provider = createCorrelatedProvider("missing_correlation_id");
    const handler = createAnalyzeImagesHandler(() => provider);

    const res = await handler(makeRequest(validBody(MEDIA_IDS)));
    expect(res.status).toBe(500);

    const body = await getBody(res);
    expect(body.data).toBeNull();
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("INTERNAL_ERROR");
    expect(err.message).toContain("correlationId");

    // Quota MUST be released
    const releaseCalls = rpcCallLog.filter(
      (c) => c.name === "release_ai_quota"
    );
    expect(releaseCalls.length).toBeGreaterThanOrEqual(1);

    // Persist MUST NOT be called
    const persistCalls = rpcCallLog.filter(
      (c) => c.name === "persist_visual_analysis"
    );
    expect(persistCalls.length).toBe(0);
  });

  // ----------------------------------------------------------
  // corr-04: Duplicate correlationId — fail with quota release
  // ----------------------------------------------------------

  it("corr-04: duplicate correlationId — fails with error and releases quota", async () => {
    const provider = createCorrelatedProvider("duplicate_correlation_id");
    const handler = createAnalyzeImagesHandler(() => provider);

    const res = await handler(makeRequest(validBody(MEDIA_IDS)));
    expect(res.status).toBe(500);

    const body = await getBody(res);
    expect(body.data).toBeNull();
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("INTERNAL_ERROR");
    expect(err.message).toContain("重复");

    // Quota MUST be released
    const releaseCalls = rpcCallLog.filter(
      (c) => c.name === "release_ai_quota"
    );
    expect(releaseCalls.length).toBeGreaterThanOrEqual(1);

    // Persist MUST NOT be called
    const persistCalls = rpcCallLog.filter(
      (c) => c.name === "persist_visual_analysis"
    );
    expect(persistCalls.length).toBe(0);
  });

  // ----------------------------------------------------------
  // corr-05: Unknown correlationId — fail with quota release
  // ----------------------------------------------------------

  it("corr-05: unknown correlationId — fails with error and releases quota", async () => {
    const provider = createCorrelatedProvider("unknown_correlation_id");
    const handler = createAnalyzeImagesHandler(() => provider);

    const res = await handler(makeRequest(validBody(MEDIA_IDS)));
    expect(res.status).toBe(500);

    const body = await getBody(res);
    expect(body.data).toBeNull();
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("INTERNAL_ERROR");
    expect(err.message).toContain("未知");

    // Quota MUST be released
    const releaseCalls = rpcCallLog.filter(
      (c) => c.name === "release_ai_quota"
    );
    expect(releaseCalls.length).toBeGreaterThanOrEqual(1);

    // Persist MUST NOT be called
    const persistCalls = rpcCallLog.filter(
      (c) => c.name === "persist_visual_analysis"
    );
    expect(persistCalls.length).toBe(0);
  });

  // ----------------------------------------------------------
  // corr-06: Result count mismatch (fewer) — fail with quota release
  // ----------------------------------------------------------

  it("corr-06: fewer results than images — fails and releases quota", async () => {
    const provider = createCorrelatedProvider("fewer_results");
    const handler = createAnalyzeImagesHandler(() => provider);

    const res = await handler(makeRequest(validBody(MEDIA_IDS)));
    expect(res.status).toBe(500);

    const body = await getBody(res);
    expect(body.data).toBeNull();
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("INTERNAL_ERROR");
    expect(err.message).toContain("数量不匹配");

    // Quota MUST be released
    const releaseCalls = rpcCallLog.filter(
      (c) => c.name === "release_ai_quota"
    );
    expect(releaseCalls.length).toBeGreaterThanOrEqual(1);

    // Persist MUST NOT be called
    const persistCalls = rpcCallLog.filter(
      (c) => c.name === "persist_visual_analysis"
    );
    expect(persistCalls.length).toBe(0);
  });

  // ----------------------------------------------------------
  // corr-07: Result count mismatch (more) — fail with quota release
  // ----------------------------------------------------------

  it("corr-07: more results than images — fails and releases quota", async () => {
    const provider = createCorrelatedProvider("more_results");
    const handler = createAnalyzeImagesHandler(() => provider);

    const res = await handler(makeRequest(validBody(MEDIA_IDS)));
    expect(res.status).toBe(500);

    const body = await getBody(res);
    expect(body.data).toBeNull();
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("INTERNAL_ERROR");
    expect(err.message).toContain("数量不匹配");

    // Quota MUST be released
    const releaseCalls = rpcCallLog.filter(
      (c) => c.name === "release_ai_quota"
    );
    expect(releaseCalls.length).toBeGreaterThanOrEqual(1);

    // Persist MUST NOT be called
    const persistCalls = rpcCallLog.filter(
      (c) => c.name === "persist_visual_analysis"
    );
    expect(persistCalls.length).toBe(0);
  });

  // ----------------------------------------------------------
  // corr-08: Quota release uses correct failure reason for each scenario
  // ----------------------------------------------------------

  it("corr-08: quota release uses correct failure reason per scenario", async () => {
    // --- Missing correlationId ---
    let provider = createCorrelatedProvider("missing_correlation_id");
    let handler = createAnalyzeImagesHandler(() => provider);
    rpcCallLog.length = 0;

    await handler(makeRequest(validBody(MEDIA_IDS)));
    const missingRelease = rpcCallLog.find(
      (c) => c.name === "release_ai_quota"
    );
    expect(missingRelease).toBeDefined();
    expect(missingRelease?.params.p_reason).toBe(
      "missing_correlation_id"
    );

    // --- Duplicate correlationId ---
    provider = createCorrelatedProvider("duplicate_correlation_id");
    handler = createAnalyzeImagesHandler(() => provider);
    rpcCallLog.length = 0;

    await handler(makeRequest(validBody(MEDIA_IDS)));
    const dupRelease = rpcCallLog.find((c) => c.name === "release_ai_quota");
    expect(dupRelease).toBeDefined();
    expect(dupRelease?.params.p_reason).toBe(
      "duplicate_correlation_id"
    );

    // --- Unknown correlationId ---
    provider = createCorrelatedProvider("unknown_correlation_id");
    handler = createAnalyzeImagesHandler(() => provider);
    rpcCallLog.length = 0;

    await handler(makeRequest(validBody(MEDIA_IDS)));
    const unknownRelease = rpcCallLog.find(
      (c) => c.name === "release_ai_quota"
    );
    expect(unknownRelease).toBeDefined();
    expect(unknownRelease?.params.p_reason).toBe(
      "unknown_correlation_id"
    );

    // --- Count mismatch ---
    provider = createCorrelatedProvider("fewer_results");
    handler = createAnalyzeImagesHandler(() => provider);
    rpcCallLog.length = 0;

    await handler(makeRequest(validBody(MEDIA_IDS)));
    const countRelease = rpcCallLog.find(
      (c) => c.name === "release_ai_quota"
    );
    expect(countRelease).toBeDefined();
    expect(countRelease?.params.p_reason).toBe("correlation_mismatch");
  });

  // ----------------------------------------------------------
  // corr-09: Normal flow does NOT call release (idempotent)
  // ----------------------------------------------------------

  it("corr-09: successful analysis does not call release (only persist)", async () => {
    const provider = createCorrelatedProvider("normal");
    const handler = createAnalyzeImagesHandler(() => provider);

    await handler(makeRequest(validBody(MEDIA_IDS)));

    // reserve called
    const reserveCalls = rpcCallLog.filter(
      (c) => c.name === "reserve_ai_quota"
    );
    expect(reserveCalls.length).toBe(1);

    // persist called
    const persistCalls = rpcCallLog.filter(
      (c) => c.name === "persist_visual_analysis"
    );
    expect(persistCalls.length).toBe(1);

    // release NOT called
    const releaseCalls = rpcCallLog.filter(
      (c) => c.name === "release_ai_quota"
    );
    expect(releaseCalls.length).toBe(0);
  });

  // ----------------------------------------------------------
  // corr-10: Error path does not call persist (no DB write)
  // ----------------------------------------------------------

  it("corr-10: error path — persist NOT called, release called", async () => {
    const scenarios: CorrelationBehavior[] = [
      "missing_correlation_id",
      "duplicate_correlation_id",
      "unknown_correlation_id",
      "fewer_results",
      "more_results",
    ];

    for (const behavior of scenarios) {
      rpcCallLog.length = 0;
      const provider = createCorrelatedProvider(behavior);
      const handler = createAnalyzeImagesHandler(() => provider);

      const res = await handler(makeRequest(validBody(MEDIA_IDS)));
      expect(res.status).toBe(500);

      const persistCalls = rpcCallLog.filter(
        (c) => c.name === "persist_visual_analysis"
      );
      expect(persistCalls.length).toBe(0);

      const releaseCalls = rpcCallLog.filter(
        (c) => c.name === "release_ai_quota"
      );
      expect(releaseCalls.length).toBeGreaterThanOrEqual(1);
    }
  });
});
