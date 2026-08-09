/**
 * Route Handler Unit Tests — POST /api/matches/calculate
 *
 * Covers matching access after removing property_matching entitlement gate.
 * The key invariant: removing the entitlement must NOT weaken auth/workspace/RLS.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Valid UUIDs for test input bodies (zod requires uuid for clientId / propertyIds)
const U1 = "00000000-0000-4000-a000-000000000001"; // user
const WS1 = "10000000-0000-4000-a000-000000000001"; // workspace
const C1 = "20000000-0000-4000-a000-000000000001"; // client
const P1 = "30000000-0000-4000-a000-000000000001"; // property
const P2 = "30000000-0000-4000-a000-000000000002"; // property

// ---------------------------------------------------------------------------
// Shared mock helpers (same pattern as clients/__tests__/route.test.ts)
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
    ilike: vi.fn(() => chain),
    or: vi.fn(() => chain),
    in: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    order: vi.fn(() => chain),
    range: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    not: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    // Thenable — makes `await chain` resolve to terminal
    then: vi.fn((resolve: (v: unknown) => void) => {
      resolve(terminal);
      return Promise.resolve(terminal);
    }),
    single: vi.fn(() => {
      if (typeof overrides.single === "function") {
        return (overrides.single as () => unknown)();
      }
      return Promise.resolve(terminal);
    }),
    maybeSingle: vi.fn(() => {
      if (typeof overrides.maybeSingle === "function") {
        return (overrides.maybeSingle as () => unknown)();
      }
      return Promise.resolve(terminal);
    }),
  };
  return chain;
}

function resetMocks() {
  mockJsonResponse = vi.fn(
    (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => {
      const response = new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      });
      return response;
    }
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

// Mock calculateMatches — return scores so we can verify persisted results
vi.mock("@/features/matching/rule-engine", () => ({
  calculateMatches: vi.fn(() => [
    {
      propertyId: P1,
      score: 85,
      matchLevel: "excellent",
      matchedReasons: [{ code: "budget", label: "预算", scoreContribution: 30, detail: "在预算范围内" }],
      unmatchedReasons: [],
      needsConfirmation: [],
    },
    {
      propertyId: P2,
      score: 0,
      matchLevel: "low",
      matchedReasons: [],
      unmatchedReasons: [{ code: "roomType", label: "户型", detail: "户型不匹配" }],
      needsConfirmation: [],
    },
  ]),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/matches/calculate", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    resetMocks();
    const mod = await import("../calculate/route");
    POST = mod.POST;
  });

  // ─────────────────────────────────────────────────────────────────────
  // Case 1: Unauthenticated → 401
  // ─────────────────────────────────────────────────────────────────────
  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const req = new NextRequest("http://localhost/api/matches/calculate", {
      method: "POST",
      body: JSON.stringify({ clientId: C1 }),
    });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  // ─────────────────────────────────────────────────────────────────────
  // Case 2: No workspace membership → 403
  // ─────────────────────────────────────────────────────────────────────
  it("returns 403 when user has no active workspace membership", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: null, error: { code: "PGRST116" } }),
        });
      }
      return makeChain();
    });

    const req = new NextRequest("http://localhost/api/matches/calculate", {
      method: "POST",
      body: JSON.stringify({ clientId: C1 }),
    });
    const res = await POST(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("WORKSPACE_ACCESS_DENIED");
  });

  // ─────────────────────────────────────────────────────────────────────
  // Case 3: 422 invalid body (missing clientId)
  // ─────────────────────────────────────────────────────────────────────
  it("returns 422 when body is missing required fields", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members")
        return makeChain({ single: () =>
          Promise.resolve({ data: { workspace_id: WS1 }, error: null }) });
      return makeChain();
    });

    const req = new NextRequest("http://localhost/api/matches/calculate", {
      method: "POST",
      body: JSON.stringify({}), // missing clientId
    });
    const res = await POST(req);

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  // ─────────────────────────────────────────────────────────────────────
  // Case 4: Client not found in workspace → 404
  // ─────────────────────────────────────────────────────────────────────
  it("returns 404 when client does not exist in user workspace", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members")
        return makeChain({ single: () =>
          Promise.resolve({ data: { workspace_id: WS1 }, error: null }) });
      if (table === "clients")
        return makeChain({
          single: () =>
            Promise.resolve({ data: null, error: { code: "PGRST116" } }),
        });
      return makeChain();
    });

    const req = new NextRequest("http://localhost/api/matches/calculate", {
      method: "POST",
      body: JSON.stringify({ clientId: C1 }),
    });
    const res = await POST(req);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("RESOURCE_NOT_FOUND");
  });

  // ─────────────────────────────────────────────────────────────────────
  // Case 5: Cross-workspace client → 404 (security: no existence leak)
  // ─────────────────────────────────────────────────────────────────────
  it("returns 404 when client belongs to a different workspace", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members")
        return makeChain({ single: () =>
          Promise.resolve({ data: { workspace_id: WS1 }, error: null }) });
      if (table === "clients")
        return makeChain({
          single: () =>
            Promise.resolve({ data: null, error: { code: "PGRST116" } }),
        });
      return makeChain();
    });

    const req = new NextRequest("http://localhost/api/matches/calculate", {
      method: "POST",
      body: JSON.stringify({ clientId: "99999999-9999-4999-a999-999999999999" }),
    });
    const res = await POST(req);

    expect(res.status).toBe(404);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Case 6: Soft-deleted client → 404
  // ─────────────────────────────────────────────────────────────────────
  it("returns 404 when client is soft-deleted", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members")
        return makeChain({ single: () =>
          Promise.resolve({ data: { workspace_id: WS1 }, error: null }) });
      if (table === "clients")
        return makeChain({
          single: () =>
            Promise.resolve({ data: null, error: { code: "PGRST116" } }),
        });
      return makeChain();
    });

    const req = new NextRequest("http://localhost/api/matches/calculate", {
      method: "POST",
      body: JSON.stringify({ clientId: C1 }),
    });
    const res = await POST(req);

    expect(res.status).toBe(404);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Case 7: Authenticated workspace member + own client + own properties → 201
  // (NO property_matching entitlement needed — this is the core fix proof)
  // ─────────────────────────────────────────────────────────────────────
  it("returns 201 for authenticated workspace member with own client and properties (no entitlement needed)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } }, error: null });

    const wsRow = { workspace_id: WS1 };
    const clientRow = { id: C1, workspace_id: WS1, name: "Test Client" };
    const propertyRows = [
      { id: P1, workspace_id: WS1, status: "available", title: "Prop 1" },
      { id: P2, workspace_id: WS1, status: "available", title: "Prop 2" },
    ];

    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members")
        return makeChain({ single: () =>
          Promise.resolve({ data: wsRow, error: null }) });
      if (table === "clients")
        return makeChain({ single: () =>
          Promise.resolve({ data: clientRow, error: null }) });
      if (table === "properties")
        return makeChain({ terminal: { data: propertyRows, error: null } });
      if (table === "property_matches")
        return makeChain({ terminal: { data: [], error: null } });
      return makeChain();
    });

    mockRpc.mockImplementation((fn: string) => {
      if (fn === "upsert_property_match") return Promise.resolve({ error: null });
      return Promise.resolve({ data: [], error: null });
    });

    const req = new NextRequest("http://localhost/api/matches/calculate", {
      method: "POST",
      body: JSON.stringify({ clientId: C1 }),
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.error).toBeNull();
    expect(body.data).toBeDefined();
    expect(body.data.matches).toHaveLength(2);
    expect(body.data.totalProperties).toBe(2);
    expect(body.data.matchedCount).toBe(1); // P2 has score=0
  });

  // ─────────────────────────────────────────────────────────────────────
  // Case 8: Only queries properties from current workspace
  // ─────────────────────────────────────────────────────────────────────
  it("only queries properties from the current workspace", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } }, error: null });

    let propertyTableQueried = false;
    const wsRow = { workspace_id: WS1 };
    const clientRow = { id: C1, workspace_id: WS1, name: "Test Client" };

    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members")
        return makeChain({ single: () =>
          Promise.resolve({ data: wsRow, error: null }) });
      if (table === "clients")
        return makeChain({ single: () =>
          Promise.resolve({ data: clientRow, error: null }) });
      if (table === "properties") {
        propertyTableQueried = true;
        return makeChain({
          terminal: {
            data: [{ id: P1, workspace_id: WS1, status: "available" }],
            error: null,
          },
        });
      }
      if (table === "property_matches")
        return makeChain({ terminal: { data: [], error: null } });
      return makeChain();
    });

    mockRpc.mockImplementation((fn: string) => {
      if (fn === "upsert_property_match") return Promise.resolve({ error: null });
      return Promise.resolve({ data: [], error: null });
    });

    const req = new NextRequest("http://localhost/api/matches/calculate", {
      method: "POST",
      body: JSON.stringify({ clientId: C1 }),
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(propertyTableQueried).toBe(true);
    const body = await res.json();
    expect(body.data.totalProperties).toBe(1);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Case 9: Soft-deleted property excluded
  // ─────────────────────────────────────────────────────────────────────
  it("excludes soft-deleted properties from matching", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } }, error: null });

    const wsRow = { workspace_id: WS1 };
    const clientRow = { id: C1, workspace_id: WS1, name: "Test Client" };
    const propertyRows = [
      { id: P1, workspace_id: WS1, status: "available" },
    ];

    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members")
        return makeChain({ single: () =>
          Promise.resolve({ data: wsRow, error: null }) });
      if (table === "clients")
        return makeChain({ single: () =>
          Promise.resolve({ data: clientRow, error: null }) });
      if (table === "properties")
        return makeChain({ terminal: { data: propertyRows, error: null } });
      if (table === "property_matches")
        return makeChain({ terminal: { data: [], error: null } });
      return makeChain();
    });

    mockRpc.mockImplementation((fn: string) => {
      if (fn === "upsert_property_match") return Promise.resolve({ error: null });
      return Promise.resolve({ data: [], error: null });
    });

    const req = new NextRequest("http://localhost/api/matches/calculate", {
      method: "POST",
      body: JSON.stringify({ clientId: C1 }),
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.totalProperties).toBe(1);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Case 10: Property query failure → 500
  // ─────────────────────────────────────────────────────────────────────
  it("returns 500 when property query fails", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } }, error: null });

    const wsRow = { workspace_id: WS1 };
    const clientRow = { id: C1, workspace_id: WS1, name: "Test Client" };

    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members")
        return makeChain({ single: () =>
          Promise.resolve({ data: wsRow, error: null }) });
      if (table === "clients")
        return makeChain({ single: () =>
          Promise.resolve({ data: clientRow, error: null }) });
      if (table === "properties")
        return makeChain({ terminal: { data: null, error: { message: "db error" } } });
      return makeChain();
    });

    const req = new NextRequest("http://localhost/api/matches/calculate", {
      method: "POST",
      body: JSON.stringify({ clientId: C1 }),
    });
    const res = await POST(req);

    expect(res.status).toBe(500);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Case 11: Specific propertyIds narrow matching scope
  // ─────────────────────────────────────────────────────────────────────
  it("accepts specific propertyIds to narrow matching scope", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } }, error: null });

    const wsRow = { workspace_id: WS1 };
    const clientRow = { id: C1, workspace_id: WS1, name: "Test Client" };
    const propertyRows = [
      { id: P1, workspace_id: WS1, status: "available" },
    ];

    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members")
        return makeChain({ single: () =>
          Promise.resolve({ data: wsRow, error: null }) });
      if (table === "clients")
        return makeChain({ single: () =>
          Promise.resolve({ data: clientRow, error: null }) });
      if (table === "properties")
        return makeChain({ terminal: { data: propertyRows, error: null } });
      if (table === "property_matches")
        return makeChain({ terminal: { data: [], error: null } });
      return makeChain();
    });

    mockRpc.mockImplementation((fn: string) => {
      if (fn === "upsert_property_match") return Promise.resolve({ error: null });
      return Promise.resolve({ data: [], error: null });
    });

    const req = new NextRequest("http://localhost/api/matches/calculate", {
      method: "POST",
      body: JSON.stringify({ clientId: C1, propertyIds: [P1] }),
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.totalProperties).toBe(1);
  });
});
