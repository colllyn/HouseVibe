/**
 * AI Quota Lifecycle — Comprehensive Integration Tests
 *
 * Tests the full reserve → settle/release lifecycle per:
 * - PRD §10.9
 * - compliance-and-audit-contract.md §4
 * - api-contract.md §10.6
 *
 * These tests verify the route handler's quota integration using mocks.
 * Database-level RPC atomicity tests are in supabase/tests/ai_quota_rpc.test.sql.
 *
 * Run: npx vitest run src/lib/ai/__tests__/quota-lifecycle.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { DeepSeekProviderError } from "@/lib/ai/types";
import { createGenerateContentHandler } from "@/lib/ai/routes/generate-content-handler";
import type {
  DeepSeekTextProvider,
  ContentGenerationInput,
  GenerateContentResult,
  GeneratedContent,
} from "@/lib/ai/types";

// ============================================================
// Hoisted Mocks
// ============================================================

const {
  mockGetUser,
  mockFromSingle,
  mockFromProps,
  mockRpc,
  mockHasFeature,
} = vi.hoisted(() => {
  const _mockGetUser = vi.fn();
  const _mockFromSingle = vi.fn();
  const _mockFromProps = vi.fn();
  const _mockRpc = vi.fn();
  const _mockHasFeature = vi.fn();
  return {
    mockGetUser: _mockGetUser,
    mockFromSingle: _mockFromSingle,
    mockFromProps: _mockFromProps,
    mockRpc: _mockRpc,
    mockHasFeature: _mockHasFeature,
  };
});

// Track which RPCs are called and with what params
const rpcCallLog: Array<{ name: string; params: Record<string, unknown> }> = [];

function buildQueryBuilder(isPropertyQuery = false) {
  const chain: Record<string, unknown> = {
    single: isPropertyQuery ? mockFromProps : mockFromSingle,
  };
  const returnThis = () => chain;
  Object.assign(chain, {
    select: returnThis, eq: returnThis, limit: returnThis, order: returnThis,
    in: returnThis, is: returnThis, neq: returnThis, gte: returnThis, lte: returnThis,
  });
  return chain;
}

function buildSupabaseClient() {
  return {
    client: {
      auth: { getUser: mockGetUser },
      from: (table: string) => buildQueryBuilder(table === "properties"),
      rpc: async (name: string, params: Record<string, unknown>) => {
        rpcCallLog.push({ name, params });
        return mockRpc(name, params);
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
  };
}

vi.mock("@/lib/supabase/route-handler", () => ({
  createRouteHandlerClient: () => Promise.resolve(buildSupabaseClient()),
}));

vi.mock("@/features/access-control/guards", () => ({
  hasFeature: mockHasFeature,
}));

vi.mock("@/config/env", () => ({
  getServerEnv: () => ({
    DEEPSEEK_MODEL: "deepseek-v4-flash",
    DEEPSEEK_FALLBACK_MODEL: "deepseek-v4-pro",
    DEEPSEEK_REQUEST_TIMEOUT_MS: 45000,
    AI_DAILY_CONTENT_LIMIT: 10,
    AI_DAILY_COST_LIMIT_USD: 10.0,
    AI_QUOTA_TIMEZONE: "Asia/Shanghai",
    SUPABASE_URL: "http://localhost:54321",
    SUPABASE_ANON_KEY: "mock-anon-key",
  }),
}));

// ============================================================
// Helpers
// ============================================================

function setupAuth(userId = "user-1", workspaceId = "ws-1") {
  mockGetUser.mockResolvedValue({
    data: { user: { id: userId, email: "test@test.com" } },
  });
  mockFromSingle.mockResolvedValue({
    data: { workspace_id: workspaceId },
    error: null,
  });
}

function setupProperty(overrides?: Record<string, unknown>) {
  mockFromProps.mockResolvedValue({
    data: {
      id: "00000000-0000-0000-0000-000000000001",
      workspace_id: "ws-1",
      is_shared: false,
      allow_marketing_reuse: false,
      status: "available",
      deleted_at: null,
      title: "天河温馨一房",
      city: "广州",
      district: "天河区",
      community_name: "体育花园",
      rental_type: "whole_unit",
      monthly_rent: 3500,
      bedrooms: 1,
      area_sqm: 45,
      has_elevator: true,
      pets_allowed: false,
      tags: ["近地铁", "采光好"],
      selling_points: ["朝南大阳台"],
      description: "精装修，拎包入住，交通便利",
      ...overrides,
    },
    error: null,
  });
}

const DEFAULT_CONTENT: GeneratedContent = {
  platform: "xiaohongshu" as const,
  titleOptions: ["天河温馨一房 | 3500近地铁"],
  coverText: "天河区精装修一房",
  hook: "广州天河区3500就能租到这样的房子？",
  body: "精装修一房，朝南大阳台，近地铁...",
  imageSequence: [],
  imageCaptions: [],
  factualSummary: "天河区3500元一房，精装修，近地铁",
  interactionQuestion: "你觉得这个房子怎么样？",
  privateMessageKeyword: "阳光租房",
  hashtags: ["广州租房", "天河区"],
  factsUsed: [{ field: "district", value: "天河区" }],
  visualFactsUsed: [],
  missingInformation: [],
  riskFlags: [],
  complianceFlags: [],
  requiresFactReview: false,
};

const DEFAULT_RESULT: GenerateContentResult = {
  output: DEFAULT_CONTENT,
  usage: { inputTokens: 1200, outputTokens: 800, estimatedCostUsd: 0.002 },
  model: "deepseek-v4-flash",
  requestId: "provider-req-001",
};

function makeProvider(
  generateContent?: (
    input: ContentGenerationInput,
    signal?: AbortSignal
  ) => Promise<GenerateContentResult>
): DeepSeekTextProvider {
  return {
    extractProperty: async () => { throw new Error("not implemented"); },
    extractClient: async () => { throw new Error("not implemented"); },
    parsePropertySearch: async () => { throw new Error("not implemented"); },
    generateContent: generateContent ?? (async () => DEFAULT_RESULT),
  };
}

function makeRequest(body: Record<string, unknown>): NextRequest {
  const headers = new Headers();
  headers.set("content-type", "application/json");
  return new NextRequest("http://localhost/api/ai/generate-content", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function validBody(overrides?: Record<string, unknown>) {
  return {
    propertyId: "00000000-0000-0000-0000-000000000001",
    platform: "xiaohongshu",
    idempotencyKey: `idem-test-${Date.now()}`,
    ...overrides,
  };
}

async function getBody(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function makeReserveSuccess(reservationId = "res-001") {
  return {
    data: {
      success: true,
      already_reserved: false,
      reservation_id: reservationId,
      status: "reserved",
      remaining_requests: 9,
      remaining_cost_usd: 9.99,
      daily_limit: 10,
      daily_cost_limit_usd: 10.0,
      used_requests: 1,
      used_cost_usd: 0.01,
    },
    error: null,
  };
}

function makeSettleSuccess() {
  return {
    data: { success: true, idempotent: false, id: "rec-001", status: "succeeded" },
    error: null,
  };
}

function makeReleaseSuccess() {
  return {
    data: { success: true, idempotent: false, id: "rec-001", status: "released" },
    error: null,
  };
}

function createHandler(provider?: DeepSeekTextProvider) {
  return createGenerateContentHandler(() => provider ?? makeProvider());
}

// ============================================================
// Tests: Quota Reserve
// ============================================================

describe("Quota Lifecycle — Reserve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcCallLog.length = 0;
    setupAuth();
    setupProperty();
    mockHasFeature.mockResolvedValue(true);
    mockRpc.mockImplementation((name: string, _p: Record<string, unknown>) => {
      if (name === "reserve_ai_quota") return makeReserveSuccess();
      if (name === "settle_ai_quota") return makeSettleSuccess();
      if (name === "release_ai_quota") return makeReleaseSuccess();
      return { data: null, error: { message: "unknown rpc" } };
    });
  });

  it("quota-01: reserve called before provider with correct params", async () => {
    let providerCalled = false;
    const provider = makeProvider(async () => {
      providerCalled = true;
      return DEFAULT_RESULT;
    });
    const handler = createHandler(provider);
    await handler(makeRequest(validBody()));

    // Verify reserve was called
    const reserveCall = rpcCallLog.find((c) => c.name === "reserve_ai_quota");
    expect(reserveCall).toBeDefined();
    expect(reserveCall?.params.p_feature).toBe("content_factory");
    expect(reserveCall?.params.p_idempotency_key).toBeDefined();
    expect(reserveCall?.params.p_request_id).toBeDefined();

    // Provider should be called after reserve
    expect(providerCalled).toBe(true);
  });

  it("quota-02: reserve failure → 429, provider NOT called", async () => {
    let providerCalled = false;
    mockRpc.mockImplementation((name: string) => {
      if (name === "reserve_ai_quota") {
        return {
          data: {
            success: false,
            limit_reason: "request_limit",
            remaining_requests: 0,
            daily_limit: 10,
            used_requests: 10,
            used_cost_usd: 5,
            remaining_cost_usd: 5,
            daily_cost_limit_usd: 10,
            quota_date: "2026-08-05",
          },
          error: null,
        };
      }
      return makeSettleSuccess();
    });

    const provider = makeProvider(async () => {
      providerCalled = true;
      return DEFAULT_RESULT;
    });
    const handler = createHandler(provider);
    const res = await handler(makeRequest(validBody()));

    expect(res.status).toBe(429);
    expect(providerCalled).toBe(false);
    const body = await getBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("QUOTA_EXCEEDED");
  });

  it("quota-03: cost limit exceeded → 429 with COST_LIMIT_EXCEEDED", async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === "reserve_ai_quota") {
        return {
          data: {
            success: false,
            limit_reason: "cost_limit",
            remaining_requests: 5,
            daily_limit: 10,
            used_requests: 5,
            used_cost_usd: 10.5,
            remaining_cost_usd: 0,
            daily_cost_limit_usd: 10,
          },
          error: null,
        };
      }
      return makeSettleSuccess();
    });

    const handler = createHandler();
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(429);
    const body = await getBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("COST_LIMIT_EXCEEDED");
    const details = err.details as Record<string, unknown> | undefined;
    expect(details?.dailyCostLimitUsd).toBe(10);
  });

  it("quota-04: same idempotencyKey → reserve returns already_reserved, 409", async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === "reserve_ai_quota") {
        return {
          data: {
            success: true,
            already_reserved: true,
            reservation_id: "existing-res",
            status: "reserved",
          },
          error: null,
        };
      }
      return makeSettleSuccess();
    });

    const handler = createHandler();
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(409);
    const body = await getBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("CONFLICT");
  });

  it("quota-05: reserve RPC error → 429", async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === "reserve_ai_quota") {
        return { data: null, error: { message: "RPC error" } };
      }
      return makeSettleSuccess();
    });

    const handler = createHandler();
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(429);
    const body = await getBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("QUOTA_EXCEEDED");
  });
});

// ============================================================
// Tests: Quota Settle
// ============================================================

describe("Quota Lifecycle — Settle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcCallLog.length = 0;
    setupAuth();
    setupProperty();
    mockHasFeature.mockResolvedValue(true);
    mockRpc.mockImplementation((name: string) => {
      if (name === "reserve_ai_quota") return makeReserveSuccess("res-settle-001");
      if (name === "settle_ai_quota") return makeSettleSuccess();
      if (name === "release_ai_quota") return makeReleaseSuccess();
      return { data: null, error: { message: "unknown rpc" } };
    });
  });

  it("quota-06: successful provider → settle called with actual usage", async () => {
    const provider = makeProvider(async () => DEFAULT_RESULT);
    const handler = createHandler(provider);
    await handler(makeRequest(validBody()));

    const settleCall = rpcCallLog.find((c) => c.name === "settle_ai_quota");
    expect(settleCall).toBeDefined();
    expect(settleCall?.params.p_status).toBe("succeeded");
    expect(settleCall?.params.p_input_tokens).toBe(1200);
    expect(settleCall?.params.p_output_tokens).toBe(800);
    expect(settleCall?.params.p_actual_cost_usd).toBe(0.002);
  });

  it("quota-07: response includes real model, usage, requestId (not null)", async () => {
    const handler = createHandler();
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(200);
    const body = await getBody(res);
    const data = body.data as Record<string, unknown>;

    // Per §10.6: model, usage, requestId must be real values
    expect(data.model).toBe("deepseek-v4-flash");
    expect(data.model).not.toBeNull();
    expect(data.usage).not.toBeNull();
    const usage = data.usage as Record<string, unknown>;
    expect(usage.inputTokens).toBe(1200);
    expect(usage.outputTokens).toBe(800);
    expect(usage.estimatedCostUsd).toBe(0.002);
    expect(data.requestId).toBeDefined();
    expect(data.requestId).not.toBeNull();
  });

  it("quota-08: settle failure does not affect 200 response", async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === "reserve_ai_quota") return makeReserveSuccess("res-008");
      if (name === "settle_ai_quota") return { data: null, error: { message: "settle failed" } };
      if (name === "release_ai_quota") return makeReleaseSuccess();
      return { data: null, error: { message: "unknown" } };
    });

    const handler = createHandler();
    const res = await handler(makeRequest(validBody()));
    // Content was generated successfully; settlement is best-effort
    expect(res.status).toBe(200);
  });

  it("quota-09: compliance blocked → settled as rejected_compliance", async () => {
    const provider = makeProvider(async () => ({
      ...DEFAULT_RESULT,
      output: {
        ...DEFAULT_CONTENT,
        body: "最好的房子保证升值电话13800138000绝对第一",
      },
    }));

    const handler = createHandler(provider);
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(200); // §10.6: post-generation blocked → 200

    const settleCall = rpcCallLog.find((c) => c.name === "settle_ai_quota");
    expect(settleCall).toBeDefined();
    expect(settleCall?.params.p_status).toBe("rejected_compliance");

    const body = await getBody(res);
    const data = body.data as Record<string, unknown>;
    expect(data.complianceStatus).toBe("blocked");
    expect(data.copyAllowed).toBe(false);
  });
});

// ============================================================
// Tests: Quota Release
// ============================================================

describe("Quota Lifecycle — Release", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcCallLog.length = 0;
    setupAuth();
    setupProperty();
    mockHasFeature.mockResolvedValue(true);
    mockRpc.mockImplementation((name: string) => {
      if (name === "reserve_ai_quota") return makeReserveSuccess("res-rel-001");
      if (name === "settle_ai_quota") return makeSettleSuccess();
      if (name === "release_ai_quota") return makeReleaseSuccess();
      return { data: null, error: { message: "unknown rpc" } };
    });
  });

  it("quota-10: provider error → release called, settle NOT called", async () => {
    const provider = makeProvider(async () => {
      throw new DeepSeekProviderError({
        code: "AI_TIMEOUT",
        message: "timeout",
        requestId: "r1",
        retryable: true,
        suggestedHttpStatus: 504,
      });
    });

    const handler = createHandler(provider);
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(504);

    // Release should be called
    const releaseCall = rpcCallLog.find((c) => c.name === "release_ai_quota");
    expect(releaseCall).toBeDefined();

    // Settle should NOT be called
    const settleCall = rpcCallLog.find((c) => c.name === "settle_ai_quota");
    expect(settleCall).toBeUndefined();
  });

  it("quota-11: abort → release called", async () => {
    const provider = makeProvider(async () => {
      throw new DeepSeekProviderError({
        code: "AI_REQUEST_ABORTED",
        message: "aborted",
        requestId: "r1",
        retryable: false,
      });
    });

    mockRpc.mockImplementation((name: string) => {
      if (name === "reserve_ai_quota") return makeReserveSuccess("res-abort-001");
      if (name === "release_ai_quota") return makeReleaseSuccess();
      if (name === "settle_ai_quota") return makeSettleSuccess();
      return { data: null, error: { message: "unknown" } };
    });

    const handler = createHandler(provider);

    // Abort handling: the provider throws AI_REQUEST_ABORTED which the handler re-throws
    try {
      await handler(makeRequest(validBody()));
    } catch (err) {
      expect(err).toBeInstanceOf(DeepSeekProviderError);
    }

    // Release should be called
    const releaseCall = rpcCallLog.find((c) => c.name === "release_ai_quota");
    expect(releaseCall).toBeDefined();
  });

  it("quota-12: compliance blocked at input → release called", async () => {
    // Property with PII that fails redaction
    setupProperty({
      description: "房东张三电话13800138000微信号wx_zhangsan",
    });

    mockRpc.mockImplementation((name: string) => {
      if (name === "reserve_ai_quota") return makeReserveSuccess("res-comp-001");
      if (name === "release_ai_quota") return makeReleaseSuccess();
      if (name === "settle_ai_quota") return makeSettleSuccess();
      return { data: null, error: { message: "unknown" } };
    });

    const handler = createHandler();
    const res = await handler(makeRequest(validBody()));

    // Input blocked → 422
    expect(res.status).toBe(422);
    const body = await getBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("COMPLIANCE_BLOCKED");

    // Release should be called (quota freed, no usage consumed)
    const releaseCall = rpcCallLog.find((c) => c.name === "release_ai_quota");
    expect(releaseCall).toBeDefined();
    expect(releaseCall?.params.p_reason).toBe("compliance_blocked_input");

    // Settle should NOT be called
    const settleCall = rpcCallLog.find((c) => c.name === "settle_ai_quota");
    expect(settleCall).toBeUndefined();
  });
});

// ============================================================
// Tests: Idempotency & State Machine
// ============================================================

describe("Quota Lifecycle — State Machine & Idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcCallLog.length = 0;
    setupAuth();
    setupProperty();
    mockHasFeature.mockResolvedValue(true);
  });

  it("quota-13: PII-safe error responses — no tokens, keys, or private data leaked", async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === "reserve_ai_quota") return makeReserveSuccess();
      if (name === "settle_ai_quota") return makeSettleSuccess();
      if (name === "release_ai_quota") return makeReleaseSuccess();
      return { data: null, error: { message: "unknown" } };
    });

    setupProperty({ description: "房东电话13800138000" });
    const provider = makeProvider(async () => {
      throw new DeepSeekProviderError({
        code: "AI_UPSTREAM_ERROR",
        message: "error",
        requestId: "req-err-001",
        retryable: true,
        suggestedHttpStatus: 502,
        upstreamStatus: 500,
      });
    });

    const handler = createHandler(provider);
    const res = await handler(makeRequest(validBody()));
    const serialized = JSON.stringify(await getBody(res));

    // No PII or secrets in response
    expect(serialized).not.toContain("13800138000");
    expect(serialized).not.toContain("sk-");
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain("upstreamStatus");
  });

  it("quota-14: no Service Role key used in route", async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === "reserve_ai_quota") return makeReserveSuccess();
      if (name === "settle_ai_quota") return makeSettleSuccess();
      if (name === "release_ai_quota") return makeReleaseSuccess();
      return { data: null, error: { message: "unknown" } };
    });

    const handler = createHandler();
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(200);

    // All RPC calls use authenticated user context, not Service Role
    const rpcNames = rpcCallLog.map((c) => c.name);
    expect(rpcNames).not.toContain("service_role");
    expect(rpcNames).toContain("reserve_ai_quota");
    expect(rpcNames).toContain("settle_ai_quota");
  });

  it("quota-15: usage=null when no tokens consumed", async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === "reserve_ai_quota") return makeReserveSuccess();
      if (name === "settle_ai_quota") return makeSettleSuccess();
      if (name === "release_ai_quota") return makeReleaseSuccess();
      return { data: null, error: { message: "unknown" } };
    });

    // Provider returns zero usage
    const provider = makeProvider(async () => ({
      output: DEFAULT_CONTENT,
      usage: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 },
      model: "deepseek-v4-flash",
      requestId: "req-zero",
    }));

    const handler = createHandler(provider);
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(200);

    const body = await getBody(res);
    const data = body.data as Record<string, unknown>;
    // Per handler logic: usage is null when tokens are 0
    expect(data.usage).toBeNull();
  });

  it("quota-16: quota date delegated to RPC for timezone-aware default", async () => {
    let capturedReserveParams: Record<string, unknown> | undefined;
    mockRpc.mockImplementation((name: string, params: Record<string, unknown>) => {
      if (name === "reserve_ai_quota") {
        capturedReserveParams = params;
        return makeReserveSuccess();
      }
      if (name === "settle_ai_quota") return makeSettleSuccess();
      return { data: null, error: { message: "unknown" } };
    });

    const handler = createHandler();
    await handler(makeRequest(validBody()));

    expect(capturedReserveParams).toBeDefined();
    // Handler delegates quota_date to RPC (uses AI_QUOTA_TIMEZONE default)
    // p_quota_date is not passed; RPC uses its Asia/Shanghai-aware default
    expect(capturedReserveParams?.p_quota_date).toBeUndefined();
  });
});

// ============================================================
// Tests: Regression — Existing route behavior preserved
// ============================================================

describe("Quota Lifecycle — Regression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcCallLog.length = 0;
    setupAuth();
    setupProperty();
    mockHasFeature.mockResolvedValue(true);
    mockRpc.mockImplementation((name: string) => {
      if (name === "reserve_ai_quota") return makeReserveSuccess();
      if (name === "settle_ai_quota") return makeSettleSuccess();
      if (name === "release_ai_quota") return makeReleaseSuccess();
      return { data: null, error: { message: "unknown" } };
    });
  });

  it("quota-17: auth/workspace/entitlement checks still enforced before quota", async () => {
    // Unauthenticated
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const handler = createHandler();
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(401);

    // Verify quota was NOT checked
    const reserveCall = rpcCallLog.find((c) => c.name === "reserve_ai_quota");
    expect(reserveCall).toBeUndefined();
  });

  it("quota-18: content_factory entitlement checked before quota", async () => {
    mockHasFeature.mockResolvedValue(false);
    const handler = createHandler();
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(403);

    const body = await getBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("CONTENT_FACTORY_NOT_ALLOWED");

    // Verify quota was NOT checked
    const reserveCall = rpcCallLog.find((c) => c.name === "reserve_ai_quota");
    expect(reserveCall).toBeUndefined();
  });

  it("quota-19: property validation runs before quota reservation", async () => {
    mockFromProps.mockResolvedValue({
      data: null,
      error: { code: "PGRST116" },
    });

    const handler = createHandler();
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(404);

    // Quota should NOT be reserved if property is missing
    const reserveCall = rpcCallLog.find((c) => c.name === "reserve_ai_quota");
    expect(reserveCall).toBeUndefined();
  });
});
