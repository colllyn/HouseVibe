/**
 * Content Projects API — Route Handler Tests
 * Contract: P3-AI-021 (Content Tables Foundation)
 * All tests use Mock Auth, Mock Supabase. No real DB calls.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// ============================================================
// Hoisted Mocks
// ============================================================

const { mockGetUser, mockFeatureCheck, mockChainResult } = vi.hoisted(() => {
  return {
    mockGetUser: vi.fn(),
    mockFeatureCheck: vi.fn(),
    mockChainResult: vi.fn(),
  };
});

// Chain builder: returns itself for all query methods.
// When awaited (no .single()), resolves via .then().
// When .single() is called, returns the singleton result directly.
function buildChain() {
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    range: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    // .single() returns a postgrest single-result promise directly
    single: vi.fn(() => mockChainResult()),
    maybeSingle: vi.fn(() => mockChainResult()),
  };
  // Make chain awaitable — resolves to the chain result
  chain.then = (resolve: (v: unknown) => void) => resolve(mockChainResult());
  return chain;
}

function buildSupabaseClient() {
  return {
    client: {
      auth: { getUser: mockGetUser },
      from: vi.fn(() => buildChain()),
      rpc: vi.fn(),
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
  requireFeature: vi.fn(async (feature: string) => {
    if (feature === "content_factory" && !mockFeatureCheck()) {
      throw new Error("FEATURE_DENIED");
    }
  }),
  isSystemAdmin: vi.fn(),
}));

// ============================================================
// Helpers
// ============================================================

function setupUser(userId: string | null = "user-1") {
  mockGetUser.mockResolvedValue({
    data: userId ? { user: { id: userId, email: "user@test.com" } } : { user: null },
  });
}

function setupAdmin() {
  setupUser("admin-1");
  mockChainResult.mockResolvedValue({ data: { workspace_id: "ws-1" }, error: null });
  mockFeatureCheck.mockReturnValue(true);
}

function setupNonAdmin() {
  setupUser("user-1");
  mockChainResult.mockResolvedValue({ data: { workspace_id: "ws-1" }, error: null });
  mockFeatureCheck.mockReturnValue(false);
}

async function getHandlers() {
  return import("../route");
}

// ============================================================
// GET /api/content/projects
// ============================================================

describe("GET /api/content/projects", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 for unauthenticated", async () => {
    setupUser(null);
    const { GET } = await getHandlers();
    const req = new Request("http://localhost/api/content/projects");
    const res = await GET(req as unknown as NextRequest);
    expect(res.status).toBe(401);
  });

  it("returns 403 when no workspace member", async () => {
    setupUser("user-1");
    mockChainResult.mockResolvedValue({ data: null, error: { message: "not found" } });
    const { GET } = await getHandlers();
    const req = new Request("http://localhost/api/content/projects");
    const res = await GET(req as unknown as NextRequest);
    expect(res.status).toBe(403);
  });

  it("returns 403 when missing content_factory feature", async () => {
    setupNonAdmin();
    const { GET } = await getHandlers();
    const req = new Request("http://localhost/api/content/projects");
    const res = await GET(req as unknown as NextRequest);
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid query params", async () => {
    setupAdmin();
    const { GET } = await getHandlers();
    const req = new Request("http://localhost/api/content/projects?limit=0");
    const res = await GET(req as unknown as NextRequest);
    expect(res.status).toBe(400);
  });

  it("returns 200 with data for valid admin", async () => {
    setupAdmin();
    mockChainResult.mockResolvedValue({ data: [], count: 0, error: null });
    const { GET } = await getHandlers();
    const req = new Request("http://localhost/api/content/projects");
    const res = await GET(req as unknown as NextRequest);
    expect(res.status).toBe(200);
  });
});

// ============================================================
// POST /api/content/projects
// ============================================================

describe("POST /api/content/projects", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 for unauthenticated", async () => {
    setupUser(null);
    const { POST } = await getHandlers();
    const req = new Request("http://localhost/api/content/projects", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid body", async () => {
    setupAdmin();
    const { POST } = await getHandlers();
    const req = new Request("http://localhost/api/content/projects", {
      method: "POST",
      body: JSON.stringify({ property_id: "bad" }),
    });
    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing property_id", async () => {
    setupAdmin();
    const { POST } = await getHandlers();
    const req = new Request("http://localhost/api/content/projects", {
      method: "POST",
      body: JSON.stringify({ platform: "xiaohongshu" }),
    });
    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(400);
  });

  it("returns 403 when missing content_factory", async () => {
    setupNonAdmin();
    const { POST } = await getHandlers();
    const req = new Request("http://localhost/api/content/projects", {
      method: "POST",
      body: JSON.stringify({ property_id: "c0000000-0000-0000-0000-000000000001", platform: "xiaohongshu" }),
    });
    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(403);
  });
});
