/**
 * AI Preferences API — Route Handler Unit Tests
 * P3-AI-013
 *
 * Covers: GET list, DELETE, PATCH toggle with auth/workspace checks.
 * Uses mocked Supabase client to avoid DB dependency.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ============================================================
// Mock state
// ============================================================

let mockJsonResponse: ReturnType<typeof vi.fn>;
let mockGetUser: ReturnType<typeof vi.fn>;
let mockFrom: ReturnType<typeof vi.fn>;
let mockPendingCookies: { name: string; value: string; options: Record<string, unknown> }[];

function makeChain(overrides: Record<string, unknown> = {}) {
  let terminal: unknown = overrides.terminal ?? { data: null, error: null };

  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve(terminal)),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
  };

  return { chain, setTerminal: (t: unknown) => { terminal = t; } };
}

// ============================================================
// Mock setup
// ============================================================

vi.mock("@/lib/supabase/route-handler", () => ({
  createRouteHandlerClient: vi.fn(() => {
    mockPendingCookies = [];
    const mockClient = {
      auth: {
        getUser: mockGetUser,
      },
      from: mockFrom,
    };

    return Promise.resolve({
      client: mockClient,
      jsonResponse: mockJsonResponse,
      pendingCookies: mockPendingCookies,
    });
  }),
}));

vi.mock("@/features/ai-preferences/preference-engine", () => ({
  listPreferences: vi.fn(),
  deletePreference: vi.fn(),
  togglePreference: vi.fn(),
}));

const mockEngine = await import("@/features/ai-preferences/preference-engine");

// ============================================================
// Helpers
// ============================================================

function buildRequest(init?: { method?: string; body?: unknown }): NextRequest {
  const url = init?.body
    ? "http://localhost/api/me/ai-preferences"
    : "http://localhost/api/me/ai-preferences";
  const req = new NextRequest(url, {
    method: init?.method ?? "GET",
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
  });
  return req;
}

// ============================================================
// Tests
// ============================================================

describe("GET /api/me/ai-preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJsonResponse = vi.fn((data: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(data), {
        status: init?.status ?? 200,
        headers: init?.headers as HeadersInit,
      })
    );
    mockGetUser = vi.fn();
    mockFrom = vi.fn();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const { GET } = await import("../route");
    const res = await GET(buildRequest());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns 403 when no workspace membership", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const { chain } = makeChain({ terminal: null });
    mockFrom.mockReturnValue(chain);

    const { GET } = await import("../route");
    const res = await GET(buildRequest());

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("WORKSPACE_ACCESS_DENIED");
  });

  it("returns 200 with preferences when authenticated", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const { chain } = makeChain({
      terminal: { data: { workspace_id: "ws-1" }, error: null },
    });
    mockFrom.mockReturnValue(chain);

    const mockPrefs = [
      {
        id: "00000000-0000-0000-0000-000000000001",
        feature: "content_factory",
        preferenceKey: "tone_modified",
        preferenceValue: {
          correctionDirection: "modified",
          hint: "偏好提示",
        },
        evidenceCount: 5,
        confidence: 0.8,
        status: "active",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ];
    (mockEngine.listPreferences as ReturnType<typeof vi.fn>).mockResolvedValue(mockPrefs);

    const { GET } = await import("../route");
    const res = await GET(buildRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(mockPrefs);
    expect(body.error).toBeNull();
  });

  it("returns 200 with empty array when no preferences", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const { chain } = makeChain({
      terminal: { data: { workspace_id: "ws-1" }, error: null },
    });
    mockFrom.mockReturnValue(chain);

    (mockEngine.listPreferences as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const { GET } = await import("../route");
    const res = await GET(buildRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});

describe("DELETE /api/me/ai-preferences/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJsonResponse = vi.fn((data: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(data), {
        status: init?.status ?? 200,
        headers: init?.headers as HeadersInit,
      })
    );
    mockGetUser = vi.fn();
    mockFrom = vi.fn();
  });

  it("returns 404 when preference not found", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const { chain } = makeChain({
      terminal: { data: { workspace_id: "ws-1" }, error: null },
    });
    mockFrom.mockReturnValue(chain);

    (mockEngine.deletePreference as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const { DELETE } = await import("../[id]/route");
    const res = await DELETE(
      buildRequest({ method: "DELETE" }),
      { params: Promise.resolve({ id: "pref-1" }) }
    );

    expect(res.status).toBe(404);
  });

  it("returns 200 when preference deleted", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const { chain } = makeChain({
      terminal: { data: { workspace_id: "ws-1" }, error: null },
    });
    mockFrom.mockReturnValue(chain);

    (mockEngine.deletePreference as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    const { DELETE } = await import("../[id]/route");
    const res = await DELETE(
      buildRequest({ method: "DELETE" }),
      { params: Promise.resolve({ id: "pref-1" }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.deleted).toBe(true);
  });
});

describe("PATCH /api/me/ai-preferences/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJsonResponse = vi.fn((data: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(data), {
        status: init?.status ?? 200,
        headers: init?.headers as HeadersInit,
      })
    );
    mockGetUser = vi.fn();
    mockFrom = vi.fn();
  });

  it("returns 400 when body is not valid JSON", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const { chain } = makeChain({
      terminal: { data: { workspace_id: "ws-1" }, error: null },
    });
    mockFrom.mockReturnValue(chain);

    const req = new NextRequest("http://localhost/api/me/ai-preferences/pref-1", {
      method: "PATCH",
      body: "invalid json",
    });

    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(
      req,
      { params: Promise.resolve({ id: "pref-1" }) }
    );

    expect(res.status).toBe(400);
  });

  it("returns 400 when status is invalid", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const { chain } = makeChain({
      terminal: { data: { workspace_id: "ws-1" }, error: null },
    });
    mockFrom.mockReturnValue(chain);

    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(
      buildRequest({ method: "PATCH", body: { status: "invalid" } }),
      { params: Promise.resolve({ id: "pref-1" }) }
    );

    expect(res.status).toBe(400);
  });

  it("returns 404 when toggling non-existent preference", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const { chain } = makeChain({
      terminal: { data: { workspace_id: "ws-1" }, error: null },
    });
    mockFrom.mockReturnValue(chain);

    (mockEngine.togglePreference as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(
      buildRequest({ method: "PATCH", body: { status: "disabled" } }),
      { params: Promise.resolve({ id: "pref-1" }) }
    );

    expect(res.status).toBe(404);
  });

  it("returns 200 with updated preference on success", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const { chain } = makeChain({
      terminal: { data: { workspace_id: "ws-1" }, error: null },
    });
    mockFrom.mockReturnValue(chain);

    const updated = {
      id: "pref-1",
      feature: "content_factory",
      preferenceKey: "tone_modified",
      preferenceValue: {
        correctionDirection: "modified",
        hint: "偏好提示",
      },
      evidenceCount: 5,
      confidence: 0.8,
      status: "disabled",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    (mockEngine.togglePreference as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(
      buildRequest({ method: "PATCH", body: { status: "disabled" } }),
      { params: Promise.resolve({ id: "pref-1" }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("disabled");
  });
});
