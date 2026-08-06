/**
 * AI Feedback API — Route Handler Tests
 * Contract: P3-AI-011
 * Covers: POST /api/ai/feedback
 * All tests use Mock Auth, Mock Supabase. No real DB calls.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// ============================================================
// Hoisted Mocks
// ============================================================

const { mockGetUser, mockFeatureCheck, mockChainResult, mockRpcResult } = vi.hoisted(() => {
  return {
    mockGetUser: vi.fn(),
    mockFeatureCheck: vi.fn(),
    mockChainResult: vi.fn(),
    mockRpcResult: vi.fn(),
  };
});

function buildChain() {
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    order: vi.fn(() => chain),
    range: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    single: vi.fn(() => mockChainResult()),
    maybeSingle: vi.fn(() => mockChainResult()),
  };
  chain.then = (resolve: (v: unknown) => void) => resolve(mockChainResult());
  return chain;
}

function buildSupabaseClient() {
  return {
    client: {
      auth: { getUser: mockGetUser },
      from: vi.fn(() => buildChain()),
      rpc: vi.fn(() => mockRpcResult()),
    },
    jsonResponse: (
      body: unknown,
      init?: { status?: number },
    ) =>
      new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
  };
}

vi.mock("@/lib/supabase/route-handler", () => ({
  createRouteHandlerClient: () => Promise.resolve(buildSupabaseClient()),
}));

vi.mock("@/features/access-control/guards", () => ({
  hasFeature: vi.fn(async (feature: string) => {
    if (feature === "content_factory") return mockFeatureCheck();
    return false;
  }),
  requireFeature: vi.fn(),
  isSystemAdmin: vi.fn(),
}));

// ============================================================
// Helpers
// ============================================================

const VERSION_ID = "e0000000-0000-0000-0000-000000000001";
const WORKSPACE_ID = "8cae1001-0000-4000-8000-000000000001";
const USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function setupUser(userId: string | null = USER_ID) {
  mockGetUser.mockResolvedValue({
    data: userId ? { user: { id: userId, email: "user@test.com" } } : { user: null },
  });
}

function setupMember(workspaceId: string | null = WORKSPACE_ID) {
  if (workspaceId) {
    mockChainResult.mockResolvedValueOnce({ data: { workspace_id: workspaceId }, error: null });
  } else {
    mockChainResult.mockResolvedValueOnce({ data: null, error: { message: "not found" } });
  }
}

function setupEntitled(entitled = true) {
  mockFeatureCheck.mockReturnValue(entitled);
}

function setupVersion(exists = true) {
  if (exists) {
    mockChainResult.mockResolvedValueOnce({
      data: { id: VERSION_ID, content_project_id: "acae4001-0000-4000-8000-000000000001" },
      error: null,
    });
  } else {
    mockChainResult.mockResolvedValueOnce({ data: null, error: { message: "not found" } });
  }
}

async function getHandlers() {
  return import("../route");
}

function validBody(overrides = {}) {
  return {
    contentVersionId: VERSION_ID,
    score: 1,
    ...overrides,
  };
}

function mockPostRequest(body: unknown) {
  return new Request("http://localhost/api/ai/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ============================================================
// POST /api/ai/feedback
// ============================================================

describe("POST /api/ai/feedback", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // --- Auth failures ---

  it("returns 401 for unauthenticated", async () => {
    setupUser(null);
    const { POST } = await getHandlers();
    const res = await POST(mockPostRequest(validBody()) as unknown as NextRequest);
    expect(res.status).toBe(401);
  });

  // --- Workspace failures ---

  it("returns 403 when no workspace member", async () => {
    setupUser(USER_ID);
    setupMember(null); // no membership
    const { POST } = await getHandlers();
    const res = await POST(mockPostRequest(validBody()) as unknown as NextRequest);
    expect(res.status).toBe(403);
  });

  // --- Feature entitlement failures ---

  it("returns 403 when missing content_factory feature", async () => {
    setupUser(USER_ID);
    setupMember(WORKSPACE_ID);
    setupEntitled(false);
    const { POST } = await getHandlers();
    const res = await POST(mockPostRequest(validBody()) as unknown as NextRequest);
    expect(res.status).toBe(403);
  });

  // --- Body validation failures ---

  it("returns 400 for invalid JSON body", async () => {
    setupUser(USER_ID);
    setupMember(WORKSPACE_ID);
    setupEntitled(true);
    const { POST } = await getHandlers();
    const req = new Request("http://localhost/api/ai/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing contentVersionId", async () => {
    setupUser(USER_ID);
    setupMember(WORKSPACE_ID);
    setupEntitled(true);
    const { POST } = await getHandlers();
    const res = await POST(mockPostRequest({ score: 1 }) as unknown as NextRequest);
    expect(res.status).toBe(400);
  });

  it("returns 400 for score > 1", async () => {
    setupUser(USER_ID);
    setupMember(WORKSPACE_ID);
    setupEntitled(true);
    const { POST } = await getHandlers();
    const res = await POST(mockPostRequest({ contentVersionId: VERSION_ID, score: 5 }) as unknown as NextRequest);
    expect(res.status).toBe(400);
  });

  it("returns 400 for score < -1", async () => {
    setupUser(USER_ID);
    setupMember(WORKSPACE_ID);
    setupEntitled(true);
    const { POST } = await getHandlers();
    const res = await POST(mockPostRequest({ contentVersionId: VERSION_ID, score: -2 }) as unknown as NextRequest);
    expect(res.status).toBe(400);
  });

  it("returns 400 for non-integer score", async () => {
    setupUser(USER_ID);
    setupMember(WORKSPACE_ID);
    setupEntitled(true);
    const { POST } = await getHandlers();
    const res = await POST(mockPostRequest({ contentVersionId: VERSION_ID, score: 0.5 }) as unknown as NextRequest);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid feedbackType", async () => {
    setupUser(USER_ID);
    setupMember(WORKSPACE_ID);
    setupEntitled(true);
    const { POST } = await getHandlers();
    const res = await POST(
      mockPostRequest({ contentVersionId: VERSION_ID, score: -1, feedbackType: "invalid_type" }) as unknown as NextRequest
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for non-UUID contentVersionId", async () => {
    setupUser(USER_ID);
    setupMember(WORKSPACE_ID);
    setupEntitled(true);
    const { POST } = await getHandlers();
    const res = await POST(
      mockPostRequest({ contentVersionId: "not-a-uuid", score: 1 }) as unknown as NextRequest
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for comment exceeding max length", async () => {
    setupUser(USER_ID);
    setupMember(WORKSPACE_ID);
    setupEntitled(true);
    const { POST } = await getHandlers();
    const res = await POST(
      mockPostRequest({
        contentVersionId: VERSION_ID,
        score: -1,
        comment: "x".repeat(501),
      }) as unknown as NextRequest
    );
    expect(res.status).toBe(400);
  });

  // --- Version not found ---

  it("returns 404 when content_version not found", async () => {
    setupUser(USER_ID);
    setupMember(WORKSPACE_ID);
    setupEntitled(true);
    setupVersion(false); // version doesn't exist
    const { POST } = await getHandlers();
    const res = await POST(mockPostRequest(validBody()) as unknown as NextRequest);
    expect(res.status).toBe(404);
  });

  // --- RPC failure ---

  it("returns 500 when RPC record_ai_correction fails", async () => {
    setupUser(USER_ID);
    setupMember(WORKSPACE_ID);
    setupEntitled(true);
    setupVersion(true);
    mockRpcResult.mockResolvedValueOnce({ data: null, error: { message: "db error" } });
    const { POST } = await getHandlers();
    const res = await POST(mockPostRequest(validBody()) as unknown as NextRequest);
    expect(res.status).toBe(500);
  });

  // --- Success cases ---

  it("returns 200 with score=1 (thumbs up)", async () => {
    setupUser(USER_ID);
    setupMember(WORKSPACE_ID);
    setupEntitled(true);
    setupVersion(true);
    // RPC succeeds
    mockRpcResult.mockResolvedValueOnce({ data: { success: true }, error: null });
    // content_versions update succeeds
    mockChainResult.mockResolvedValueOnce({ data: { id: VERSION_ID }, error: null });

    const { POST } = await getHandlers();
    const res = await POST(mockPostRequest(validBody({ score: 1 })) as unknown as NextRequest);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.recorded).toBe(true);
    expect(json.data.score).toBe(1);
    expect(json.error).toBeNull();
  });

  it("returns 200 with score=-1 and feedbackType (thumbs down with reason)", async () => {
    setupUser(USER_ID);
    setupMember(WORKSPACE_ID);
    setupEntitled(true);
    setupVersion(true);
    mockRpcResult.mockResolvedValueOnce({ data: { success: true }, error: null });
    mockChainResult.mockResolvedValueOnce({ data: { id: VERSION_ID }, error: null });

    const { POST } = await getHandlers();
    const res = await POST(
      mockPostRequest(validBody({ score: -1, feedbackType: "fact_error", comment: "Wrong data" })) as unknown as NextRequest
    );
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.recorded).toBe(true);
    expect(json.data.score).toBe(-1);
    expect(json.error).toBeNull();
  });

  it("returns 200 even when content_versions update fails (best-effort)", async () => {
    setupUser(USER_ID);
    setupMember(WORKSPACE_ID);
    setupEntitled(true);
    setupVersion(true);
    // RPC succeeds
    mockRpcResult.mockResolvedValueOnce({ data: { success: true }, error: null });
    // content_versions update FAILS (non-fatal)
    mockChainResult.mockResolvedValueOnce({ data: null, error: { message: "update failed" } });

    const { POST } = await getHandlers();
    const res = await POST(mockPostRequest(validBody({ score: 1 })) as unknown as NextRequest);
    // Should still return 200 — version update is best-effort
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.recorded).toBe(true);
  });

  it("returns 200 with score=0 (neutral)", async () => {
    setupUser(USER_ID);
    setupMember(WORKSPACE_ID);
    setupEntitled(true);
    setupVersion(true);
    mockRpcResult.mockResolvedValueOnce({ data: { success: true }, error: null });
    mockChainResult.mockResolvedValueOnce({ data: { id: VERSION_ID }, error: null });

    const { POST } = await getHandlers();
    const res = await POST(mockPostRequest(validBody({ score: 0 })) as unknown as NextRequest);
    expect(res.status).toBe(200);
  });
});
