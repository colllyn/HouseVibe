/**
 * Route Handler Unit Tests — GET /api/clients/[id]/matches & GET /api/properties/[id]/matches
 *
 * Covers matching list access after removing property_matching entitlement gate.
 * Key invariant: removing the entitlement must NOT weaken auth/workspace isolation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Shared mock helpers
// ---------------------------------------------------------------------------

let mockJsonResponse: ReturnType<typeof vi.fn>;
let mockGetUser: ReturnType<typeof vi.fn>;
let mockFrom: ReturnType<typeof vi.fn>;
let mockRpc: ReturnType<typeof vi.fn>;

function makeChain(overrides: Record<string, unknown> = {}) {
  const terminal: unknown = overrides.terminal ?? { data: null, error: null };
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    // Thenable — makes `await chain` resolve to terminal
    then: vi.fn((resolve: (v: unknown) => void) => {
      resolve(terminal);
      return Promise.resolve(terminal);
    }),
    maybeSingle: vi.fn(() => {
      if (typeof overrides.maybeSingle === "function")
        return (overrides.maybeSingle as () => unknown)();
      return Promise.resolve(terminal);
    }),
    single: vi.fn(() => {
      if (typeof overrides.single === "function")
        return (overrides.single as () => unknown)();
      return Promise.resolve(terminal);
    }),
  };
  return chain;
}

function resetMocks() {
  mockJsonResponse = vi.fn(
    (body: unknown, init?: { status?: number; headers?: Record<string, string> }) =>
      new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      })
  );
  mockGetUser = vi.fn();
  mockRpc = vi.fn();
  mockFrom = vi.fn((_table: string) => makeChain());
}

vi.mock("@/lib/supabase/route-handler", () => ({
  createRouteHandlerClient: vi.fn(() =>
    Promise.resolve({
      client: {
        auth: { getUser: mockGetUser },
        from: mockFrom,
        rpc: mockRpc,
      },
      jsonResponse: mockJsonResponse,
    })
  ),
}));

// ---------------------------------------------------------------------------
// GET /api/clients/[id]/matches
// ---------------------------------------------------------------------------

describe("GET /api/clients/[id]/matches", () => {
  let GET: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    resetMocks();
    // Import from src/app/api/matches/__tests__/
    // Up 2 levels to src/app/api/, then into clients/[id]/matches/route
    const mod = await import("../../clients/[id]/matches/route");
    GET = mod.GET;
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await GET(
      new NextRequest("http://localhost/api/clients/c1/matches"),
      { params: Promise.resolve({ id: "c1" }) }
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns 403 when user has no workspace membership", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members")
        return makeChain({
          single: () =>
            Promise.resolve({ data: null, error: { code: "PGRST116" } }),
        });
      return makeChain();
    });

    const res = await GET(
      new NextRequest("http://localhost/api/clients/c1/matches"),
      { params: Promise.resolve({ id: "c1" }) }
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("WORKSPACE_ACCESS_DENIED");
  });

  it("returns 404 when client does not exist in workspace", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members")
        return makeChain({ single: () =>
          Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }) });
      if (table === "clients")
        return makeChain({
          single: () =>
            Promise.resolve({ data: null, error: { code: "PGRST116" } }),
        });
      return makeChain();
    });

    const res = await GET(
      new NextRequest("http://localhost/api/clients/c1/matches"),
      { params: Promise.resolve({ id: "c1" }) }
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("RESOURCE_NOT_FOUND");
  });

  it("returns 200 with matches for valid workspace member (no entitlement needed)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    const matchRows = [
      {
        id: "m1",
        property_id: "prop-1",
        score: 85,
        match_level: "excellent",
        matched_reasons: ["预算匹配"],
        unmatched_reasons: [],
        needs_confirmation: false,
        status: "active",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ];

    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members")
        return makeChain({ single: () =>
          Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }) });
      if (table === "clients")
        return makeChain({ single: () =>
          Promise.resolve({ data: { id: "c1" }, error: null }) });
      if (table === "properties")
        return makeChain({
          maybeSingle: () =>
            Promise.resolve({ data: { title: "Prop 1", district: "朝阳" }, error: null }),
        });
      return makeChain();
    });

    mockRpc.mockResolvedValue({ data: matchRows, error: null });

    const res = await GET(
      new NextRequest("http://localhost/api/clients/c1/matches"),
      { params: Promise.resolve({ id: "c1" }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error).toBeNull();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].propertyTitle).toBe("Prop 1");
  });

  it("returns 401 on RPC authentication error", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members")
        return makeChain({ single: () =>
          Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }) });
      if (table === "clients")
        return makeChain({ single: () =>
          Promise.resolve({ data: { id: "c1" }, error: null }) });
      return makeChain();
    });
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "Authentication required" },
    });

    const res = await GET(
      new NextRequest("http://localhost/api/clients/c1/matches"),
      { params: Promise.resolve({ id: "c1" }) }
    );

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/properties/[id]/matches
// ---------------------------------------------------------------------------

describe("GET /api/properties/[id]/matches", () => {
  let GET: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    resetMocks();
    const mod = await import("../../properties/[id]/matches/route");
    GET = mod.GET;
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await GET(
      new NextRequest("http://localhost/api/properties/p1/matches"),
      { params: Promise.resolve({ id: "p1" }) }
    );

    expect(res.status).toBe(401);
  });

  it("returns 404 when property does not exist in workspace", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members")
        return makeChain({ single: () =>
          Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }) });
      if (table === "properties")
        return makeChain({
          single: () =>
            Promise.resolve({ data: null, error: { code: "PGRST116" } }),
        });
      return makeChain();
    });

    const res = await GET(
      new NextRequest("http://localhost/api/properties/p1/matches"),
      { params: Promise.resolve({ id: "p1" }) }
    );

    expect(res.status).toBe(404);
  });

  it("returns 200 with matched clients for valid property (no entitlement needed)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    const matchRows = [
      {
        id: "m1",
        client_id: "client-1",
        score: 80,
        match_level: "good",
        matched_reasons: ["位置匹配"],
        unmatched_reasons: [],
        needs_confirmation: false,
        status: "active",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ];

    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members")
        return makeChain({ single: () =>
          Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }) });
      if (table === "properties")
        return makeChain({ single: () =>
          Promise.resolve({ data: { id: "p1" }, error: null }) });
      if (table === "clients")
        return makeChain({
          maybeSingle: () =>
            Promise.resolve({ data: { name: "Test Client" }, error: null }),
        });
      return makeChain();
    });

    mockRpc.mockResolvedValue({ data: matchRows, error: null });

    const res = await GET(
      new NextRequest("http://localhost/api/properties/p1/matches"),
      { params: Promise.resolve({ id: "p1" }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].clientName).toBe("Test Client");
  });
});
