/**
 * Publishing Records API — Route Handler Tests
 * Contract: P3-AI-021
 * Covers: GET/POST /api/content/projects/[id]/publishing, PATCH /api/content/projects/[id]/publishing/[recordId]
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
const VERSION_ID = "e0000000-0000-0000-0000-000000000001";
const RECORD_ID = "f0000000-0000-0000-0000-000000000001";

function setupUser(userId: string | null = "user-1") {
  mockGetUser.mockResolvedValue({
    data: userId ? { user: { id: userId, email: "user@test.com" } } : { user: null },
  });
}

function setupAdmin() {
  setupUser("admin-1");
  mockFeatureCheck.mockReturnValue(true);
}

function setupNonAdmin() {
  setupUser("user-1");
  mockFeatureCheck.mockReturnValue(false);
}

async function getHandlers() {
  return import("../route");
}

async function getDetailHandlers() {
  return import("../[recordId]/route");
}

// ============================================================
// GET /api/content/projects/[id]/publishing
// ============================================================

describe("GET /api/content/projects/[id]/publishing", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 for unauthenticated", async () => {
    setupUser(null);
    const { GET } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}/publishing`);
    const res = await GET(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when no workspace member", async () => {
    setupUser("user-1");
    mockChainResult.mockResolvedValue({ data: null, error: { message: "not found" } });
    const { GET } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}/publishing`);
    const res = await GET(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 403 when missing content_factory feature", async () => {
    setupNonAdmin();
    const { GET } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}/publishing`);
    const res = await GET(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 when project not found", async () => {
    setupAdmin();
    mockChainResult.mockResolvedValueOnce({ data: { workspace_id: WORKSPACE_ID }, error: null });
    mockChainResult.mockResolvedValueOnce({ data: null, error: { message: "not found" } });
    const { GET } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}/publishing`);
    const res = await GET(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 200 with empty records", async () => {
    setupAdmin();
    mockChainResult.mockResolvedValueOnce({ data: { workspace_id: WORKSPACE_ID }, error: null });
    mockChainResult.mockResolvedValueOnce({ data: { id: PROJECT_ID }, error: null });
    mockChainResult.mockResolvedValueOnce({ data: [], error: null });
    const { GET } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}/publishing`);
    const res = await GET(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(200);
  });

  it("returns 200 with records", async () => {
    setupAdmin();
    const records = [{
      id: RECORD_ID, workspace_id: WORKSPACE_ID, content_project_id: PROJECT_ID,
      content_version_id: VERSION_ID, platform: "douyin", published_at: "2026-08-06T10:00:00Z",
    }];
    mockChainResult.mockResolvedValueOnce({ data: { workspace_id: WORKSPACE_ID }, error: null });
    mockChainResult.mockResolvedValueOnce({ data: { id: PROJECT_ID }, error: null });
    mockChainResult.mockResolvedValueOnce({ data: records, error: null });
    const { GET } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}/publishing?platform=douyin`);
    const res = await GET(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(1);
  });
});

// ============================================================
// POST /api/content/projects/[id]/publishing
// ============================================================

describe("POST /api/content/projects/[id]/publishing", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  const validBody = {
    content_version_id: VERSION_ID,
    platform: "xiaohongshu",
    published_at: "2026-08-06T10:00:00Z",
  };

  it("returns 401 for unauthenticated", async () => {
    setupUser(null);
    const { POST } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}/publishing`, {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const res = await POST(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when no workspace member", async () => {
    setupUser("user-1");
    mockChainResult.mockResolvedValue({ data: null, error: { message: "not found" } });
    const { POST } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}/publishing`, {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const res = await POST(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 403 when missing content_factory feature", async () => {
    setupNonAdmin();
    const { POST } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}/publishing`, {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const res = await POST(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid body (missing content_version_id)", async () => {
    setupAdmin();
    mockChainResult.mockResolvedValueOnce({ data: { workspace_id: WORKSPACE_ID }, error: null });
    mockChainResult.mockResolvedValueOnce({ data: { id: PROJECT_ID, platform: "xiaohongshu" }, error: null });
    const { POST } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}/publishing`, {
      method: "POST",
      body: JSON.stringify({ platform: "xiaohongshu", published_at: "2026-01-01" }),
    });
    const res = await POST(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for extra fields (strict)", async () => {
    setupAdmin();
    mockChainResult.mockResolvedValueOnce({ data: { workspace_id: WORKSPACE_ID }, error: null });
    mockChainResult.mockResolvedValueOnce({ data: { id: PROJECT_ID, platform: "xiaohongshu" }, error: null });
    const { POST } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}/publishing`, {
      method: "POST",
      body: JSON.stringify({ ...validBody, workspace_id: "fake" }),
    });
    const res = await POST(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when version not found for project", async () => {
    setupAdmin();
    mockChainResult.mockResolvedValueOnce({ data: { workspace_id: WORKSPACE_ID }, error: null });
    mockChainResult.mockResolvedValueOnce({ data: { id: PROJECT_ID, platform: "xiaohongshu" }, error: null });
    mockChainResult.mockResolvedValueOnce({ data: null, error: { message: "not found" } });
    const { POST } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}/publishing`, {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const res = await POST(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when project not found (P1-3)", async () => {
    setupAdmin();
    mockChainResult.mockResolvedValueOnce({ data: { workspace_id: WORKSPACE_ID }, error: null });
    mockChainResult.mockResolvedValueOnce({ data: null, error: { message: "not found" } });
    const { POST } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}/publishing`, {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const res = await POST(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 500 on database error (P1-6)", async () => {
    setupAdmin();
    mockChainResult.mockResolvedValueOnce({ data: { workspace_id: WORKSPACE_ID }, error: null });
    mockChainResult.mockResolvedValueOnce({ data: { id: PROJECT_ID, platform: "xiaohongshu" }, error: null });
    mockChainResult.mockResolvedValueOnce({ data: { id: VERSION_ID }, error: null });
    mockChainResult.mockResolvedValueOnce({ data: null, error: { message: "connection refused" } });
    const { POST } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}/publishing`, {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const res = await POST(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(500);
  });

  it("returns 201 with created record", async () => {
    setupAdmin();
    mockChainResult.mockResolvedValueOnce({ data: { workspace_id: WORKSPACE_ID }, error: null });
    mockChainResult.mockResolvedValueOnce({ data: { id: PROJECT_ID, platform: "xiaohongshu" }, error: null });
    mockChainResult.mockResolvedValueOnce({ data: { id: VERSION_ID }, error: null });
    mockChainResult.mockResolvedValueOnce({
      data: { id: RECORD_ID, content_project_id: PROJECT_ID, content_version_id: VERSION_ID },
      error: null,
    });
    const { POST } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}/publishing`, {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const res = await POST(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(201);
  });
});

// ============================================================
// PATCH /api/content/projects/[id]/publishing/[recordId]
// ============================================================

describe("PATCH /api/content/projects/[id]/publishing/[recordId]", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 for unauthenticated", async () => {
    setupUser(null);
    const { PATCH } = await getDetailHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}/publishing/${RECORD_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ views: 100 }),
    });
    const res = await PATCH(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID, recordId: RECORD_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when no workspace member (P0-1)", async () => {
    setupUser("user-1");
    mockChainResult.mockResolvedValue({ data: null, error: { message: "not found" } });
    const { PATCH } = await getDetailHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}/publishing/${RECORD_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ views: 100 }),
    });
    const res = await PATCH(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID, recordId: RECORD_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 403 when missing content_factory", async () => {
    setupNonAdmin();
    const { PATCH } = await getDetailHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}/publishing/${RECORD_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ views: 100 }),
    });
    const res = await PATCH(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID, recordId: RECORD_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid body (negative views)", async () => {
    setupAdmin();
    mockChainResult.mockResolvedValueOnce({ data: { workspace_id: WORKSPACE_ID }, error: null });
    mockChainResult.mockResolvedValueOnce({ data: { id: PROJECT_ID }, error: null });
    mockChainResult.mockResolvedValueOnce({ data: { id: RECORD_ID }, error: null });
    const { PATCH } = await getDetailHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}/publishing/${RECORD_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ views: -1 }),
    });
    const res = await PATCH(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID, recordId: RECORD_ID }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty body", async () => {
    setupAdmin();
    mockChainResult.mockResolvedValueOnce({ data: { workspace_id: WORKSPACE_ID }, error: null });
    mockChainResult.mockResolvedValueOnce({ data: { id: PROJECT_ID }, error: null });
    mockChainResult.mockResolvedValueOnce({ data: { id: RECORD_ID }, error: null });
    const { PATCH } = await getDetailHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}/publishing/${RECORD_ID}`, {
      method: "PATCH",
      body: JSON.stringify({}),
    });
    const res = await PATCH(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID, recordId: RECORD_ID }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 200 with updated record", async () => {
    setupAdmin();
    mockChainResult.mockResolvedValueOnce({ data: { workspace_id: WORKSPACE_ID }, error: null });
    mockChainResult.mockResolvedValueOnce({ data: { id: PROJECT_ID }, error: null });
    mockChainResult.mockResolvedValueOnce({ data: { id: RECORD_ID }, error: null });
    mockChainResult.mockResolvedValueOnce({
      data: { id: RECORD_ID, views: 500, likes: 20 },
      error: null,
    });
    const { PATCH } = await getDetailHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}/publishing/${RECORD_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ views: 500, likes: 20 }),
    });
    const res = await PATCH(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID, recordId: RECORD_ID }),
    });
    expect(res.status).toBe(200);
  });
});
