/**
 * GET /api/admin/ai-corrections — Route Handler Tests
 * Contract: P3-AI-019
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

const MOCK_CORRECTIONS_SUMMARY = {
  period: { days: 30, feature: null },
  totals: {
    total_corrections: 150,
    active_users: 12,
    affected_entities: 45,
    feedback_count: 80,
    avg_feedback_score: 3.5,
    negative_feedback_count: 20,
    negative_feedback_users: 8,
  },
  topCorrectedFields: [
    { field: "price", count: 42, lastCorrectedAt: "2026-08-05T00:00:00Z" },
    { field: "description", count: 30, lastCorrectedAt: "2026-08-04T00:00:00Z" },
  ],
  valueMappings: [
    {
      field: "price",
      examples: [
        { originalValue: "5000", correctedValue: "5500" },
      ],
    },
  ],
  feedbackByFeature: [
    { feature: "content_factory", total: 100, withFeedback: 80, negativeFeedback: 15, negativeRate: 18.8, avgScore: 3.8 },
  ],
  correctionByPrompt: [
    { promptVersion: "1", totalCorrections: 80, uniqueUsers: 8, avgFieldsChanged: 2.5 },
    { promptVersion: "2", totalCorrections: 70, uniqueUsers: 6, avgFieldsChanged: 1.8 },
  ],
  preferenceEffectiveness: [
    { hasPreferences: true, userCount: 5, avgCorrectionsPerUser: 8.5, avgFeedbackScore: 4.2 },
    { hasPreferences: false, userCount: 7, avgCorrectionsPerUser: 15.3, avgFeedbackScore: 3.1 },
  ],
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

async function getHandlers() {
  return import("../route");
}

// ============================================================
// GET /api/admin/ai-corrections
// ============================================================

describe("GET /api/admin/ai-corrections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 for non-admin users", async () => {
    setupNonAdmin();
    const { GET } = await getHandlers();
    const req = new Request("http://localhost/api/admin/ai-corrections");

    const res = await GET(req as unknown as NextRequest);
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.error.code).toBe("ADMIN_REQUIRED");
  });

  it("returns 403 for unauthenticated users", async () => {
    setupNoAuth();
    const { GET } = await getHandlers();
    const req = new Request("http://localhost/api/admin/ai-corrections");

    const res = await GET(req as unknown as NextRequest);
    expect(res.status).toBe(403);
  });

  it("returns corrections summary for admin with defaults", async () => {
    setupAdmin();
    mockRpc.mockResolvedValue({ data: MOCK_CORRECTIONS_SUMMARY, error: null });

    const { GET } = await getHandlers();
    const req = new Request("http://localhost/api/admin/ai-corrections");

    const res = await GET(req as unknown as NextRequest);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.totals.total_corrections).toBe(150);
    expect(body.data.totals.active_users).toBe(12);
    expect(body.data.topCorrectedFields).toHaveLength(2);
  });

  it("passes feature and days to RPC", async () => {
    setupAdmin();
    mockRpc.mockResolvedValue({ data: MOCK_CORRECTIONS_SUMMARY, error: null });

    const { GET } = await getHandlers();
    const req = new Request("http://localhost/api/admin/ai-corrections?feature=content_factory&days=14");

    const res = await GET(req as unknown as NextRequest);
    expect(res.status).toBe(200);

    expect(mockRpc).toHaveBeenCalledWith("admin_get_ai_corrections_stats", {
      p_feature: "content_factory",
      p_days: 14,
    });
  });

  it("returns 400 for invalid days value", async () => {
    setupAdmin();
    const { GET } = await getHandlers();
    const req = new Request("http://localhost/api/admin/ai-corrections?days=0");

    const res = await GET(req as unknown as NextRequest);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("returns 400 for days > 365", async () => {
    setupAdmin();
    const { GET } = await getHandlers();
    const req = new Request("http://localhost/api/admin/ai-corrections?days=400");

    const res = await GET(req as unknown as NextRequest);
    expect(res.status).toBe(400);
  });

  it("returns 500 on RPC error", async () => {
    setupAdmin();
    mockRpc.mockResolvedValue({ data: null, error: { message: "DB error" } });

    const { GET } = await getHandlers();
    const req = new Request("http://localhost/api/admin/ai-corrections");

    const res = await GET(req as unknown as NextRequest);
    expect(res.status).toBe(500);
  });

  it("returns 500 when RPC data fails schema validation", async () => {
    setupAdmin();
    mockRpc.mockResolvedValue({
      data: { period: { days: 30, feature: null } }, // Missing all other fields
      error: null,
    });

    const { GET } = await getHandlers();
    const req = new Request("http://localhost/api/admin/ai-corrections");

    const res = await GET(req as unknown as NextRequest);
    expect(res.status).toBe(500);
  });

  it("returns 500 when RPC throws in catch block", async () => {
    setupAdmin();
    mockRpc.mockRejectedValue(new Error("Connection refused"));

    const { GET } = await getHandlers();
    const req = new Request("http://localhost/api/admin/ai-corrections");

    const res = await GET(req as unknown as NextRequest);
    expect(res.status).toBe(500);
  });
});
