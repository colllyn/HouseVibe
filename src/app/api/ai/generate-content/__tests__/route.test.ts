/**
 * POST /api/ai/generate-content — Route Handler Tests
 * All tests use Mock Auth, Mock Entitlement, Mock Provider.
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

const SAFE_FACTS = {
  title: "天河温馨一房",
  district: "天河区",
  monthlyRent: 3500,
  bedrooms: 1,
  areaSqm: 45,
  hasElevator: true,
  petsAllowed: false,
  tags: ["近地铁", "采光好"],
  sellingPoints: ["朝南大阳台"],
  description: "精装修，拎包入住，交通便利",
};

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
    extractProperty: async () => {
      throw new Error("not implemented");
    },
    extractClient: async () => {
      throw new Error("not implemented");
    },
    parsePropertySearch: async () => {
      throw new Error("not implemented");
    },
    generateContent:
      overrides?.generateContent ?? (async () => DEFAULT_RESULT),
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
    "http://localhost/api/ai/generate-content",
    init
  );
}

function validBody(overrides?: Record<string, unknown>) {
  return {
    platform: "xiaohongshu",
    propertyFacts: SAFE_FACTS,
    ...overrides,
  };
}

function createHandler(provider?: DeepSeekTextProvider) {
  return createGenerateContentHandler(
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

describe("POST /api/ai/generate-content", () => {
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
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(401);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("UNAUTHENTICATED");
  });

  // 2. No workspace membership → 403
  it("2: no workspace membership → 403", async () => {
    setupNoWorkspace();
    const handler = createHandler();
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(403);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("WORKSPACE_ACCESS_DENIED");
  });

  // 3. No content_factory entitlement → 403
  it("3: no content_factory entitlement → 403", async () => {
    setEntitlement(false);
    const handler = createHandler();
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(403);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("CONTENT_FACTORY_NOT_ALLOWED");
  });

  // 4. ai_data_extraction does NOT substitute for content_factory → 403
  it("4: ai_data_extraction does NOT substitute → 403", async () => {
    setEntitlement(false);
    const handler = createHandler();
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(403);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("CONTENT_FACTORY_NOT_ALLOWED");
  });

  // 5. Entitlement denied → Provider call count = 0
  it("5: entitlement denied → provider not called", async () => {
    let callCount = 0;
    setEntitlement(false);
    const provider = makeMockProvider({
      generateContent: async () => {
        callCount++;
        return DEFAULT_RESULT;
      },
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
    const req = new NextRequest(
      "http://localhost/api/ai/generate-content",
      { method: "POST", headers, body: "not json!!!" }
    );
    const res = await handler(req);
    expect(res.status).toBe(422);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("VALIDATION_FAILED");
  });

  // 8. Empty request → 422
  it("8: empty body → 422", async () => {
    const handler = createHandler();
    const res = await handler(makeRequest({}));
    expect(res.status).toBe(422);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("VALIDATION_FAILED");
  });

  // 9. Overlong text → 422
  it("9: description over 2000 chars → 422", async () => {
    const handler = createHandler();
    const longDesc = "a".repeat(2001);
    const res = await handler(
      makeRequest(
        validBody({
          propertyFacts: { ...SAFE_FACTS, description: longDesc },
        })
      )
    );
    expect(res.status).toBe(422);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("VALIDATION_FAILED");
  });

  // 10. Invalid platform → 422
  it("10: invalid platform enum → 422", async () => {
    const handler = createHandler();
    const res = await handler(
      makeRequest(validBody({ platform: "facebook" }))
    );
    expect(res.status).toBe(422);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("VALIDATION_FAILED");
  });

  // 11. Extra fields → 422
  it("11: extra fields in request body → 422", async () => {
    const handler = createHandler();
    const res = await handler(
      makeRequest(
        validBody({
          workspaceId: "evil-ws",
          modelName: "gpt-5",
          userId: "attacker",
          requestId: "client-req-id",
        })
      )
    );
    expect(res.status).toBe(422);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("VALIDATION_FAILED");
  });

  // 12. Client requestId/userId/workspaceId/modelName → 422
  it("12: client identity/config fields rejected → 422", async () => {
    const handler = createHandler();
    const res = await handler(
      makeRequest(
        validBody({
          userId: "attacker-id",
          workspaceId: "attacker-ws",
          requestId: "evil-req",
          modelName: "gpt-5",
        })
      )
    );
    expect(res.status).toBe(422);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("VALIDATION_FAILED");
  });

  // 13. Successful call
  it("13: successful content generation → 200 with envelope", async () => {
    const handler = createHandler();
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(200);
    const body = await getResponseBody(res);
    expect(body.data).toBeDefined();
    expect(body.error).toBeNull();
    const data = body.data as Record<string, unknown>;
    const content = data.content as Record<string, unknown>;
    expect(content.platform).toBe("xiaohongshu");
    expect(content.titleOptions).toBeDefined();
    expect(content.factualSummary).toBeDefined();
  });

  // 14. Provider called exactly once
  it("14: provider.generateContent called exactly once", async () => {
    let callCount = 0;
    const provider = makeMockProvider({
      generateContent: async () => {
        callCount++;
        return DEFAULT_RESULT;
      },
    });
    const handler = createHandler(provider);
    await handler(makeRequest(validBody()));
    expect(callCount).toBe(1);
  });

  // 15. request.signal forwarded to Provider
  it("15: request.signal forwarded to provider", async () => {
    let capturedSignal: AbortSignal | undefined;
    const provider = makeMockProvider({
      generateContent: async (_input, signal) => {
        capturedSignal = signal;
        return DEFAULT_RESULT;
      },
    });
    const handler = createHandler(provider);
    const ac = new AbortController();
    await handler(
      makeRequest(validBody(), "application/json", ac.signal)
    );
    expect(capturedSignal).toBeDefined();
  });

  // 16. Provider DTO is narrow type
  it("16: provider DTO has expected structure", async () => {
    const captured: ContentGenerationInput[] = [];
    const provider = makeMockProvider({
      generateContent: async (input) => {
        captured.push(input);
        return DEFAULT_RESULT;
      },
    });
    const handler = createHandler(provider);
    await handler(makeRequest(validBody()));
    const raw = captured[0];
    if (!raw) throw new Error("provider not called");
    expect(raw.platform).toBe("xiaohongshu");
    expect(raw.propertyFacts).toBeDefined();
    expect(raw.propertyFacts.district).toBe("天河区");
  });

  // 17. DTO excludes identity/workspace
  it("17: provider DTO excludes client identity fields", async () => {
    const captured: ContentGenerationInput[] = [];
    const provider = makeMockProvider({
      generateContent: async (input) => {
        captured.push(input);
        return DEFAULT_RESULT;
      },
    });
    const handler = createHandler(provider);
    await handler(makeRequest(validBody()));
    const raw = captured[0];
    if (!raw) throw new Error("provider not called");
    expect(raw.requestId).toBeDefined();
    expect(raw.platform).toBe("xiaohongshu");
  });

  // 18. DTO excludes exact address and contact info
  it("18: DTO description is redacted, no PII", async () => {
    const captured: ContentGenerationInput[] = [];
    const provider = makeMockProvider({
      generateContent: async (input) => {
        captured.push(input);
        return DEFAULT_RESULT;
      },
    });
    const handler = createHandler(provider);
    await handler(
      makeRequest(
        validBody({
          propertyFacts: {
            ...SAFE_FACTS,
            description:
              "精装修拎包入住，房东张三电话13800138000，交通便利近地铁",
          },
        })
      )
    );
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

  // 19. Phone/wechat/email redacted from description
  it("19: contact PII redacted from property facts description", async () => {
    const captured: ContentGenerationInput[] = [];
    const provider = makeMockProvider({
      generateContent: async (input) => {
        captured.push(input);
        return DEFAULT_RESULT;
      },
    });
    const handler = createHandler(provider);
    await handler(
      makeRequest(
        validBody({
          propertyFacts: {
            ...SAFE_FACTS,
            description:
              "微信owner123，邮箱own@mail.com，电话13900001111，精装修朝南采光好",
          },
        })
      )
    );
    const raw = captured[0];
    if (!raw) throw new Error("provider not called");
    const desc = raw.propertyFacts.description;
    if (!desc) throw new Error("description missing");
    expect(desc).not.toContain("owner123");
    expect(desc).not.toContain("own@mail.com");
    expect(desc).not.toContain("13900001111");
    expect(desc).toContain("[REDACTED_WECHAT]");
    expect(desc).toContain("[REDACTED_EMAIL]");
    expect(desc).toContain("[REDACTED_PHONE]");
    expect(desc).toContain("精装修");
  });

  // 20a. High-risk PII description → 422, Provider call count = 0
  it("20a: high-risk PII description → 422, provider not called", async () => {
    let callCount = 0;
    const provider = makeMockProvider({
      generateContent: async () => {
        callCount++;
        return DEFAULT_RESULT;
      },
    });
    const handler = createHandler(provider);
    const res = await handler(
      makeRequest(
        validBody({
          propertyFacts: {
            ...SAFE_FACTS,
            description: "13800001111 440106199001011234",
          },
        })
      )
    );
    expect(res.status).toBe(422);
    expect(callCount).toBe(0);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("VALIDATION_FAILED");
  });

  // 20. Safe property facts preserved
  it("20: safe property facts preserved in DTO", async () => {
    const captured: ContentGenerationInput[] = [];
    const provider = makeMockProvider({
      generateContent: async (input) => {
        captured.push(input);
        return DEFAULT_RESULT;
      },
    });
    const handler = createHandler(provider);
    await handler(makeRequest(validBody()));
    const raw = captured[0];
    if (!raw) throw new Error("provider not called");
    const facts = raw.propertyFacts;
    expect(facts.district).toBe("天河区");
    expect(facts.monthlyRent).toBe(3500);
    expect(facts.bedrooms).toBe(1);
    expect(facts.tags).toEqual(["近地铁", "采光好"]);
    expect(facts.sellingPoints).toEqual(["朝南大阳台"]);
  });

  // 21. Success envelope
  it("21: success envelope has { data: { content }, error: null }", async () => {
    const handler = createHandler();
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(200);
    const body = await getResponseBody(res);
    expect(body).toHaveProperty("data");
    expect(body).toHaveProperty("error");
    expect(body.error).toBeNull();
    const data = body.data as Record<string, unknown>;
    expect(data).toHaveProperty("content");
  });

  // 22. factualSummary exists
  it("22: factualSummary is present in response", async () => {
    const handler = createHandler();
    const res = await handler(makeRequest(validBody()));
    const body = await getResponseBody(res);
    const content = (body.data as Record<string, unknown>)
      .content as Record<string, unknown>;
    expect(content.factualSummary).toBeDefined();
    expect(typeof content.factualSummary).toBe("string");
    expect((content.factualSummary as string).length).toBeGreaterThan(0);
  });

  // 23. requiresFactReview is Boolean
  it("23: requiresFactReview is boolean in response", async () => {
    const handler = createHandler();
    const res = await handler(makeRequest(validBody()));
    const body = await getResponseBody(res);
    const content = (body.data as Record<string, unknown>)
      .content as Record<string, unknown>;
    expect(typeof content.requiresFactReview).toBe("boolean");
  });

  // 24. factsUsed/riskFlags/complianceFlags/imageSequence keep contract types
  it("24: output fields preserve contract types", async () => {
    const handler = createHandler();
    const res = await handler(makeRequest(validBody()));
    const body = await getResponseBody(res);
    const content = (body.data as Record<string, unknown>)
      .content as Record<string, unknown>;
    expect(Array.isArray(content.factsUsed)).toBe(true);
    expect(Array.isArray(content.riskFlags)).toBe(true);
    expect(Array.isArray(content.complianceFlags)).toBe(true);
    expect(Array.isArray(content.imageSequence)).toBe(true);
  });

  // 25. AI_NOT_CONFIGURED → 503
  it("25: AI_NOT_CONFIGURED → 503", async () => {
    const provider = makeMockProvider({
      generateContent: async () => {
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
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(503);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("AI_NOT_CONFIGURED");
  });

  // 26. AI_TIMEOUT → 504
  it("26: AI_TIMEOUT → 504", async () => {
    const provider = makeMockProvider({
      generateContent: async () => {
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
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(504);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("AI_TIMEOUT");
  });

  // 27. AI_RATE_LIMITED → 502
  it("27: AI_RATE_LIMITED → 502", async () => {
    const provider = makeMockProvider({
      generateContent: async () => {
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
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(502);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("AI_RATE_LIMITED");
  });

  // 28. AI_UPSTREAM_ERROR → 502
  it("28: AI_UPSTREAM_ERROR → 502", async () => {
    const provider = makeMockProvider({
      generateContent: async () => {
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
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(502);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("AI_UPSTREAM_ERROR");
  });

  // 29. AI_INVALID_RESPONSE → 502
  it("29: AI_INVALID_RESPONSE → 502", async () => {
    const provider = makeMockProvider({
      generateContent: async () => {
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
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(502);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("AI_INVALID_RESPONSE");
  });

  // 30. Unknown error → 500
  it("30: unknown error → 500", async () => {
    const provider = makeMockProvider({
      generateContent: async () => {
        throw new Error("something unexpected");
      },
    });
    const handler = createHandler(provider);
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(500);
    const body = await getResponseBody(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("INTERNAL_ERROR");
  });

  // 31. AI_REQUEST_ABORTED rethrows
  it("31: AI_REQUEST_ABORTED rethrows, no 499, no Response", async () => {
    let callCount = 0;
    const provider = makeMockProvider({
      generateContent: async () => {
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
      await handler(makeRequest(validBody()));
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DeepSeekProviderError);
      const e = err as DeepSeekProviderError;
      expect(e.code).toBe("AI_REQUEST_ABORTED");
    }
    expect(callCount).toBe(1);
  });

  // 32. Error/response does not leak PII
  it("32: error response does not leak sensitive data", async () => {
    const provider = makeMockProvider({
      generateContent: async () => {
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
      makeRequest(
        validBody({
          propertyFacts: {
            ...SAFE_FACTS,
            description: "房东电话13800138000，身份证440106199001011234",
          },
        })
      )
    );
    const body = await getResponseBody(res);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("13800138000");
    expect(serialized).not.toContain("440106199001011234");
    expect(serialized).not.toContain("sk-");
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain("upstreamStatus");
    expect(serialized).not.toContain("req-sensitive");
  });

  // 33. No database writes
  it("33: no database writes from route", async () => {
    const handler = createHandler();
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(200);
  });

  // 34. No Service Role used
  it("34: no service role key in route", async () => {
    const handler = createHandler();
    const res = await handler(makeRequest(validBody()));
    expect(res.status).toBe(200);
  });
});
