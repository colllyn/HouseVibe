/**
 * Content Project [id] API — Route Handler Tests
 * Contract: P3-AI-021 (Content Tables Foundation)
 * Covers: GET [id], PATCH [id], DELETE [id]
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

const PROJECT_ID = "acae4001-0000-4000-8000-000000000001";
const WORKSPACE_ID = "8cae1001-0000-4000-8000-000000000001";

function setupUser(userId: string | null = "user-1") {
  mockGetUser.mockResolvedValue({
    data: userId ? { user: { id: userId, email: "user@test.com" } } : { user: null },
  });
}

function setupAdmin() {
  setupUser("admin-1");
  mockChainResult.mockResolvedValue({ data: { workspace_id: WORKSPACE_ID }, error: null });
  mockFeatureCheck.mockReturnValue(true);
}

function setupNonAdmin() {
  setupUser("user-1");
  mockChainResult.mockResolvedValue({ data: { workspace_id: WORKSPACE_ID }, error: null });
  mockFeatureCheck.mockReturnValue(false);
}

async function getHandlers() {
  return import("../route");
}

// ============================================================
// GET /api/content/projects/[id]
// ============================================================

describe("GET /api/content/projects/[id]", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 for unauthenticated", async () => {
    setupUser(null);
    const { GET } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}`);
    const res = await GET(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when no workspace member", async () => {
    setupUser("user-1");
    mockChainResult.mockResolvedValue({ data: null, error: { message: "not found" } });
    const { GET } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}`);
    const res = await GET(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 403 when missing content_factory feature", async () => {
    setupNonAdmin();
    const { GET } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}`);
    const res = await GET(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 when project not found", async () => {
    setupUser("admin-1");
    mockFeatureCheck.mockReturnValue(true);
    // workspace member check passes
    mockChainResult.mockResolvedValueOnce({ data: { workspace_id: WORKSPACE_ID }, error: null });
    // project query: not found
    mockChainResult.mockResolvedValueOnce({ data: null, error: { message: "not found" } });
    const { GET } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}`);
    const res = await GET(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 200 with project data", async () => {
    setupAdmin();
    mockChainResult.mockResolvedValue({
      data: { id: PROJECT_ID, platform: "xiaohongshu", status: "draft" },
      error: null,
    });
    const { GET } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}`);
    const res = await GET(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(200);
  });
});

// ============================================================
// PATCH /api/content/projects/[id]
// ============================================================

describe("PATCH /api/content/projects/[id]", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 for unauthenticated", async () => {
    setupUser(null);
    const { PATCH } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}`, {
      method: "PATCH",
      body: JSON.stringify({}),
    });
    const res = await PATCH(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when missing content_factory feature", async () => {
    setupNonAdmin();
    const { PATCH } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ platform: "douyin" }),
    });
    const res = await PATCH(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid body", async () => {
    setupAdmin();
    // First call: workspace member check, second call: verify existing project
    mockChainResult.mockResolvedValueOnce({ data: { workspace_id: WORKSPACE_ID }, error: null });
    mockChainResult.mockResolvedValueOnce({ data: { id: PROJECT_ID }, error: null });
    const { PATCH } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ platform: "invalid_platform" }),
    });
    const res = await PATCH(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when project not found in workspace", async () => {
    setupAdmin();
    // workspace member check passes
    mockChainResult.mockResolvedValueOnce({ data: { workspace_id: WORKSPACE_ID }, error: null });
    // project lookup: not found
    mockChainResult.mockResolvedValueOnce({ data: null, error: { message: "not found" } });
    const { PATCH } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ target_audience: "young" }),
    });
    const res = await PATCH(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 200 for valid update", async () => {
    setupAdmin();
    // workspace member
    mockChainResult.mockResolvedValueOnce({ data: { workspace_id: WORKSPACE_ID }, error: null });
    // existing project
    mockChainResult.mockResolvedValueOnce({ data: { id: PROJECT_ID }, error: null });
    // update result
    mockChainResult.mockResolvedValueOnce({
      data: { id: PROJECT_ID, platform: "xiaohongshu", target_audience: "young", status: "draft" },
      error: null,
    });
    const { PATCH } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ target_audience: "young" }),
    });
    const res = await PATCH(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(200);
  });
});

// ============================================================
// DELETE /api/content/projects/[id]
// ============================================================

describe("DELETE /api/content/projects/[id]", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 for unauthenticated", async () => {
    setupUser(null);
    const { DELETE } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}`, {
      method: "DELETE",
    });
    const res = await DELETE(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when missing content_factory feature", async () => {
    setupNonAdmin();
    const { DELETE } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}`, {
      method: "DELETE",
    });
    const res = await DELETE(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 when project not found", async () => {
    setupAdmin();
    mockChainResult.mockResolvedValueOnce({ data: { workspace_id: WORKSPACE_ID }, error: null });
    mockChainResult.mockResolvedValueOnce({ data: null, error: { message: "not found" } });
    const { DELETE } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}`, {
      method: "DELETE",
    });
    const res = await DELETE(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 200 for successful soft delete", async () => {
    setupAdmin();
    // workspace member
    mockChainResult.mockResolvedValueOnce({ data: { workspace_id: WORKSPACE_ID }, error: null });
    // existing project
    mockChainResult.mockResolvedValueOnce({ data: { id: PROJECT_ID }, error: null });
    // soft delete succeeds
    mockChainResult.mockResolvedValueOnce({ data: null, error: null });
    const { DELETE } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}`, {
      method: "DELETE",
    });
    const res = await DELETE(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.deleted).toBe(true);
  });
});
