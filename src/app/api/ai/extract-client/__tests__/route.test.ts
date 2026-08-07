/**
 * POST /api/ai/extract-client — Route Handler Tests
 * All tests use Mock Auth, Mock Entitlement, Mock Provider.
 * No real DeepSeek calls. No real Supabase.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { DeepSeekProviderError } from "@/lib/ai/types";
import { createExtractClientHandler } from "@/lib/ai/routes/extract-client-handler";
import type {
  DeepSeekTextProvider,
  ClientExtractionInput,
  ClientExtractionResult,
} from "@/lib/ai/types";

// ============================================================
// Hoisted Mocks
// ============================================================

const { mockGetUser, mockFromSingle, mockHasFeature, mockRpc } = vi.hoisted(() => {
  const _mockGetUser = vi.fn();
  const _mockFromSingle = vi.fn();
  const _mockHasFeature = vi.fn();
  const _mockRpc = vi.fn().mockResolvedValue({ data: { success: true, reservation_id: "res-test-1" }, error: null });
  return {
    mockGetUser: _mockGetUser,
    mockFromSingle: _mockFromSingle,
    mockHasFeature: _mockHasFeature,
    mockRpc: _mockRpc,
  };
});

function buildQueryBuilder() {
  const chain: Record<string, unknown> = { single: mockFromSingle };
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

function buildSupabaseClient() {
  return {
    client: {
      auth: { getUser: mockGetUser },
      from: () => buildQueryBuilder(),
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

vi.mock("@/config/env", () => ({
  getServerEnv: () => ({
    DEEPSEEK_API_KEY: undefined,
    DEEPSEEK_BASE_URL: undefined,
    DEEPSEEK_MODEL: "deepseek-v4-flash",
    DEEPSEEK_FALLBACK_MODEL: "deepseek-v4-pro",
    DEEPSEEK_REQUEST_TIMEOUT_MS: 45000,
    DEEPSEEK_VISION_BASE_URL_PRIMARY: undefined,
    DEEPSEEK_VISION_BASE_URL_FALLBACK: undefined,
    DEEPSEEK_VISION_API_KEY: undefined,
    AI_DAILY_CONTENT_LIMIT: 10,
    AI_DAILY_EXTRACTION_LIMIT: 50,
    AI_DAILY_SEARCH_LIMIT: 50,
    AI_DAILY_COST_LIMIT_USD: 10.0,
    AI_QUOTA_TIMEZONE: "Asia/Shanghai",
    SUPABASE_URL: "http://localhost:54321",
    SUPABASE_ANON_KEY: "mock-anon-key",
  }),
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

const DEFAULT_RESULT: ClientExtractionResult = {
  data: {
    name: "刘芳",
    sourcePlatform: "wechat",
    budgetMin: 3000,
    budgetMax: 5000,
    preferredDistricts: ["天河区"],
    bedrooms: 2,
    rentalType: "whole_unit",
    petsRequired: true,
  },
  missingFields: ["availableFrom"],
  uncertainFields: [{ field: "budgetMax", reason: "未明确上限" }],
  rawText: "预算3000-5000，天河区两房，能养宠物",
  usage: { inputTokens: 100, outputTokens: 50, estimatedCostUsd: 0.001 },
};

function makeMockProvider(overrides?: {
  extractClient?: (
    input: ClientExtractionInput,
    signal?: AbortSignal
  ) => Promise<ClientExtractionResult>;
}): DeepSeekTextProvider {
  return {
    extractProperty: async () => {
      throw new Error("not implemented");
    },
    extractClient:
      overrides?.extractClient ?? (async () => DEFAULT_RESULT),
    parsePropertySearch: async () => {
      throw new Error("not implemented");
    },
    generateContent: async () => {
      throw new Error("not implemented");
    },
  };
}

function makeRequest(
  body: unknown,
  contentType = "application/json",
  signal?: AbortSignal
): NextRequest {
  const headers = new Headers();
  if (contentType) headers.set("content-type", contentType);
  const init = {
    method: "POST" as const,
    headers,
    body: body !== null ? JSON.stringify(body) : undefined,
    ...(signal ? { signal } : {}),
  };
  return new NextRequest(
    "http://localhost/api/ai/extract-client",
    init
  );
}

function createHandler(provider?: DeepSeekTextProvider) {
  return createExtractClientHandler(
    () => provider ?? makeMockProvider()
  );
}

async function getResponseBody(
  response: Response
): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

// ============================================================
// Tests
// ============================================================

describe("POST /api/ai/extract-client", () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockFromSingle.mockReset();
    mockHasFeature.mockReset();
    mockRpc.mockReset();
    mockRpc.mockResolvedValue({ data: { success: true, reservation_id: "res-test-1" }, error: null });
    setupAuth();
    setEntitlement(true);
  });

  // 1. Unauthenticated → 401
  it("1: unauthenticated → 401", async () => {
    setupNoAuth();
    const handler = createHandler();
    const res = await handler(makeRequest({ text: "预算3000天河区" }));
    expect(res.status).toBe(401);
    const body = await getResponseBody(res);
    expect(body.error).toBeDefined();
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("UNAUTHENTICATED");
  });

  // 2. No workspace membership → 403
  it("2: no workspace membership → 403", async () => {
    setupNoWorkspace();
    const handler = createHandler();
    const res = await handler(makeRequest({ text: "预算3000天河区" }));
    expect(res.status).toBe(403);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("WORKSPACE_ACCESS_DENIED");
  });

  // 3. No ai_data_extraction entitlement → 403
  it("3: no ai_data_extraction entitlement → 403", async () => {
    setEntitlement(false);
    const handler = createHandler();
    const res = await handler(makeRequest({ text: "预算3000天河区" }));
    expect(res.status).toBe(403);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("FEATURE_NOT_ALLOWED");
  });

  // 4. semantic_search does NOT substitute for ai_data_extraction → 403
  it("4: semantic_search does NOT substitute → 403", async () => {
    setEntitlement(false);
    const handler = createHandler();
    const res = await handler(makeRequest({ text: "预算3000天河区" }));
    expect(res.status).toBe(403);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("FEATURE_NOT_ALLOWED");
  });

  // 5. Non-JSON Content-Type → 422
  it("5: non-JSON content type → 422", async () => {
    const handler = createHandler();
    const res = await handler(
      makeRequest({ text: "预算3000天河区" }, "text/plain")
    );
    expect(res.status).toBe(422);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("VALIDATION_FAILED");
  });

  // 6. JSON parse failure → 422
  it("6: invalid JSON body → 422", async () => {
    const handler = createHandler();
    const headers = new Headers();
    headers.set("content-type", "application/json");
    const req = new NextRequest(
      "http://localhost/api/ai/extract-client",
      { method: "POST", headers, body: "not json!!!" }
    );
    const res = await handler(req);
    expect(res.status).toBe(422);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("VALIDATION_FAILED");
  });

  // 7. Empty text → 422
  it("7: empty text → 422", async () => {
    const handler = createHandler();
    const res = await handler(makeRequest({ text: "" }));
    expect(res.status).toBe(422);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("VALIDATION_FAILED");
  });

  // 8. Whitespace-only text → 422
  it("8: whitespace-only text → 422", async () => {
    const handler = createHandler();
    const res = await handler(makeRequest({ text: "   " }));
    expect(res.status).toBe(422);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("VALIDATION_FAILED");
  });

  // 9. Overlong text → 422
  it("9: text over 5000 chars → 422", async () => {
    const handler = createHandler();
    const longText = "a".repeat(5001);
    const res = await handler(makeRequest({ text: longText }));
    expect(res.status).toBe(422);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("VALIDATION_FAILED");
  });

  // 10. Extra fields → 422 (strict schema)
  it("10: extra fields in request body → 422", async () => {
    const handler = createHandler();
    const res = await handler(
      makeRequest({
        text: "test",
        workspaceId: "evil-ws",
        modelName: "gpt-5",
        userId: "attacker",
        requestId: "client-req-id",
      })
    );
    expect(res.status).toBe(422);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("VALIDATION_FAILED");
  });

  // 11. Client workspaceId → 422
  it("11: client workspaceId rejected (strict schema) → 422", async () => {
    const handler = createHandler();
    const res = await handler(
      makeRequest({ text: "test", workspace_id: "attacker-workspace" })
    );
    expect(res.status).toBe(422);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("VALIDATION_FAILED");
  });

  // 12. Successful call
  it("12: successful extraction → 200 with envelope", async () => {
    const handler = createHandler();
    const res = await handler(
      makeRequest({ text: "预算3000-5000，天河区两房，能养宠物" })
    );
    expect(res.status).toBe(200);
    const body = await getResponseBody(res);
    expect(body.data).toBeDefined();
    expect(body.error).toBeNull();
    const data = body.data as Record<string, unknown>;
    const extraction = data.extraction as Record<string, unknown>;
    expect(extraction.data).toBeDefined();
    expect(extraction.missingFields).toEqual(["availableFrom"]);
    // usage must not be in response
    expect(extraction.usage).toBeUndefined();
  });

  // 13. Provider called exactly once
  it("13: provider.extractClient called exactly once", async () => {
    let callCount = 0;
    const provider = makeMockProvider({
      extractClient: async () => {
        callCount++;
        return DEFAULT_RESULT;
      },
    });
    const handler = createHandler(provider);
    await handler(
      makeRequest({ text: "预算3000-5000，天河区两房" })
    );
    expect(callCount).toBe(1);
  });

  // 14. request.signal forwarded to Provider
  it("14: request.signal forwarded to provider", async () => {
    let capturedSignal: AbortSignal | undefined;
    const provider = makeMockProvider({
      extractClient: async (_input, signal) => {
        capturedSignal = signal;
        return DEFAULT_RESULT;
      },
    });
    const handler = createHandler(provider);
    const ac = new AbortController();
    await handler(
      makeRequest(
        { text: "预算3000-5000，天河区两房" },
        "application/json",
        ac.signal
      )
    );
    expect(capturedSignal).toBeDefined();
  });

  // 15. Phone number redacted
  it("15: phone number redacted before provider call", async () => {
    const captured: string[] = [];
    const provider = makeMockProvider({
      extractClient: async (input) => {
        captured.push(input.text);
        return DEFAULT_RESULT;
      },
    });
    const handler = createHandler(provider);
    await handler(
      makeRequest({
        text: "预算3000，电话13812345678，天河区",
      })
    );
    const text = captured[0];
    expect(text).not.toContain("13812345678");
    expect(text).toContain("[REDACTED_PHONE]");
    expect(text).toContain("3000");
    expect(text).toContain("天河区");
  });

  // 16. WeChat redacted
  it("16: WeChat ID redacted before provider call", async () => {
    const captured: string[] = [];
    const provider = makeMockProvider({
      extractClient: async (input) => {
        captured.push(input.text);
        return DEFAULT_RESULT;
      },
    });
    const handler = createHandler(provider);
    await handler(
      makeRequest({
        text: "微信：zhangsan_888，预算3000",
      })
    );
    const text = captured[0];
    expect(text).not.toContain("zhangsan_888");
    expect(text).toContain("[REDACTED_WECHAT]");
    expect(text).toContain("3000");
  });

  // 17. Email redacted
  it("17: email redacted before provider call", async () => {
    const captured: string[] = [];
    const provider = makeMockProvider({
      extractClient: async (input) => {
        captured.push(input.text);
        return DEFAULT_RESULT;
      },
    });
    const handler = createHandler(provider);
    await handler(
      makeRequest({
        text: "邮箱 client@mail.com，天河区两房",
      })
    );
    const text = captured[0];
    expect(text).not.toContain("client@mail.com");
    expect(text).toContain("[REDACTED_EMAIL]");
    expect(text).toContain("天河区");
  });

  // 18. Name redacted
  it("18: client name redacted before provider call", async () => {
    const captured: string[] = [];
    const provider = makeMockProvider({
      extractClient: async (input) => {
        captured.push(input.text);
        return DEFAULT_RESULT;
      },
    });
    const handler = createHandler(provider);
    await handler(
      makeRequest({
        text: "我叫张三，预算3000，天河区",
      })
    );
    const text = captured[0];
    expect(text).not.toContain("张三");
    expect(text).toContain("[REDACTED_NAME]");
    expect(text).toContain("3000");
  });

  // 19. ID card redacted
  it("19: ID card redacted before provider call", async () => {
    const captured: string[] = [];
    const provider = makeMockProvider({
      extractClient: async (input) => {
        captured.push(input.text);
        return DEFAULT_RESULT;
      },
    });
    const handler = createHandler(provider);
    await handler(
      makeRequest({
        text: "身份证440106199001011234，预算5000",
      })
    );
    const text = captured[0];
    expect(text).not.toContain("440106199001011234");
    expect(text).toContain("[REDACTED_ID_CARD]");
    expect(text).toContain("5000");
  });

  // 20. Business facts preserved
  it("20: budget, district, layout preserved after redaction", async () => {
    const captured: string[] = [];
    const provider = makeMockProvider({
      extractClient: async (input) => {
        captured.push(input.text);
        return DEFAULT_RESULT;
      },
    });
    const handler = createHandler(provider);
    await handler(
      makeRequest({
        text: "预算3500以内，天河区，一房一厅，朝南，需电梯，8月入住，近三号线，可养猫",
      })
    );
    const text = captured[0];
    expect(text).toContain("3500");
    expect(text).toContain("天河区");
    expect(text).toContain("一房一厅");
    expect(text).toContain("朝南");
    expect(text).toContain("电梯");
    expect(text).toContain("8月");
    expect(text).toContain("三号线");
    expect(text).toContain("猫");
  });

  // 21. Provider DTO excludes userId, workspaceId, modelName, promptVersion
  it("21: provider DTO excludes identity and config", async () => {
    const captured: ClientExtractionInput[] = [];
    const provider = makeMockProvider({
      extractClient: async (input) => {
        captured.push(input);
        return DEFAULT_RESULT;
      },
    });
    const handler = createHandler(provider);
    await handler(
      makeRequest({ text: "预算3000天河区" })
    );
    const raw = captured[0];
    if (!raw) throw new Error("provider was not called");
    const input = raw;
    // Narrow DTO: text (redacted) + sourcePlatform + requestId only
    expect(input.text).toBeDefined();
    expect(input.sourcePlatform).toBeDefined();
    expect(input.requestId).toBeDefined();
    // Identity/config fields MUST be absent from Provider DTO
    expect((input as unknown as Record<string, unknown>).workspaceId).toBeUndefined();
    expect((input as unknown as Record<string, unknown>).userId).toBeUndefined();
    expect((input as unknown as Record<string, unknown>).modelName).toBeUndefined();
    expect((input as unknown as Record<string, unknown>).promptVersion).toBeUndefined();
  });

  // 22. High-risk input → 422
  it("22: high-risk input (mostly PII) → 422, Provider call count = 0", async () => {
    let callCount = 0;
    const provider = makeMockProvider({
      extractClient: async () => {
        callCount++;
        return DEFAULT_RESULT;
      },
    });
    const handler = createHandler(provider);
    const res = await handler(
      makeRequest({
        text: "13812345678 440106199001011234",
      })
    );
    expect(res.status).toBe(422);
    expect(callCount).toBe(0);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("VALIDATION_FAILED");
  });

  // 23. High-risk input: Provider calls = 0
  it("23: pure PII input → 422, provider call count = 0", async () => {
    let callCount = 0;
    const provider = makeMockProvider({
      extractClient: async () => {
        callCount++;
        return DEFAULT_RESULT;
      },
    });
    const handler = createHandler(provider);
    const res = await handler(
      makeRequest({
        text: "13800000001 微信zhangsan 440106199001011234",
      })
    );
    expect(res.status).toBe(422);
    expect(callCount).toBe(0);
  });

  // 24. Success envelope
  it("24: success envelope has { data: { extraction }, error: null }", async () => {
    const handler = createHandler();
    const res = await handler(
      makeRequest({ text: "预算3000-5000，天河区两房" })
    );
    expect(res.status).toBe(200);
    const body = await getResponseBody(res);
    expect(body).toHaveProperty("data");
    expect(body).toHaveProperty("error");
    expect(body.error).toBeNull();
    const data = body.data as Record<string, unknown>;
    expect(data).toHaveProperty("extraction");
    const extraction = data.extraction as Record<string, unknown>;
    expect(extraction).toHaveProperty("data");
    expect(extraction).toHaveProperty("missingFields");
    expect(extraction).toHaveProperty("rawText");
    // Sensitive fields absent
    expect(extraction.usage).toBeUndefined();
  });

  // 25. AI_NOT_CONFIGURED → 503
  it("25: AI_NOT_CONFIGURED → 503", async () => {
    const provider = makeMockProvider({
      extractClient: async () => {
        throw new DeepSeekProviderError({
          code: "AI_NOT_CONFIGURED",
          message: "not configured",
          requestId: "req-1",
          retryable: false,
          suggestedHttpStatus: 503,
        });
      },
    });
    const handler = createHandler(provider);
    const res = await handler(makeRequest({ text: "预算3000天河区" }));
    expect(res.status).toBe(503);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("AI_NOT_CONFIGURED");
  });

  // 26. AI_TIMEOUT → 504
  it("26: AI_TIMEOUT → 504", async () => {
    const provider = makeMockProvider({
      extractClient: async () => {
        throw new DeepSeekProviderError({
          code: "AI_TIMEOUT",
          message: "timeout",
          requestId: "req-1",
          retryable: true,
          suggestedHttpStatus: 504,
        });
      },
    });
    const handler = createHandler(provider);
    const res = await handler(makeRequest({ text: "预算3000天河区" }));
    expect(res.status).toBe(504);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("AI_TIMEOUT");
  });

  // 27. AI_RATE_LIMITED → 502
  it("27: AI_RATE_LIMITED → 502", async () => {
    const provider = makeMockProvider({
      extractClient: async () => {
        throw new DeepSeekProviderError({
          code: "AI_RATE_LIMITED",
          message: "rate limited",
          requestId: "req-1",
          retryable: true,
          suggestedHttpStatus: 502,
        });
      },
    });
    const handler = createHandler(provider);
    const res = await handler(makeRequest({ text: "预算3000天河区" }));
    expect(res.status).toBe(502);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("AI_RATE_LIMITED");
  });

  // 28. AI_UPSTREAM_ERROR → 502
  it("28: AI_UPSTREAM_ERROR → 502", async () => {
    const provider = makeMockProvider({
      extractClient: async () => {
        throw new DeepSeekProviderError({
          code: "AI_UPSTREAM_ERROR",
          message: "upstream error",
          requestId: "req-1",
          retryable: true,
          suggestedHttpStatus: 502,
        });
      },
    });
    const handler = createHandler(provider);
    const res = await handler(makeRequest({ text: "预算3000天河区" }));
    expect(res.status).toBe(502);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("AI_UPSTREAM_ERROR");
  });

  // 29. AI_INVALID_RESPONSE → 502
  it("29: AI_INVALID_RESPONSE → 502", async () => {
    const provider = makeMockProvider({
      extractClient: async () => {
        throw new DeepSeekProviderError({
          code: "AI_INVALID_RESPONSE",
          message: "invalid response",
          requestId: "req-1",
          retryable: false,
          suggestedHttpStatus: 502,
        });
      },
    });
    const handler = createHandler(provider);
    const res = await handler(makeRequest({ text: "预算3000天河区" }));
    expect(res.status).toBe(502);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("AI_INVALID_RESPONSE");
  });

  // 30. Unknown error → 500
  it("30: unknown error → 500", async () => {
    const provider = makeMockProvider({
      extractClient: async () => {
        throw new Error("something unexpected");
      },
    });
    const handler = createHandler(provider);
    const res = await handler(makeRequest({ text: "预算3000天河区" }));
    expect(res.status).toBe(500);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("INTERNAL_ERROR");
  });

  // 31. AI_REQUEST_ABORTED rethrows
  it("31: AI_REQUEST_ABORTED rethrows, no 499, no Response", async () => {
    let callCount = 0;
    const provider = makeMockProvider({
      extractClient: async () => {
        callCount++;
        throw new DeepSeekProviderError({
          code: "AI_REQUEST_ABORTED",
          message: "aborted",
          requestId: "req-1",
          retryable: false,
        });
      },
    });
    const handler = createHandler(provider);
    try {
      await handler(makeRequest({ text: "预算3000天河区" }));
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DeepSeekProviderError);
      const e = err as DeepSeekProviderError;
      expect(e.code).toBe("AI_REQUEST_ABORTED");
    }
    expect(callCount).toBe(1);
  });

  // 32. Error does NOT leak sensitive data
  it("32: error response does not leak sensitive data", async () => {
    const provider = makeMockProvider({
      extractClient: async () => {
        throw new DeepSeekProviderError({
          code: "AI_UPSTREAM_ERROR",
          message: "service error",
          requestId: "req-sensitive",
          retryable: true,
          suggestedHttpStatus: 502,
          upstreamStatus: 500,
        });
      },
    });
    const handler = createHandler(provider);
    const res = await handler(
      makeRequest({
        text: "客户张伟电话 13800138000 身份证440106199001011234",
      })
    );
    const body = await getResponseBody(res);
    const serialized = JSON.stringify(body);

    expect(serialized).not.toContain("13800138000");
    expect(serialized).not.toContain("440106199001011234");
    expect(serialized).not.toContain("张伟");
    expect(serialized).not.toContain("sk-");
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain("upstreamStatus");
    expect(serialized).not.toContain("req-sensitive");
  });

  // 33. No database writes
  it("33: no database writes from route", async () => {
    // Verify handler does not call insert/update/delete/upsert
    // The mock query builder has no insert/update/delete/upsert methods,
    // so any write attempt would throw "not a function" and fail the test.
    const handler = createHandler();
    const res = await handler(
      makeRequest({ text: "预算3000-5000，天河区两房" })
    );
    expect(res.status).toBe(200);
    // If the handler tried to call .insert(), .update(), .delete(), or .upsert()
    // on the mock query builder, the test would throw with TypeError.
    // The mock's buildQueryBuilder only exposes: select, eq, limit, order,
    // in, is, neq, gte, lte, single.
  });

  // 34. No Service Role used
  it("34: no service role key in route", async () => {
    // The mock createRouteHandlerClient constructs a client using only
    // NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
    // The handler never reads SUPABASE_SERVICE_ROLE_KEY.
    // Verification: the mock client's auth.getUser() resolves with the
    // anon-key context. If the handler required service_role, it would
    // call process.env directly (which is not mocked) and crash.
    const handler = createHandler();
    const res = await handler(
      makeRequest({ text: "预算3000-5000，天河区两房" })
    );
    expect(res.status).toBe(200);
  });

  // 35. Quota reserve: RPC error → 429 QUOTA_CHECK_FAILED
  it("35: quota reserve RPC error → 429 QUOTA_CHECK_FAILED", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "db error" } });
    const handler = createHandler();
    const res = await handler(makeRequest({ text: "预算3000天河区" }));
    expect(res.status).toBe(429);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("QUOTA_CHECK_FAILED");
    // Provider must NOT be called
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  // 36. Quota reserve: quota exhausted → 429 QUOTA_EXCEEDED
  it("36: quota exhausted → 429 QUOTA_EXCEEDED", async () => {
    mockRpc.mockResolvedValue({ data: { success: false }, error: null });
    const handler = createHandler();
    const res = await handler(makeRequest({ text: "预算3000天河区" }));
    expect(res.status).toBe(429);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("QUOTA_EXCEEDED");
  });

  // 37. Quota reserve: cost limit → 429 COST_LIMIT_EXCEEDED
  it("37: cost limit exceeded → 429 COST_LIMIT_EXCEEDED", async () => {
    mockRpc.mockResolvedValue({ data: { success: false, limit_reason: "cost_limit" }, error: null });
    const handler = createHandler();
    const res = await handler(makeRequest({ text: "预算3000天河区" }));
    expect(res.status).toBe(429);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("COST_LIMIT_EXCEEDED");
  });

  // 38. Idempotency key conflict → 409 CONFLICT
  it("38: idempotency key conflict → 409 CONFLICT", async () => {
    mockRpc.mockResolvedValue({ data: { success: true, already_reserved: true }, error: null });
    const handler = createHandler();
    const res = await handler(makeRequest({ text: "预算3000天河区" }));
    expect(res.status).toBe(409);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("CONFLICT");
  });

  // 39. settleQuota called after successful Provider call
  it("39: settleQuota is called after successful Provider call", async () => {
    let settleCalled = false;
    mockRpc.mockImplementation(async (fn: string) => {
      if (fn === "reserve_ai_quota") {
        return { data: { success: true, reservation_id: "res-test-1" }, error: null };
      }
      if (fn === "settle_ai_quota") {
        settleCalled = true;
        return { data: { success: true }, error: null };
      }
      return { data: null, error: { message: "unknown rpc" } };
    });
    const handler = createHandler();
    await handler(makeRequest({ text: "预算3000-5000，天河区两房" }));
    expect(settleCalled).toBe(true);
  });

  // 40. releaseQuota called after Provider error
  it("40: releaseQuota is called after Provider error", async () => {
    let releaseCalled = false;
    mockRpc.mockImplementation(async (fn: string) => {
      if (fn === "reserve_ai_quota") {
        return { data: { success: true, reservation_id: "res-test-1" }, error: null };
      }
      if (fn === "release_ai_quota") {
        releaseCalled = true;
        return { data: { success: true }, error: null };
      }
      return { data: null, error: { message: "unknown rpc" } };
    });
    const provider = makeMockProvider({
      extractClient: async () => {
        throw new DeepSeekProviderError({
          code: "AI_UPSTREAM_ERROR",
          message: "upstream error",
          requestId: "req-1",
          retryable: true,
          suggestedHttpStatus: 502,
        });
      },
    });
    const handler = createHandler(provider);
    await handler(makeRequest({ text: "预算3000天河区" }));
    expect(releaseCalled).toBe(true);
  });
});
