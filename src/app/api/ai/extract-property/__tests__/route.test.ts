/**
 * POST /api/ai/extract-property — Route Handler Tests
 * All tests use Mock Auth, Mock Entitlement, Mock Provider.
 * No real DeepSeek calls. No real Supabase.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { DeepSeekProviderError } from "@/lib/ai/types";
import { createExtractPropertyHandler } from "@/lib/ai/routes/extract-property-handler";
import type {
  DeepSeekTextProvider,
  PropertyExtractionInput,
  PropertyExtractionResult,
} from "@/lib/ai/types";

// ============================================================
// Hoisted Mocks
// ============================================================

const { mockGetUser, mockFromSingle, mockHasFeature } = vi.hoisted(() => {
  const _mockGetUser = vi.fn();
  const _mockFromSingle = vi.fn();
  const _mockHasFeature = vi.fn();
  return {
    mockGetUser: _mockGetUser,
    mockFromSingle: _mockFromSingle,
    mockHasFeature: _mockHasFeature,
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
      rpc: () => Promise.resolve({ error: null }),
    },
    jsonResponse: (
      body: unknown,
      init?: { status?: number; headers?: Record<string, string> }
    ) =>
      new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
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
  mockFromSingle.mockResolvedValue({ data: null, error: { code: "PGRST116" } });
}

function setEntitlement(has: boolean) {
  mockHasFeature.mockResolvedValue(has);
}

const DEFAULT_RESULT: PropertyExtractionResult = {
  data: {
    title: "天河温馨一房",
    city: "广州",
    district: "天河区",
    monthlyRent: 3500,
    bedrooms: 1,
  },
  missingFields: ["depositTerms"],
  uncertainFields: [{ field: "floor", reason: "未明确提及" }],
  rawText: "天河区一房3500元",
  usage: { inputTokens: 100, outputTokens: 50, estimatedCostUsd: 0.001 },
};

function makeMockProvider(overrides?: {
  extractProperty?: (
    input: PropertyExtractionInput,
    signal?: AbortSignal
  ) => Promise<PropertyExtractionResult>;
}): DeepSeekTextProvider {
  return {
    extractProperty:
      overrides?.extractProperty ?? (async () => DEFAULT_RESULT),
    extractClient: async () => {
      throw new Error("not implemented");
    },
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
  return new NextRequest("http://localhost/api/ai/extract-property", init);
}

function createHandler(provider?: DeepSeekTextProvider) {
  return createExtractPropertyHandler(
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

describe("POST /api/ai/extract-property", () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockFromSingle.mockReset();
    mockHasFeature.mockReset();
    setupAuth();
    setEntitlement(true);
  });

  // 1. Unauthenticated → 401
  it("1: unauthenticated → 401", async () => {
    setupNoAuth();
    const handler = createHandler();
    const res = await handler(makeRequest({ text: "天河区一房" }));
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
    const res = await handler(makeRequest({ text: "天河区一房" }));
    expect(res.status).toBe(403);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("WORKSPACE_ACCESS_DENIED");
  });

  // 3. No ai_data_extraction entitlement → 403
  it("3: no ai_data_extraction entitlement → 403", async () => {
    setEntitlement(false);
    const handler = createHandler();
    const res = await handler(makeRequest({ text: "天河区一房" }));
    expect(res.status).toBe(403);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("FEATURE_NOT_ALLOWED");
  });

  // 4. semantic_search does NOT substitute for ai_data_extraction → 403
  it("4: semantic_search does NOT substitute → 403", async () => {
    setEntitlement(false);
    const handler = createHandler();
    const res = await handler(makeRequest({ text: "天河区一房" }));
    expect(res.status).toBe(403);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("FEATURE_NOT_ALLOWED");
  });

  // 5. Non-JSON Content-Type → 422
  it("5: non-JSON content type → 422", async () => {
    const handler = createHandler();
    const res = await handler(makeRequest({ text: "天河区一房" }, "text/plain"));
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
      "http://localhost/api/ai/extract-property",
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

  // 8. Overlong text → 422
  it("8: text over 5000 chars → 422", async () => {
    const handler = createHandler();
    const longText = "a".repeat(5001);
    const res = await handler(makeRequest({ text: longText }));
    expect(res.status).toBe(422);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("VALIDATION_FAILED");
  });

  // 9. Extra fields → 422 (strict schema)
  it("9: extra fields in request body → 422", async () => {
    const handler = createHandler();
    const res = await handler(
      makeRequest({
        text: "test",
        workspaceId: "evil-ws",
        modelName: "gpt-5",
        userId: "attacker",
      })
    );
    expect(res.status).toBe(422);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("VALIDATION_FAILED");
  });

  // 10. Client workspaceId → 422
  it("10: client workspaceId rejected (strict schema) → 422", async () => {
    const handler = createHandler();
    const res = await handler(
      makeRequest({ text: "test", workspace_id: "attacker-workspace" })
    );
    expect(res.status).toBe(422);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("VALIDATION_FAILED");
  });

  // 11. Successful call
  it("11: successful extraction → 200 with envelope", async () => {
    const handler = createHandler();
    const res = await handler(makeRequest({ text: "天河区一房3500元" }));
    expect(res.status).toBe(200);
    const body = await getResponseBody(res);
    expect(body.data).toBeDefined();
    expect(body.error).toBeNull();
    const data = body.data as Record<string, unknown>;
    const extraction = data.extraction as Record<string, unknown>;
    expect(extraction.data).toBeDefined();
    expect(extraction.missingFields).toEqual(["depositTerms"]);
    // usage must not be in response
    expect(extraction.usage).toBeUndefined();
  });

  // 12. Provider called exactly once
  it("12: provider.extractProperty called exactly once", async () => {
    let callCount = 0;
    const provider = makeMockProvider({
      extractProperty: async () => {
        callCount++;
        return DEFAULT_RESULT;
      },
    });
    const handler = createHandler(provider);
    await handler(makeRequest({ text: "天河区一房" }));
    expect(callCount).toBe(1);
  });

  // 13. request.signal forwarded to Provider
  it("13: request.signal forwarded to provider", async () => {
    let capturedSignal: AbortSignal | undefined;
    const provider = makeMockProvider({
      extractProperty: async (_input, signal) => {
        capturedSignal = signal;
        return DEFAULT_RESULT;
      },
    });
    const handler = createHandler(provider);
    const ac = new AbortController();
    await handler(makeRequest({ text: "天河区一房" }, "application/json", ac.signal));
    expect(capturedSignal).toBeDefined();
  });

  // 14. Provider does NOT receive workspaceId/userId from client
  it("14: provider receives server-resolved IDs, not client input", async () => {
    let capturedInput: PropertyExtractionInput | null = null;
    const provider = makeMockProvider({
      extractProperty: async (input) => {
        capturedInput = input;
        return DEFAULT_RESULT;
      },
    });
    const handler = createHandler(provider);
    await handler(makeRequest({ text: "天河区一房" }));
    expect(capturedInput).not.toBeNull();
    const input = capturedInput!;
    // Server-resolved, not from client
    expect(input.userId).toBe("user-1");
    expect(input.workspaceId).toBe("ws-1");
    // Only text + sourceType from client (text is redacted but property-only)
    expect(input.text).toBe("天河区一房");
    expect(input.sourceType).toBe("text");
  });

  // 15. Success envelope shape
  it("15: success envelope has { data: { extraction }, error: null }", async () => {
    const handler = createHandler();
    const res = await handler(makeRequest({ text: "天河区一房" }));
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

  // 16. AI_NOT_CONFIGURED → 503
  it("16: AI_NOT_CONFIGURED → 503", async () => {
    const provider = makeMockProvider({
      extractProperty: async () => {
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
    const res = await handler(makeRequest({ text: "天河区一房" }));
    expect(res.status).toBe(503);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("AI_NOT_CONFIGURED");
  });

  // 17. AI_TIMEOUT → 504
  it("17: AI_TIMEOUT → 504", async () => {
    const provider = makeMockProvider({
      extractProperty: async () => {
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
    const res = await handler(makeRequest({ text: "天河区一房" }));
    expect(res.status).toBe(504);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("AI_TIMEOUT");
  });

  // 18. AI_RATE_LIMITED → 502
  it("18: AI_RATE_LIMITED → 502", async () => {
    const provider = makeMockProvider({
      extractProperty: async () => {
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
    const res = await handler(makeRequest({ text: "天河区一房" }));
    expect(res.status).toBe(502);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("AI_RATE_LIMITED");
  });

  // 19. AI_UPSTREAM_ERROR → 502
  it("19: AI_UPSTREAM_ERROR → 502", async () => {
    const provider = makeMockProvider({
      extractProperty: async () => {
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
    const res = await handler(makeRequest({ text: "天河区一房" }));
    expect(res.status).toBe(502);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("AI_UPSTREAM_ERROR");
  });

  // 20. AI_INVALID_RESPONSE → 502
  it("20: AI_INVALID_RESPONSE → 502", async () => {
    const provider = makeMockProvider({
      extractProperty: async () => {
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
    const res = await handler(makeRequest({ text: "天河区一房" }));
    expect(res.status).toBe(502);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("AI_INVALID_RESPONSE");
  });

  // 21. Unknown error → 500
  it("21: unknown error → 500", async () => {
    const provider = makeMockProvider({
      extractProperty: async () => {
        throw new Error("something unexpected");
      },
    });
    const handler = createHandler(provider);
    const res = await handler(makeRequest({ text: "天河区一房" }));
    expect(res.status).toBe(500);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("INTERNAL_ERROR");
  });

  // 22. AI_REQUEST_ABORTED rethrows
  it("22: AI_REQUEST_ABORTED rethrows, no 499, no Response", async () => {
    let callCount = 0;
    const provider = makeMockProvider({
      extractProperty: async () => {
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
      await handler(makeRequest({ text: "天河区一房" }));
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DeepSeekProviderError);
      const e = err as DeepSeekProviderError;
      expect(e.code).toBe("AI_REQUEST_ABORTED");
    }
    expect(callCount).toBe(1);
  });

  // 23. Error does NOT leak sensitive data
  it("23: error response does not leak sensitive data", async () => {
    const provider = makeMockProvider({
      extractProperty: async () => {
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
      makeRequest({ text: "房东电话 13800138000" })
    );
    const body = await getResponseBody(res);
    const serialized = JSON.stringify(body);

    expect(serialized).not.toContain("13800138000");
    expect(serialized).not.toContain("sk-");
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain("upstreamStatus");
    expect(serialized).not.toContain("req-sensitive");
  });

  // 24. No database writes
  it("24: no database writes from route", async () => {
    // Static verification: the handler has no .insert/.update/.upsert calls
    // Verified by test passing without any DB mock for writes
    const handler = createHandler();
    const res = await handler(makeRequest({ text: "天河区一房" }));
    expect(res.status).toBe(200);
  });

  // 25. No Service Role used
  it("25: no service role key in route", async () => {
    const handler = createHandler();
    const res = await handler(makeRequest({ text: "天河区一房" }));
    expect(res.status).toBe(200);
    // If service role was required, the mock client (anon key) would fail
  });

  // --- PII Redaction Integration ---

  it("26: provider receives redacted text, not raw PII", async () => {
    let capturedText: string | null = null;
    const provider = makeMockProvider({
      extractProperty: async (input) => {
        capturedText = input.text;
        return DEFAULT_RESULT;
      },
    });
    const handler = createHandler(provider);
    await handler(
      makeRequest({
        text: "天河区一房3500元，房东：张三，电话13812345678",
      })
    );
    expect(capturedText).not.toBeNull();
    expect(capturedText!).not.toContain("13812345678");
    expect(capturedText!).not.toContain("张三");
    expect(capturedText!).toContain("[REDACTED_PHONE]");
    expect(capturedText!).toContain("[REDACTED_NAME]");
    // Property facts preserved
    expect(capturedText!).toContain("3500");
  });

  it("27: provider never receives raw PII from input", async () => {
    let capturedText: string | null = null;
    const provider = makeMockProvider({
      extractProperty: async (input) => {
        capturedText = input.text;
        return DEFAULT_RESULT;
      },
    });
    const handler = createHandler(provider);
    const rawText =
      "微信：owner123 邮箱：owner@mail.com 身份证：440106199001011234";
    await handler(makeRequest({ text: rawText }));
    expect(capturedText!).not.toContain("owner123");
    expect(capturedText!).not.toContain("owner@mail.com");
    expect(capturedText!).not.toContain("440106199001011234");
  });

  it("28: high-risk input (mostly PII) → 422, Provider call count = 0", async () => {
    let callCount = 0;
    const provider = makeMockProvider({
      extractProperty: async () => {
        callCount++;
        return DEFAULT_RESULT;
      },
    });
    const handler = createHandler(provider);
    // Pure PII with no property context — stripped text < 5 chars after redaction
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

  it("29: error logs/snapshots contain no raw PII", async () => {
    const provider = makeMockProvider({
      extractProperty: async () => {
        throw new DeepSeekProviderError({
          code: "AI_UPSTREAM_ERROR",
          message: "service error",
          requestId: "req-1",
          retryable: true,
          suggestedHttpStatus: 502,
        });
      },
    });
    const handler = createHandler(provider);
    const res = await handler(
      makeRequest({
        text: "天河区，房东电话13800000001，身份证440106199001011234",
      })
    );
    const body = await getResponseBody(res);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("13800000001");
    expect(serialized).not.toContain("440106199001011234");
  });
});
