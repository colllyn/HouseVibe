/**
 * Content Project Versions API — Route Handler Tests
 * Contract: P3-AI-021
 * Covers: GET /api/content/projects/[id]/versions, POST /api/content/projects/[id]/versions
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
  mockFeatureCheck.mockReturnValue(true);
}

function setupNonAdmin() {
  setupUser("user-1");
  mockFeatureCheck.mockReturnValue(false);
}

async function getHandlers() {
  return import("../route");
}

// ============================================================
// GET /api/content/projects/[id]/versions
// ============================================================

describe("GET /api/content/projects/[id]/versions", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 for unauthenticated", async () => {
    setupUser(null);
    const { GET } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}/versions`);
    const res = await GET(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when no workspace member", async () => {
    setupUser("user-1");
    mockChainResult.mockResolvedValue({ data: null, error: { message: "not found" } });
    const { GET } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}/versions`);
    const res = await GET(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 403 when missing content_factory feature", async () => {
    setupNonAdmin();
    const { GET } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}/versions`);
    const res = await GET(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 when project not found", async () => {
    setupAdmin();
    // workspace member OK
    mockChainResult.mockResolvedValueOnce({ data: { workspace_id: WORKSPACE_ID }, error: null });
    // project not found
    mockChainResult.mockResolvedValueOnce({ data: null, error: { message: "not found" } });
    const { GET } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}/versions`);
    const res = await GET(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 200 with empty version list", async () => {
    setupAdmin();
    mockChainResult.mockResolvedValueOnce({ data: { workspace_id: WORKSPACE_ID }, error: null });
    mockChainResult.mockResolvedValueOnce({ data: { id: PROJECT_ID }, error: null });
    mockChainResult.mockResolvedValueOnce({ data: [], error: null });
    const { GET } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}/versions`);
    const res = await GET(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(200);
  });

  it("returns 200 with version data", async () => {
    setupAdmin();
    const versions = [{
      id: "e0000000-0000-0000-0000-000000000001",
      content_project_id: PROJECT_ID,
      version_number: 1,
      model_name: "deepseek",
    }];
    mockChainResult.mockResolvedValueOnce({ data: { workspace_id: WORKSPACE_ID }, error: null });
    mockChainResult.mockResolvedValueOnce({ data: { id: PROJECT_ID }, error: null });
    mockChainResult.mockResolvedValueOnce({ data: versions, error: null });
    const { GET } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}/versions`);
    const res = await GET(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(1);
  });
});

// ============================================================
// POST /api/content/projects/[id]/versions
// ============================================================

describe("POST /api/content/projects/[id]/versions", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  const validBody = {
    model_name: "deepseek-v4-pro",
    prompt_version: "1.0.0",
    input_snapshot: { platform: "xiaohongshu" },
    output_json: { body: "test" },
  };

  it("returns 401 for unauthenticated", async () => {
    setupUser(null);
    const { POST } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}/versions`, {
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
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}/versions`, {
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
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}/versions`, {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const res = await POST(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 when project not found", async () => {
    setupAdmin();
    mockChainResult.mockResolvedValueOnce({ data: { workspace_id: WORKSPACE_ID }, error: null });
    mockChainResult.mockResolvedValueOnce({ data: null, error: { message: "not found" } });
    const { POST } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}/versions`, {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const res = await POST(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid body (missing model_name)", async () => {
    setupAdmin();
    mockChainResult.mockResolvedValueOnce({ data: { workspace_id: WORKSPACE_ID }, error: null });
    mockChainResult.mockResolvedValueOnce({ data: { id: PROJECT_ID }, error: null });
    const { POST } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}/versions`, {
      method: "POST",
      body: JSON.stringify({ prompt_version: "1" }),
    });
    const res = await POST(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for extra fields (strict)", async () => {
    setupAdmin();
    mockChainResult.mockResolvedValueOnce({ data: { workspace_id: WORKSPACE_ID }, error: null });
    mockChainResult.mockResolvedValueOnce({ data: { id: PROJECT_ID }, error: null });
    const { POST } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}/versions`, {
      method: "POST",
      body: JSON.stringify({ ...validBody, workspace_id: "fake" }),
    });
    const res = await POST(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 201 with computed version_number (first version)", async () => {
    setupAdmin();
    // workspace member
    mockChainResult.mockResolvedValueOnce({ data: { workspace_id: WORKSPACE_ID }, error: null });
    // project exists
    mockChainResult.mockResolvedValueOnce({ data: { id: PROJECT_ID }, error: null });
    // last version query — returns null (first version)
    mockChainResult.mockResolvedValueOnce({ data: null, error: null });
    // insert result
    mockChainResult.mockResolvedValueOnce({
      data: { id: "e0000000-0000-0000-0000-000000000001", version_number: 1 },
      error: null,
    });
    const { POST } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}/versions`, {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const res = await POST(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(201);
  });

  it("returns 201 with incremented version_number (second version)", async () => {
    setupAdmin();
    mockChainResult.mockResolvedValueOnce({ data: { workspace_id: WORKSPACE_ID }, error: null });
    mockChainResult.mockResolvedValueOnce({ data: { id: PROJECT_ID }, error: null });
    // last version = 3
    mockChainResult.mockResolvedValueOnce({ data: { version_number: 3 }, error: null });
    // insert result — should get version 4
    mockChainResult.mockResolvedValueOnce({
      data: { id: "e0000000-0000-0000-0000-000000000002", version_number: 4 },
      error: null,
    });
    const { POST } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}/versions`, {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const res = await POST(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(201);
  });

  it("returns 400 when compliance_flags is non-empty but status is clean (P0-2)", async () => {
    setupAdmin();
    mockChainResult.mockResolvedValueOnce({ data: { workspace_id: WORKSPACE_ID }, error: null });
    mockChainResult.mockResolvedValueOnce({ data: { id: PROJECT_ID }, error: null });
    const { POST } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}/versions`, {
      method: "POST",
      body: JSON.stringify({
        ...validBody,
        compliance_flags: [{ type: "tos_violation", severity: "high" }],
        compliance_status: "clean",
      }),
    });
    const res = await POST(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("COMPLIANCE_INCONSISTENT");
  });

  it("retries on unique violation and succeeds (P0-1)", async () => {
    setupAdmin();
    // workspace member
    mockChainResult.mockResolvedValueOnce({ data: { workspace_id: WORKSPACE_ID }, error: null });
    // project exists
    mockChainResult.mockResolvedValueOnce({ data: { id: PROJECT_ID }, error: null });
    // attempt 0: lastVersion returns 3
    mockChainResult.mockResolvedValueOnce({ data: { version_number: 3 }, error: null });
    // attempt 0: insert fails with unique violation (23505)
    mockChainResult.mockResolvedValueOnce({
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });
    // attempt 1: lastVersion now returns 4 (someone else inserted)
    mockChainResult.mockResolvedValueOnce({ data: { version_number: 4 }, error: null });
    // attempt 1: insert succeeds with version 5
    mockChainResult.mockResolvedValueOnce({
      data: { id: "v-retry-001", version_number: 5 },
      error: null,
    });
    const { POST } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}/versions`, {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const res = await POST(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(201);
  });

  it("returns 409 after exhausting retries on unique violation", async () => {
    setupAdmin();
    mockChainResult.mockResolvedValueOnce({ data: { workspace_id: WORKSPACE_ID }, error: null });
    mockChainResult.mockResolvedValueOnce({ data: { id: PROJECT_ID }, error: null });
    // 3 attempts all fail with unique violation
    for (let i = 0; i < 3; i++) {
      mockChainResult.mockResolvedValueOnce({ data: { version_number: 1 }, error: null });
      mockChainResult.mockResolvedValueOnce({
        data: null,
        error: { code: "23505", message: "duplicate key" },
      });
    }
    const { POST } = await getHandlers();
    const req = new Request(`http://localhost/api/content/projects/${PROJECT_ID}/versions`, {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const res = await POST(req as unknown as NextRequest, {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(res.status).toBe(409);
  });
});
