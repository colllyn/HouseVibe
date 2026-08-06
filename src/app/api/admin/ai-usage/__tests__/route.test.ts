/**
 * GET /api/admin/ai-usage — Route Handler Tests
 * PATCH/POST /api/admin/ai-usage/users/[userId] — Route Handler Tests
 * Contract: P3-AI-017
 * All tests use Mock Auth, Mock Supabase. No real DB calls.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// ============================================================
// Hoisted Mocks
// ============================================================

const { mockGetUser, mockFromSingle, mockRpc } = vi.hoisted(() => {
  const _mockGetUser = vi.fn();
  const _mockFromSingle = vi.fn();
  const _mockRpc = vi.fn();
  return {
    mockGetUser: _mockGetUser,
    mockFromSingle: _mockFromSingle,
    mockRpc: _mockRpc,
  };
});

function buildSupabaseClient() {
  return {
    client: {
      auth: { getUser: mockGetUser },
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mockFromSingle }) }) }),
      }),
      rpc: mockRpc,
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
  isSystemAdmin: async () => {
    const { data } = await mockGetUser();
    if (!data?.user) return false;
    const { data: admin } = await mockFromSingle();
    return admin !== null;
  },
}));

// ============================================================
// Mock data
// ============================================================

const MOCK_USAGE_SUMMARY = {
  period: "today",
  groupBy: "feature",
  totals: {
    total_tokens: 15000,
    total_cost_usd: 0.0045,
    total_requests: 12,
    succeeded: 10,
    failed: 1,
    rejected_compliance: 1,
    blocked_by_cost_limit: 0,
  },
  text: {
    total_tokens: 12000,
    total_cost_usd: 0.0036,
    total_requests: 8,
  },
  vision: {
    total_tokens: 3000,
    total_cost_usd: 0.0009,
    total_requests: 4,
  },
  groups: [
    {
      key: "text_generation",
      label: "文本生成",
      total_tokens: 12000,
      input_tokens: 6000,
      output_tokens: 6000,
      estimated_cost_usd: 0.0036,
      total_requests: 8,
      succeeded: 7,
      failed: 0,
      rejected_compliance: 1,
      blocked_by_cost_limit: 0,
      avg_cost_per_request: 0.00045,
    },
    {
      key: "visual_analysis",
      label: "视觉分析",
      total_tokens: 3000,
      input_tokens: 1000,
      output_tokens: 2000,
      estimated_cost_usd: 0.0009,
      total_requests: 4,
      succeeded: 3,
      failed: 1,
      rejected_compliance: 0,
      blocked_by_cost_limit: 0,
      avg_cost_per_request: 0.000225,
    },
  ],
  userCount: 3,
  avgCostPerUser: 0.0015,
};

function setupAdmin() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: "admin-1", email: "admin@test.com" } },
  });
  mockFromSingle.mockResolvedValue({ data: { id: "sa-1" }, error: null });
}

function setupNonAdmin() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: "user-1", email: "user@test.com" } },
  });
  mockFromSingle.mockResolvedValue({ data: null, error: null });
}

function setupNoAuth() {
  mockGetUser.mockResolvedValue({ data: { user: null } });
  mockFromSingle.mockResolvedValue({ data: null, error: null });
}

// ============================================================
// Dynamic import helper
// ============================================================

async function getHandlers() {
  return import("../route");
}

async function getUserHandlers() {
  return import("../users/[userId]/route");
}

// ============================================================
// GET /api/admin/ai-usage
// ============================================================

describe("GET /api/admin/ai-usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 for non-admin users", async () => {
    setupNonAdmin();
    const { GET } = await getHandlers();
    const req = new Request("http://localhost/api/admin/ai-usage");

    const res = await GET(req as unknown as NextRequest);
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.error.code).toBe("ADMIN_REQUIRED");
  });

  it("returns 403 for unauthenticated users", async () => {
    setupNoAuth();
    const { GET } = await getHandlers();
    const req = new Request("http://localhost/api/admin/ai-usage");

    const res = await GET(req as unknown as NextRequest);
    expect(res.status).toBe(403);
  });

  it("returns usage data for admin with defaults", async () => {
    setupAdmin();
    mockRpc.mockResolvedValue({ data: MOCK_USAGE_SUMMARY, error: null });

    const { GET } = await getHandlers();
    const req = new Request("http://localhost/api/admin/ai-usage");

    const res = await GET(req as unknown as NextRequest);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.totals.total_tokens).toBe(15000);
    expect(body.data.period).toBe("today");
    expect(body.data.groupBy).toBe("feature");
  });

  it("passes period and groupBy to RPC", async () => {
    setupAdmin();
    mockRpc.mockResolvedValue({ data: MOCK_USAGE_SUMMARY, error: null });

    const { GET } = await getHandlers();
    const req = new Request("http://localhost/api/admin/ai-usage?period=7d&groupBy=user");

    const res = await GET(req as unknown as NextRequest);
    expect(res.status).toBe(200);

    expect(mockRpc).toHaveBeenCalledWith("admin_get_ai_usage_stats", {
      p_period: "7d",
      p_group_by: "user",
    });
  });

  it("returns 400 for invalid period", async () => {
    setupAdmin();
    const { GET } = await getHandlers();
    const req = new Request("http://localhost/api/admin/ai-usage?period=invalid");

    const res = await GET(req as unknown as NextRequest);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("returns 400 for invalid groupBy", async () => {
    setupAdmin();
    const { GET } = await getHandlers();
    const req = new Request("http://localhost/api/admin/ai-usage?groupBy=color");

    const res = await GET(req as unknown as NextRequest);
    expect(res.status).toBe(400);
  });

  it("returns 500 on RPC error", async () => {
    setupAdmin();
    mockRpc.mockResolvedValue({ data: null, error: { message: "DB error" } });

    const { GET } = await getHandlers();
    const req = new Request("http://localhost/api/admin/ai-usage");

    const res = await GET(req as unknown as NextRequest);
    expect(res.status).toBe(500);
  });

  it("returns 500 when RPC data fails schema validation", async () => {
    setupAdmin();
    // Missing required 'groups' and 'userCount' fields — should fail Zod validation
    mockRpc.mockResolvedValue({
      data: {
        period: "today",
        groupBy: "feature",
        totals: { total_tokens: 0, total_cost_usd: 0, total_requests: 0, succeeded: 0, failed: 0, rejected_compliance: 0, blocked_by_cost_limit: 0 },
        text: { total_tokens: 0, total_cost_usd: 0, total_requests: 0 },
        vision: { total_tokens: 0, total_cost_usd: 0, total_requests: 0 },
        // Missing groups, userCount, avgCostPerUser
      },
      error: null,
    });

    const { GET } = await getHandlers();
    const req = new Request("http://localhost/api/admin/ai-usage");

    const res = await GET(req as unknown as NextRequest);
    expect(res.status).toBe(500);
  });

  it("returns 500 when RPC throws (catch block)", async () => {
    setupAdmin();
    mockRpc.mockRejectedValue(new Error("Connection refused"));

    const { GET } = await getHandlers();
    const req = new Request("http://localhost/api/admin/ai-usage");

    const res = await GET(req as unknown as NextRequest);
    expect(res.status).toBe(500);
  });
});

// ============================================================
// PATCH /api/admin/ai-usage/users/[userId]
// ============================================================

describe("PATCH /api/admin/ai-usage/users/[userId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 for non-admin", async () => {
    setupNonAdmin();
    const { PATCH } = await getUserHandlers();
    const req = new Request("http://localhost/api/admin/ai-usage/users/user-1", {
      method: "PATCH",
      body: JSON.stringify({ daily_request_limit: 50 }),
    });

    const res = await PATCH(req as unknown as NextRequest, {
      params: Promise.resolve({ userId: "user-1" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 403 for unauthenticated (anon)", async () => {
    setupNoAuth();
    const { PATCH } = await getUserHandlers();
    const req = new Request(
      "http://localhost/api/admin/ai-usage/users/00000000-0000-0000-0000-000000000001",
      { method: "PATCH", body: JSON.stringify({ daily_request_limit: 50 }) },
    );

    const res = await PATCH(req as unknown as NextRequest, {
      params: Promise.resolve({ userId: "00000000-0000-0000-0000-000000000001" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid UUID", async () => {
    setupAdmin();
    const { PATCH } = await getUserHandlers();
    const req = new Request("http://localhost/api/admin/ai-usage/users/not-a-uuid", {
      method: "PATCH",
      body: JSON.stringify({ daily_request_limit: 50 }),
    });

    const res = await PATCH(req as unknown as NextRequest, {
      params: Promise.resolve({ userId: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid body", async () => {
    setupAdmin();
    const { PATCH } = await getUserHandlers();
    const req = new Request(
      "http://localhost/api/admin/ai-usage/users/00000000-0000-0000-0000-000000000001",
      {
        method: "PATCH",
        body: JSON.stringify({ daily_request_limit: -1 }),
      },
    );

    const res = await PATCH(req as unknown as NextRequest, {
      params: Promise.resolve({ userId: "00000000-0000-0000-0000-000000000001" }),
    });
    expect(res.status).toBe(400);
  });

  it("updates user limits successfully", async () => {
    setupAdmin();
    mockRpc.mockResolvedValue({
      data: { success: true, id: "limit-1", user_id: "00000000-0000-0000-0000-000000000001", feature: "content_generation" },
      error: null,
    });

    const { PATCH } = await getUserHandlers();
    const req = new Request(
      "http://localhost/api/admin/ai-usage/users/00000000-0000-0000-0000-000000000001",
      {
        method: "PATCH",
        body: JSON.stringify({ daily_request_limit: 50, daily_cost_limit_usd: 20.0 }),
      },
    );

    const res = await PATCH(req as unknown as NextRequest, {
      params: Promise.resolve({ userId: "00000000-0000-0000-0000-000000000001" }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.success).toBe(true);
  });

  it("returns 400 when body is not valid JSON", async () => {
    setupAdmin();
    const { PATCH } = await getUserHandlers();
    const req = new Request(
      "http://localhost/api/admin/ai-usage/users/00000000-0000-0000-0000-000000000001",
      {
        method: "PATCH",
        body: "not json",
      },
    );

    const res = await PATCH(req as unknown as NextRequest, {
      params: Promise.resolve({ userId: "00000000-0000-0000-0000-000000000001" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 500 when RPC throws in catch block", async () => {
    setupAdmin();
    mockRpc.mockRejectedValue(new Error("Database connection lost"));

    const { PATCH } = await getUserHandlers();
    const req = new Request(
      "http://localhost/api/admin/ai-usage/users/00000000-0000-0000-0000-000000000001",
      {
        method: "PATCH",
        body: JSON.stringify({ daily_request_limit: 50 }),
      },
    );

    const res = await PATCH(req as unknown as NextRequest, {
      params: Promise.resolve({ userId: "00000000-0000-0000-0000-000000000001" }),
    });
    expect(res.status).toBe(500);
  });
});

// ============================================================
// POST /api/admin/ai-usage/users/[userId] (restore)
// ============================================================

describe("POST /api/admin/ai-usage/users/[userId] (restore)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 for non-admin", async () => {
    setupNonAdmin();
    const { POST } = await getUserHandlers();
    const req = new Request(
      "http://localhost/api/admin/ai-usage/users/00000000-0000-0000-0000-000000000001",
      { method: "POST" },
    );

    const res = await POST(req as unknown as NextRequest, {
      params: Promise.resolve({ userId: "00000000-0000-0000-0000-000000000001" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 403 for unauthenticated (anon)", async () => {
    setupNoAuth();
    const { POST } = await getUserHandlers();
    const req = new Request(
      "http://localhost/api/admin/ai-usage/users/00000000-0000-0000-0000-000000000001",
      { method: "POST" },
    );

    const res = await POST(req as unknown as NextRequest, {
      params: Promise.resolve({ userId: "00000000-0000-0000-0000-000000000001" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid UUID", async () => {
    setupAdmin();
    const { POST } = await getUserHandlers();
    const req = new Request("http://localhost/api/admin/ai-usage/users/bad-uuid", {
      method: "POST",
    });

    const res = await POST(req as unknown as NextRequest, {
      params: Promise.resolve({ userId: "bad-uuid" }),
    });
    expect(res.status).toBe(400);
  });

  it("restores user access successfully", async () => {
    setupAdmin();
    mockRpc.mockResolvedValue({
      data: {
        success: true,
        user_id: "00000000-0000-0000-0000-000000000001",
        feature: "content_generation",
        message: "用户 AI 访问已恢复",
      },
      error: null,
    });

    const { POST } = await getUserHandlers();
    const req = new Request(
      "http://localhost/api/admin/ai-usage/users/00000000-0000-0000-0000-000000000001",
      { method: "POST" },
    );

    const res = await POST(req as unknown as NextRequest, {
      params: Promise.resolve({ userId: "00000000-0000-0000-0000-000000000001" }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.success).toBe(true);
    expect(body.data.message).toBe("用户 AI 访问已恢复");
  });

  it("returns 400 on RPC error", async () => {
    setupAdmin();
    mockRpc.mockResolvedValue({ data: { success: false }, error: { message: "User not found" } });

    const { POST } = await getUserHandlers();
    const req = new Request(
      "http://localhost/api/admin/ai-usage/users/00000000-0000-0000-0000-000000000001",
      { method: "POST" },
    );

    const res = await POST(req as unknown as NextRequest, {
      params: Promise.resolve({ userId: "00000000-0000-0000-0000-000000000001" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 500 when RPC throws in catch block", async () => {
    setupAdmin();
    mockRpc.mockRejectedValue(new Error("Database connection lost"));

    const { POST } = await getUserHandlers();
    const req = new Request(
      "http://localhost/api/admin/ai-usage/users/00000000-0000-0000-0000-000000000001",
      { method: "POST" },
    );

    const res = await POST(req as unknown as NextRequest, {
      params: Promise.resolve({ userId: "00000000-0000-0000-0000-000000000001" }),
    });
    expect(res.status).toBe(500);
  });
});
