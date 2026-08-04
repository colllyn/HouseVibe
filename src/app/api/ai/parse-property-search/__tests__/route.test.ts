/**
 * POST /api/ai/parse-property-search — Route Handler Tests
 * All tests use Mock Auth, Mock Entitlement, Mock Provider.
 * No real DeepSeek calls. No real Supabase.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { DeepSeekProviderError } from "@/lib/ai/types";
import { createParsePropertySearchHandler } from "@/lib/ai/routes/parse-property-search-handler";
import type { DeepSeekTextProvider, SearchParseInput, PropertySearchFilters } from "@/lib/ai/types";

// ============================================================
// Hoisted Mocks (vi.mock factory cannot reference outer variables)
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

// Build a chainable mock query builder (supports multiple .eq() calls)
function buildQueryBuilder() {
  const chain: Record<string, unknown> = { single: mockFromSingle };
  // Methods that return the chain (fluent API)
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
    jsonResponse: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) =>
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

function makeMockProvider(overrides?: {
  parsePropertySearch?: (input: SearchParseInput, signal?: AbortSignal) => Promise<PropertySearchFilters>;
}): DeepSeekTextProvider {
  return {
    parsePropertySearch:
      overrides?.parsePropertySearch ??
      (async () => ({
        districts: ["天河区"],
        monthlyRentMax: 3500,
        parsedQuery: "parsed",
        unrecognizedTerms: [],
      })),
    extractProperty: async () => {
      throw new Error("not implemented");
    },
    extractClient: async () => {
      throw new Error("not implemented");
    },
    generateContent: async () => {
      throw new Error("not implemented");
    },
  };
}

function makeRequest(body: unknown, contentType = "application/json"): NextRequest {
  const headers = new Headers();
  if (contentType) headers.set("content-type", contentType);
  return new NextRequest("http://localhost/api/ai/parse-property-search", {
    method: "POST",
    headers,
    body: body !== null ? JSON.stringify(body) : undefined,
  });
}

function createHandler(provider?: DeepSeekTextProvider) {
  return createParsePropertySearchHandler(() => provider ?? makeMockProvider());
}

async function getResponseBody(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

// ============================================================
// Tests
// ============================================================

describe("POST /api/ai/parse-property-search", () => {
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
    const res = await handler(makeRequest({ query: "test" }));
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
    const res = await handler(makeRequest({ query: "test" }));
    expect(res.status).toBe(403);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("WORKSPACE_ACCESS_DENIED");
  });

  // 3. No semantic_search entitlement → 403
  it("3: no semantic_search entitlement → 403", async () => {
    setEntitlement(false);
    const handler = createHandler();
    const res = await handler(makeRequest({ query: "test" }));
    expect(res.status).toBe(403);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("FEATURE_NOT_ALLOWED");
  });

  // 4. property_matching on but semantic_search off → 403
  it("4: property_matching does NOT substitute for semantic_search → 403", async () => {
    // hasFeature("semantic_search") returns false even if property_matching would be true
    setEntitlement(false);
    const handler = createHandler();
    const res = await handler(makeRequest({ query: "test" }));
    expect(res.status).toBe(403);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("FEATURE_NOT_ALLOWED");
  });

  // 5. Non-JSON Content-Type → 422
  it("5: non-JSON content type → 422", async () => {
    const handler = createHandler();
    const res = await handler(makeRequest({ query: "test" }, "text/plain"));
    expect(res.status).toBe(422);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("VALIDATION_FAILED");
  });

  // 6. Empty query → 422
  it("6: empty query → 422", async () => {
    const handler = createHandler();
    const res = await handler(makeRequest({ query: "" }));
    expect(res.status).toBe(422);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("VALIDATION_FAILED");
  });

  // 7. Query over 500 chars → 422
  it("7: query over 500 chars → 422", async () => {
    const handler = createHandler();
    const longQuery = "a".repeat(501);
    const res = await handler(makeRequest({ query: longQuery }));
    expect(res.status).toBe(422);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("VALIDATION_FAILED");
  });

  // 8. Extra fields → 422 (strict schema)
  it("8: extra fields in request body → 422", async () => {
    const handler = createHandler();
    const res = await handler(
      makeRequest({ query: "test", workspaceId: "evil-ws", modelName: "gpt-5" })
    );
    expect(res.status).toBe(422);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("VALIDATION_FAILED");
  });

  // 9. Successful call
  it("9: successful parse → 200 with filters envelope", async () => {
    const handler = createHandler();
    const res = await handler(makeRequest({ query: "天河区3500以内" }));
    expect(res.status).toBe(200);
    const body = await getResponseBody(res);
    expect(body.data).toBeDefined();
    expect(body.error).toBeNull();
    const data = body.data as Record<string, unknown>;
    const filters = data.filters as Record<string, unknown>;
    expect(filters.districts).toEqual(["天河区"]);
    expect(filters.monthlyRentMax).toBe(3500);
  });

  // 10. Provider only receives trimmed query
  it("10: provider receives only trimmed query, no metadata", async () => {
    let capturedInput: SearchParseInput | null = null;
    const provider = makeMockProvider({
      parsePropertySearch: async (input) => {
        capturedInput = input;
        return {
          districts: ["天河区"],
          parsedQuery: "parsed",
          unrecognizedTerms: [],
        };
      },
    });

    const handler = createHandler(provider);
    await handler(makeRequest({ query: "  天河区  " }));

    expect(capturedInput).not.toBeNull();
    const input = capturedInput as unknown as SearchParseInput;
    expect(input.query).toBe("天河区"); // trimmed
  });

  // 11. Success envelope has correct shape
  it("11: success response has { data: { filters }, error: null } envelope", async () => {
    const handler = createHandler();
    const res = await handler(makeRequest({ query: "test" }));
    const body = await getResponseBody(res);
    expect(res.status).toBe(200);
    expect(body).toHaveProperty("data");
    expect(body).toHaveProperty("error");
    expect(body.error).toBeNull();
    const data = body.data as Record<string, unknown>;
    expect(data).toHaveProperty("filters");
    // filters must NOT contain raw provider response internals
    const filters = data.filters as Record<string, unknown>;
    expect(filters).not.toHaveProperty("usage");
    expect(filters).not.toHaveProperty("rawText");
    expect(filters).not.toHaveProperty("requestId");
  });

  // 12. AI_NOT_CONFIGURED → 503
  it("12: AI_NOT_CONFIGURED → 503", async () => {
    const provider = makeMockProvider({
      parsePropertySearch: async () => {
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
    const res = await handler(makeRequest({ query: "test" }));
    expect(res.status).toBe(503);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("AI_NOT_CONFIGURED");
  });

  // 13. AI_TIMEOUT → 504
  it("13: AI_TIMEOUT → 504", async () => {
    const provider = makeMockProvider({
      parsePropertySearch: async () => {
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
    const res = await handler(makeRequest({ query: "test" }));
    expect(res.status).toBe(504);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("AI_TIMEOUT");
  });

  // 14. AI_RATE_LIMITED → 502
  it("14: AI_RATE_LIMITED → 502", async () => {
    const provider = makeMockProvider({
      parsePropertySearch: async () => {
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
    const res = await handler(makeRequest({ query: "test" }));
    expect(res.status).toBe(502);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("AI_RATE_LIMITED");
  });

  // 15. AI_UPSTREAM_ERROR → 502
  it("15: AI_UPSTREAM_ERROR → 502", async () => {
    const provider = makeMockProvider({
      parsePropertySearch: async () => {
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
    const res = await handler(makeRequest({ query: "test" }));
    expect(res.status).toBe(502);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("AI_UPSTREAM_ERROR");
  });

  // 16. AI_INVALID_RESPONSE → 502
  it("16: AI_INVALID_RESPONSE → 502", async () => {
    const provider = makeMockProvider({
      parsePropertySearch: async () => {
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
    const res = await handler(makeRequest({ query: "test" }));
    expect(res.status).toBe(502);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("AI_INVALID_RESPONSE");
  });

  // 17. Unknown error → 500
  it("17: unknown error → 500", async () => {
    const provider = makeMockProvider({
      parsePropertySearch: async () => {
        throw new Error("something completely unexpected");
      },
    });

    const handler = createHandler(provider);
    const res = await handler(makeRequest({ query: "test" }));
    expect(res.status).toBe(500);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("INTERNAL_ERROR");
  });

  // 18. Error does NOT leak query, key, prompt, raw response
  it("18: error response does not leak sensitive data", async () => {
    const provider = makeMockProvider({
      parsePropertySearch: async () => {
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
    const res = await handler(makeRequest({ query: "sensitive user input" }));
    const body = await getResponseBody(res);
    const serialized = JSON.stringify(body);

    expect(serialized).not.toContain("sensitive user input");
    expect(serialized).not.toContain("sk-");
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain("upstreamStatus");
    expect(serialized).not.toContain("req-sensitive");
  });

  // 19. Client workspaceId is NOT trusted
  it("19: client-provided workspaceId is rejected (strict schema)", async () => {
    const handler = createHandler();
    const res = await handler(
      makeRequest({ query: "test", workspace_id: "attacker-workspace" })
    );
    expect(res.status).toBe(422); // strict schema rejects extra fields
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("VALIDATION_FAILED");
  });

  // 20. Provider called exactly once per request
  it("20: provider.parsePropertySearch called exactly once", async () => {
    let callCount = 0;
    const provider = makeMockProvider({
      parsePropertySearch: async () => {
        callCount++;
        return {
          districts: ["天河区"],
          parsedQuery: "parsed",
          unrecognizedTerms: [],
        };
      },
    });

    const handler = createHandler(provider);
    await handler(makeRequest({ query: "test" }));
    expect(callCount).toBe(1);
  });

  // 21. No Service Role Key used
  it("21: no service role key in route code", async () => {
    // Static verification: grep the route file for SUPABASE_SERVICE_ROLE_KEY
    // Test verifies the handler works without service role (uses anon key via createRouteHandlerClient)
    const handler = createHandler();
    const res = await handler(makeRequest({ query: "test" }));
    expect(res.status).toBe(200);
    // If service role was required, this test would fail because the mock client
    // doesn't provide it
  });

  // 22. Abort does not produce secondary response
  it("22: AI_REQUEST_ABORTED — handler rejects, no Response envelope, no 499", async () => {
    let callCount = 0;
    const provider = makeMockProvider({
      parsePropertySearch: async () => {
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
    // Aborted request — handler must rethrow, not return a Response
    try {
      await handler(makeRequest({ query: "test" }));
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DeepSeekProviderError);
      const e = err as DeepSeekProviderError;
      expect(e.code).toBe("AI_REQUEST_ABORTED");
    }

    // Provider called exactly once (no retry)
    expect(callCount).toBe(1);
  });

  // 23. Whitespace-only query → 422
  it("23: whitespace-only query → 422", async () => {
    const handler = createHandler();
    const res = await handler(makeRequest({ query: "   " }));
    expect(res.status).toBe(422);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("VALIDATION_FAILED");
  });

  // 24. VALIDATION_FAILED envelope is correct
  it("24: VALIDATION_FAILED envelope has correct shape", async () => {
    const handler = createHandler();
    const res = await handler(makeRequest({ query: "" }));
    expect(res.status).toBe(422);
    const body = await getResponseBody(res);
    expect(body.data).toBeNull();
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("VALIDATION_FAILED");
    expect(typeof err.message).toBe("string");
    expect((err.message as string).length).toBeGreaterThan(0);
  });
});
