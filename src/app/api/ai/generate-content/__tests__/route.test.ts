/**
 * POST /api/ai/generate-content — Route Handler Tests
 * Contract: api-contract.md §10.6 (Path A — full pipeline alignment)
 * All tests use Mock Auth, Mock Entitlement, Mock Provider, Mock DB.
 * No real DeepSeek calls. No real Supabase.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { DeepSeekProviderError } from "@/lib/ai/types";
import { createGenerateContentHandler } from "@/lib/ai/routes/generate-content-handler";
import type {
  DeepSeekTextProvider,
  ContentGenerationInput,
  GeneratedContent,
} from "@/lib/ai/types";

// ============================================================
// Hoisted Mocks
// ============================================================

const { mockGetUser, mockFromSingle, mockFromProps, mockRpc, mockHasFeature } =
  vi.hoisted(() => {
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

function buildQueryBuilder(isPropertyQuery = false) {
  const chain: Record<string, unknown> = {
    single: isPropertyQuery ? mockFromProps : mockFromSingle,
  };
  const returnThis = () => chain;
  Object.assign(chain, {
    select: returnThis,
    eq: returnThis,
    limit: returnThis,
    order: returnThis,
    in: returnThis,
    is: returnThis,
    neq: returnThis,
    gte: returnThis,
    lte: returnThis,
  });
  return chain;
}

let fromCallCount = 0;
function buildSupabaseClient() {
  fromCallCount = 0;
  return {
    client: {
      auth: { getUser: mockGetUser },
      from: (table: string) => {
        fromCallCount++;
        return buildQueryBuilder(table === "properties");
      },
      rpc: mockRpc,
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

// ============================================================
// Helpers
// ============================================================

function setupAuth(overrides?: { userId?: string; workspaceId?: string }) {
  mockGetUser.mockResolvedValue({
    data: {
      user: overrides?.userId
        ? { id: overrides.userId, email: "test@test.com" }
        : { id: "user-1", email: "test@test.com" },
    },
  });
  mockFromSingle.mockResolvedValue({
    data: overrides?.workspaceId
      ? { workspace_id: overrides.workspaceId }
      : { workspace_id: "ws-1" },
    error: null,
  });
}

function setupNoAuth() {
  mockGetUser.mockResolvedValue({ data: { user: null } });
}

function setupNoWorkspace() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: "user-1", email: "test@test.com" } },
  });
  mockFromSingle.mockResolvedValue({
    data: null,
    error: { code: "PGRST116" },
  });
}

function setEntitlement(has: boolean) {
  mockHasFeature.mockResolvedValue(has);
}

const DB_PROPERTY = {
  id: "prop-001",
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
};

function setupProperty(overrides?: Record<string, unknown>) {
  mockFromProps.mockResolvedValue({
    data: { ...DB_PROPERTY, ...overrides },
    error: null,
  });
}

function setupPropertyMissing() {
  mockFromProps.mockResolvedValue({
    data: null,
    error: { code: "PGRST116" },
  });
}

function setupMarketingReuseBlocked() {
  mockFromProps.mockResolvedValue({
    data: { ...DB_PROPERTY, workspace_id: "other-ws", is_shared: false, allow_marketing_reuse: false },
    error: null,
  });
}

const DEFAULT_RESULT: GeneratedContent = {
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

function makeMockProvider(overrides?: {
  generateContent?: (
    input: ContentGenerationInput,
    signal?: AbortSignal
  ) => Promise<GeneratedContent>;
}): DeepSeekTextProvider {
  return {
    extractProperty: async () => { throw new Error("not implemented"); },
    extractClient: async () => { throw new Error("not implemented"); },
    parsePropertySearch: async () => { throw new Error("not implemented"); },
    generateContent: overrides?.generateContent ?? (async () => DEFAULT_RESULT),
  };
}

function makeRequest(
  body: unknown,
  contentType = "application/json",
  signal?: AbortSignal
): NextRequest {
  const headers = new Headers();
  if (contentType) headers.set("content-type", contentType);
  return new NextRequest("http://localhost/api/ai/generate-content", {
    method: "POST",
    headers,
    body: body !== null ? JSON.stringify(body) : undefined,
    ...(signal ? { signal } : {}),
  });
}

function validBody(overrides?: Record<string, unknown>) {
  return {
    propertyId: "00000000-0000-0000-0000-000000000001",
    platform: "xiaohongshu",
    idempotencyKey: "idem-test-001",
    ...overrides,
  };
}

function createHandler(provider?: DeepSeekTextProvider) {
  return createGenerateContentHandler(() => provider ?? makeMockProvider());
}

async function getResponseBody(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

// ============================================================
// Tests
// ============================================================

describe("POST /api/ai/generate-content", () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockFromSingle.mockReset();
    mockFromProps.mockReset();
    mockRpc.mockReset();
    mockHasFeature.mockReset();
    setupAuth();
    setEntitlement(true);
    setupProperty();
    mockRpc.mockResolvedValue({ data: { success: true }, error: null });
  });

  // 1. Unauthenticated → 401
  it("1: unauthenticated → 401", async () => {
    setupNoAuth();
    const handler = createHandler();
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(401);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("UNAUTHENTICATED");
  });

  // 2. No workspace → 403
  it("2: no workspace membership → 403", async () => {
    setupNoWorkspace();
    const handler = createHandler();
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(403);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("WORKSPACE_ACCESS_DENIED");
  });

  // 3. No content_factory → 403
  it("3: no content_factory entitlement → 403", async () => {
    setEntitlement(false);
    const handler = createHandler();
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(403);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("CONTENT_FACTORY_NOT_ALLOWED");
  });

  // 4. ai_data_extraction does NOT substitute
  it("4: ai_data_extraction does NOT substitute → 403", async () => {
    setEntitlement(false);
    const handler = createHandler();
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(403);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("CONTENT_FACTORY_NOT_ALLOWED");
  });

  // 5. Entitlement denied → Provider call = 0
  it("5: entitlement denied → provider not called", async () => {
    let callCount = 0;
    setEntitlement(false);
    const provider = makeMockProvider({
      generateContent: async () => { callCount++; return DEFAULT_RESULT; },
    });
    const handler = createHandler(provider);
    await handler(makeRequest(validBody()));
    expect(callCount).toBe(0);
  });

  // 6. Non-JSON → 422
  it("6: non-JSON content type → 422", async () => {
    const handler = createHandler();
    const res = await handler(makeRequest(validBody(), "text/plain"));
    expect(res.status).toBe(422);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("VALIDATION_FAILED");
  });

  // 7. JSON parse failure → 422
  it("7: invalid JSON body → 422", async () => {
    const handler = createHandler();
    const headers = new Headers();
    headers.set("content-type", "application/json");
    const req = new NextRequest("http://localhost/api/ai/generate-content", {
      method: "POST", headers, body: "not json!!!",
    });
    const res = await handler(req);
    expect(res.status).toBe(422);
  });

  // 8. Empty request → 422
  it("8: empty body → 422", async () => {
    const handler = createHandler();
    const res = await handler(makeRequest({}));
    expect(res.status).toBe(422);
  });

  // 9. Missing propertyId → 422
  it("9: missing propertyId → 422", async () => {
    const handler = createHandler();
    const res = await handler(makeRequest({ platform: "xiaohongshu", idempotencyKey: "key-1" }));
    expect(res.status).toBe(422);
  });

  // 9a. Missing idempotencyKey → 422
  it("9a: missing idempotencyKey → 422", async () => {
    const handler = createHandler();
    const res = await handler(makeRequest(validBody({ idempotencyKey: undefined })));
    expect(res.status).toBe(422);
  });

  // 10. Invalid platform enum → 422
  it("10: invalid platform enum → 422", async () => {
    const handler = createHandler();
    const res = await handler(makeRequest(validBody({ platform: "facebook" })));
    expect(res.status).toBe(422);
  });

  // 11. Extra fields → 422 (strict)
  it("11: extra fields rejected → 422", async () => {
    const handler = createHandler();
    const res = await handler(
      makeRequest(validBody({ workspaceId: "evil", userId: "attacker", requestId: "bad", modelName: "gpt-5" }))
    );
    expect(res.status).toBe(422);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("VALIDATION_FAILED");
  });

  // 12. Client identity fields + inline propertyFacts rejected
  it("12: client identity/config fields rejected → 422", async () => {
    const handler = createHandler();
    const res = await handler(
      makeRequest(validBody({ userId: "evil", requestId: "bad", propertyFacts: { title: "fake" } }))
    );
    expect(res.status).toBe(422);
  });

  // 13. Property not found → 404
  it("13: property not found → 404", async () => {
    setupPropertyMissing();
    const handler = createHandler();
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(404);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("RESOURCE_NOT_FOUND");
  });

  // 14. Marketing reuse denied → 403
  it("14: marketing reuse not authorized → 403", async () => {
    setupMarketingReuseBlocked();
    const handler = createHandler();
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(403);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("PROPERTY_NOT_MARKETING_REUSABLE");
  });

  // 15. Quota exceeded → 429
  it("15: quota exceeded → 429, provider call=0", async () => {
    let callCount = 0;
    mockRpc.mockResolvedValue({ data: null, error: { code: "QUOTA", message: "exceeded" } });
    const provider = makeMockProvider({
      generateContent: async () => { callCount++; return DEFAULT_RESULT; },
    });
    const handler = createHandler(provider);
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(429);
    expect(callCount).toBe(0);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("QUOTA_EXCEEDED");
  });

  // 16. Successful generation → 200 with §10.6 envelope
  it("16: successful generation → 200 with full envelope", async () => {
    const handler = createHandler();
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(200);
    const body = await getResponseBody(res);
    expect(body.data).toBeDefined();
    expect(body.error).toBeNull();
    const data = body.data as Record<string, unknown>;
    expect(data).toHaveProperty("contentVersionId");
    expect(data).toHaveProperty("platform");
    expect(data).toHaveProperty("output");
    expect(data).toHaveProperty("copyAllowed");
    expect(data).toHaveProperty("complianceStatus");
    expect(data).toHaveProperty("model");
    expect(data).toHaveProperty("usage");
    expect(data).toHaveProperty("requestId");
  });

  // 17. Provider called exactly once
  it("17: provider called exactly once", async () => {
    let callCount = 0;
    const provider = makeMockProvider({
      generateContent: async () => { callCount++; return DEFAULT_RESULT; },
    });
    const handler = createHandler(provider);
    await handler(makeRequest(validBody()));
    expect(callCount).toBe(1);
  });

  // 18. Signal forwarded
  it("18: request.signal forwarded", async () => {
    let capturedSignal: AbortSignal | undefined;
    const provider = makeMockProvider({
      generateContent: async (_input, signal) => { capturedSignal = signal; return DEFAULT_RESULT; },
    });
    const handler = createHandler(provider);
    const ac = new AbortController();
    await handler(makeRequest(validBody(), "application/json", ac.signal));
    expect(capturedSignal).toBeDefined();
  });

  // 19. Provider DTO loaded from DB property (not client facts)
  it("19: provider DTO loaded from DB property", async () => {
    const captured: ContentGenerationInput[] = [];
    const provider = makeMockProvider({
      generateContent: async (input) => { captured.push(input); return DEFAULT_RESULT; },
    });
    const handler = createHandler(provider);
    await handler(makeRequest(validBody()));
    const raw = captured[0];
    if (!raw) throw new Error("provider not called");
    expect(raw.platform).toBe("xiaohongshu");
    expect(raw.propertyFacts.district).toBe("天河区");
    expect(raw.propertyFacts.monthlyRent).toBe(3500);
    expect(raw.propertyFacts.title).toBe("天河温馨一房");
  });

  // 20. DTO description redacted
  it("20: DB-loaded description redacted, PII stripped", async () => {
    setupProperty({ description: "房东张三电话13800138000，精装修近地铁" });
    const captured: ContentGenerationInput[] = [];
    const provider = makeMockProvider({
      generateContent: async (input) => { captured.push(input); return DEFAULT_RESULT; },
    });
    const handler = createHandler(provider);
    await handler(makeRequest(validBody()));
    const raw = captured[0];
    if (!raw) throw new Error("provider not called");
    const desc = raw.propertyFacts.description;
    if (!desc) throw new Error("description missing");
    expect(desc).not.toContain("13800138000");
    expect(desc).not.toContain("张三");
    expect(desc).toContain("[REDACTED_PHONE]");
    expect(desc).toContain("[REDACTED_NAME]");
    expect(desc).toContain("精装修");
    expect(desc).toContain("近地铁");
  });

  // 21. output shape and types
  it("21: output has factualSummary, requiresFactReview, array types", async () => {
    const handler = createHandler();
    const res = await handler(makeRequest(validBody()));
    const body = await getResponseBody(res);
    const data = body.data as Record<string, unknown>;
    const output = data.output as Record<string, unknown>;
    expect(output.factualSummary).toBeDefined();
    expect(typeof output.requiresFactReview).toBe("boolean");
    expect(Array.isArray(output.factsUsed)).toBe(true);
    expect(Array.isArray(output.riskFlags)).toBe(true);
    expect(Array.isArray(output.complianceFlags)).toBe(true);
  });

  // 22. copyAllowed reflects requiresFactReview
  it("22: requiresFactReview=true → copyAllowed=false", async () => {
    const provider = makeMockProvider({
      generateContent: async () => ({ ...DEFAULT_RESULT, requiresFactReview: true }),
    });
    const handler = createHandler(provider);
    const res = await handler(makeRequest(validBody()));
    const data = (await getResponseBody(res)).data as Record<string, unknown>;
    expect(data.copyAllowed).toBe(false);
    expect(data.complianceStatus).toBe("pending");
  });

  // 23. AI_NOT_CONFIGURED → 503
  it("23: AI_NOT_CONFIGURED → 503", async () => {
    const provider = makeMockProvider({
      generateContent: async () => {
        throw new DeepSeekProviderError({ code: "AI_NOT_CONFIGURED", message: "n/a", requestId: "r1", retryable: false, suggestedHttpStatus: 503 });
      },
    });
    const handler = createHandler(provider);
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(503);
  });

  // 24. AI_TIMEOUT → 504
  it("24: AI_TIMEOUT → 504", async () => {
    const provider = makeMockProvider({
      generateContent: async () => {
        throw new DeepSeekProviderError({ code: "AI_TIMEOUT", message: "t/o", requestId: "r1", retryable: true, suggestedHttpStatus: 504 });
      },
    });
    const handler = createHandler(provider);
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(504);
  });

  // 25. AI_RATE_LIMITED → 502
  it("25: AI_RATE_LIMITED → 502", async () => {
    const provider = makeMockProvider({
      generateContent: async () => {
        throw new DeepSeekProviderError({ code: "AI_RATE_LIMITED", message: "rl", requestId: "r1", retryable: true, suggestedHttpStatus: 502 });
      },
    });
    const handler = createHandler(provider);
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(502);
  });

  // 26. AI_UPSTREAM_ERROR → 502
  it("26: AI_UPSTREAM_ERROR → 502", async () => {
    const provider = makeMockProvider({
      generateContent: async () => {
        throw new DeepSeekProviderError({ code: "AI_UPSTREAM_ERROR", message: "ue", requestId: "r1", retryable: true, suggestedHttpStatus: 502 });
      },
    });
    const handler = createHandler(provider);
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(502);
  });

  // 27. AI_INVALID_RESPONSE → 502
  it("27: AI_INVALID_RESPONSE → 502", async () => {
    const provider = makeMockProvider({
      generateContent: async () => {
        throw new DeepSeekProviderError({ code: "AI_INVALID_RESPONSE", message: "ir", requestId: "r1", retryable: false, suggestedHttpStatus: 502 });
      },
    });
    const handler = createHandler(provider);
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(502);
  });

  // 28. Unknown → 500
  it("28: unknown error → 500", async () => {
    const provider = makeMockProvider({
      generateContent: async () => { throw new Error("boom"); },
    });
    const handler = createHandler(provider);
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(500);
  });

  // 29. Abort rethrows
  it("29: AI_REQUEST_ABORTED rethrows", async () => {
    let callCount = 0;
    const provider = makeMockProvider({
      generateContent: async () => {
        callCount++;
        throw new DeepSeekProviderError({ code: "AI_REQUEST_ABORTED", message: "aborted", requestId: "r1", retryable: false });
      },
    });
    const handler = createHandler(provider);
    try {
      await handler(makeRequest(validBody()));
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DeepSeekProviderError);
    }
    expect(callCount).toBe(1);
  });

  // 30. Error no PII leak
  it("30: error response no PII leak", async () => {
    setupProperty({ description: "房东电话13800138000" });
    const provider = makeMockProvider({
      generateContent: async () => {
        throw new DeepSeekProviderError({ code: "AI_UPSTREAM_ERROR", message: "err", requestId: "req-s", retryable: true, suggestedHttpStatus: 502, upstreamStatus: 500 });
      },
    });
    const handler = createHandler(provider);
    const res = await handler(makeRequest(validBody()));
    const serialized = JSON.stringify(await getResponseBody(res));
    expect(serialized).not.toContain("13800138000");
    expect(serialized).not.toContain("sk-");
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain("upstreamStatus");
  });

  // 31. No Service Role
  it("31: no service role key in route", async () => {
    const handler = createHandler();
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(200);
  });
});
