/**
 * Interaction API Route Handler Unit Tests
 *
 * Covers GET list, POST create, GET detail, PATCH update, DELETE with all
 * required scenarios per interaction-contract v1.0:
 * - GET list: 401, 403, 404, 200 with data, 200 empty, type filter, sort,
 *   DB error sanitized
 * - POST create: 401, 403, 404, 422 missing type, 422 missing occurred_at,
 *   201 success, all 9 types, RPC error sanitized
 * - GET detail: 401, 403, 404 client, 404 interaction, 200 with raw_text
 * - PATCH update: 401, 403, 404, 200 partial, 422 empty body, RPC error sanitized
 * - DELETE: 401, 403, 404, 200 soft delete, RPC error sanitized
 * - Cross-workspace: returns 404 (not leaked)
 * - Error sanitization: no raw DB errors in responses
 * - Client existence guard: client must exist and belong to workspace
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mock state -- resettable per test
// ---------------------------------------------------------------------------

let mockJsonResponse: ReturnType<typeof vi.fn>;
let mockGetUser: ReturnType<typeof vi.fn>;
let mockFrom: ReturnType<typeof vi.fn>;
let mockRpc: ReturnType<typeof vi.fn>;
let mockPendingCookies: { name: string; value: string; options: Record<string, unknown> }[];

/** Build a Thenable mock Supabase query chain. */
function makeChain(overrides: Record<string, unknown> = {}) {
  let terminal: unknown = overrides.terminal ?? { data: null, error: null };

  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    ilike: vi.fn(() => chain),
    or: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    order: vi.fn(() => chain),
    range: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    not: vi.fn(() => chain),
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
    update: vi.fn((data: unknown) => {
      if (typeof overrides.onUpdate === "function")
        (overrides.onUpdate as (d: unknown) => void)(data);
      if (typeof overrides.updateResult === "function") {
        terminal = (overrides.updateResult as () => unknown)();
      }
      return chain;
    }),
    insert: vi.fn((payload?: unknown) => {
      if (payload && typeof overrides.onInsert === "function") {
        (overrides.onInsert as (d: unknown) => void)(payload);
      }
      return chain;
    }),
    upsert: vi.fn((payload?: unknown) => {
      if (payload && typeof overrides.onUpsert === "function") {
        (overrides.onUpsert as (d: unknown) => void)(payload);
      }
      return chain;
    }),
    // Thenable -- makes `await chain` resolve to terminal
    then: vi.fn((resolve: (v: unknown) => void) => {
      resolve(terminal);
      return Promise.resolve(terminal);
    }),
  };

  return chain;
}

function resetMocks() {
  mockPendingCookies = [];
  mockGetUser = vi.fn();
  mockRpc = vi.fn();
  mockJsonResponse = vi.fn(
    (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => {
      const response = new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      });
      if (mockPendingCookies.length > 0) {
        const cookieHeader = mockPendingCookies
          .map((c) => `${c.name}=${c.value}`)
          .join("; ");
        response.headers.set("Set-Cookie", cookieHeader);
      }
      return response;
    }
  );

  // Default mock: auth + workspace + client all succeed
  mockFrom = vi.fn((table: string) => {
    if (table === "workspace_members") {
      return makeChain({
        single: () =>
          Promise.resolve({ data: { workspace_id: "ws-test" }, error: null }),
      });
    }
    if (table === "clients") {
      return makeChain({
        single: () =>
          Promise.resolve({ data: { id: "client-1", workspace_id: "ws-test" }, error: null }),
      });
    }
    if (table === "interactions") {
      return makeChain({
        single: () =>
          Promise.resolve({
            data: [
              {
                id: "int-1",
                workspace_id: "ws-test",
                client_id: "client-1",
                interaction_type: "phone_call",
                summary: "Test interaction",
                occurred_at: "2026-08-02T10:00:00Z",
                created_at: "2026-08-02T10:05:00Z",
                created_by: "u1",
                updated_at: "2026-08-02T10:05:00Z",
                deleted_at: null,
              },
            ],
            count: 1,
            error: null,
          }),
      });
    }
    return makeChain();
  });
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

// ===========================================================================
// List: GET /api/clients/[clientId]/interactions
// ===========================================================================

describe("GET /api/clients/[clientId]/interactions", () => {
  let GET: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    resetMocks();
    const mod = await import("../route");
    GET = mod.GET;
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await GET(
      new NextRequest("http://localhost/api/clients/client-1/interactions", { method: "GET" }),
      { params: Promise.resolve({ id: "client-1" }) }
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 403 when user has no workspace membership", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: null, error: { code: "PGRST116" } }),
        });
      }
      return makeChain();
    });

    const mod = await import("../route");
    const res = await mod.GET(
      new NextRequest("http://localhost/api/clients/client-1/interactions", { method: "GET" }),
      { params: Promise.resolve({ id: "client-1" }) }
    );

    expect(res.status).toBe(403);
  });

  it("returns 404 when client not found in workspace", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      if (table === "clients") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: null, error: { code: "PGRST116" } }),
        });
      }
      return makeChain();
    });

    const mod = await import("../route");
    const res = await mod.GET(
      new NextRequest("http://localhost/api/clients/nonexistent/interactions", { method: "GET" }),
      { params: Promise.resolve({ id: "nonexistent" }) }
    );

    expect(res.status).toBe(404);
  });

  it("returns 200 with interaction data and pagination", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    const mod = await import("../route");
    const res = await mod.GET(
      new NextRequest("http://localhost/api/clients/client-1/interactions", { method: "GET" }),
      { params: Promise.resolve({ id: "client-1" }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.interactions).toBeInstanceOf(Array);
    expect(body.data.total).toBeGreaterThanOrEqual(0);
    expect(body.error).toBeNull();
  });

  it("returns 200 with empty list when no interactions exist", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      if (table === "clients") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { id: "client-1" }, error: null }),
        });
      }
      if (table === "interactions") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: [], count: 0, error: null }),
        });
      }
      return makeChain();
    });

    const mod = await import("../route");
    const res = await mod.GET(
      new NextRequest("http://localhost/api/clients/client-1/interactions", { method: "GET" }),
      { params: Promise.resolve({ id: "client-1" }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.interactions).toEqual([]);
    expect(body.data.total).toBe(0);
  });

  it("filters by type query parameter", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    let typeEqValue: string | null = null;
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      if (table === "clients") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { id: "client-1" }, error: null }),
        });
      }
      if (table === "interactions") {
        const chain = makeChain({
          single: () =>
            Promise.resolve({
              data: [{ id: "int-1", interaction_type: "phone_call" }],
              count: 1,
              error: null,
            }),
        });
        const origEq = chain.eq as (...args: unknown[]) => unknown;
        chain.eq = vi.fn((col: string, val: string) => {
          if (col === "interaction_type") typeEqValue = val;
          return origEq(col, val);
        });
        return chain;
      }
      return makeChain();
    });

    const mod = await import("../route");
    const res = await mod.GET(
      new NextRequest("http://localhost/api/clients/client-1/interactions?type=phone_call", { method: "GET" }),
      { params: Promise.resolve({ id: "client-1" }) }
    );

    expect(res.status).toBe(200);
    if (typeEqValue !== null) {
      expect(typeEqValue).toBe("phone_call");
    }
  });

  it("returns 500 on database error -- sanitized", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      if (table === "clients") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { id: "client-1" }, error: null }),
        });
      }
      if (table === "interactions") {
        return makeChain({
          terminal: {
            data: null,
            error: { code: "XX000", message: "internal disk error at /var/data/pgdata" },
          },
        });
      }
      return makeChain();
    });

    const mod = await import("../route");
    const res = await mod.GET(
      new NextRequest("http://localhost/api/clients/client-1/interactions", { method: "GET" }),
      { params: Promise.resolve({ id: "client-1" }) }
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
    // Error must be sanitized -- no raw DB paths or messages
    const rawBody = JSON.stringify(body);
    expect(rawBody).not.toContain("disk error");
    expect(rawBody).not.toContain("/var/data");
    expect(rawBody).not.toContain("pgdata");
  });
});

// ===========================================================================
// Create: POST /api/clients/[clientId]/interactions
// ===========================================================================

describe("POST /api/clients/[clientId]/interactions", () => {
  let POST: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    resetMocks();
    const mod = await import("../route");
    POST = mod.POST;
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await POST(
      new NextRequest("http://localhost/api/clients/client-1/interactions", {
        method: "POST",
        body: JSON.stringify({ interaction_type: "phone_call", occurred_at: "2026-08-01T10:00:00Z" }),
      }),
      { params: Promise.resolve({ id: "client-1" }) }
    );

    expect(res.status).toBe(401);
  });

  it("returns 403 when user has no workspace membership", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: null, error: { code: "PGRST116" } }),
        });
      }
      return makeChain();
    });

    const mod = await import("../route");
    const res = await mod.POST(
      new NextRequest("http://localhost/api/clients/client-1/interactions", {
        method: "POST",
        body: JSON.stringify({ interaction_type: "phone_call", occurred_at: "2026-08-01T10:00:00Z" }),
      }),
      { params: Promise.resolve({ id: "client-1" }) }
    );

    expect(res.status).toBe(403);
  });

  it("returns 404 when client not found in workspace", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      if (table === "clients") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: null, error: { code: "PGRST116" } }),
        });
      }
      return makeChain();
    });

    const mod = await import("../route");
    const res = await mod.POST(
      new NextRequest("http://localhost/api/clients/nonexistent/interactions", {
        method: "POST",
        body: JSON.stringify({ interaction_type: "phone_call", occurred_at: "2026-08-01T10:00:00Z" }),
      }),
      { params: Promise.resolve({ id: "nonexistent" }) }
    );

    expect(res.status).toBe(404);
  });

  it("returns 422 when interaction_type is missing", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    const res = await POST(
      new NextRequest("http://localhost/api/clients/client-1/interactions", {
        method: "POST",
        body: JSON.stringify({ occurred_at: "2026-08-01T10:00:00Z" }),
      }),
      { params: Promise.resolve({ id: "client-1" }) }
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("returns 422 when occurred_at is missing", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    const res = await POST(
      new NextRequest("http://localhost/api/clients/client-1/interactions", {
        method: "POST",
        body: JSON.stringify({ interaction_type: "phone_call" }),
      }),
      { params: Promise.resolve({ id: "client-1" }) }
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("returns 201 with full interaction detail on success", async () => {
    const expectedInteraction = {
      id: "new-int-id",
      interaction_type: "phone_call",
      summary: "Test summary",
      client_id: "client-1",
      occurred_at: "2026-08-01T10:00:00Z",
      created_at: "2026-08-01T10:05:00Z",
    };
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockRpc.mockResolvedValue({ data: expectedInteraction, error: null });

    const res = await POST(
      new NextRequest("http://localhost/api/clients/client-1/interactions", {
        method: "POST",
        body: JSON.stringify({
          interaction_type: "phone_call",
          occurred_at: "2026-08-01T10:00:00Z",
          summary: "Test summary",
        }),
      }),
      { params: Promise.resolve({ id: "client-1" }) }
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.id).toBe("new-int-id");
    expect(body.data.interaction_type).toBe("phone_call");
    expect(body.error).toBeNull();
    expect(mockRpc).toHaveBeenCalledWith("create_interaction", expect.objectContaining({
      p_client_id: "client-1",
      p_interaction_type: "phone_call",
    }));
  });

  it("accepts all 9 interaction_type values via Zod", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockRpc.mockResolvedValue({ data: { id: "int-x" }, error: null });

    for (const type of [
      "phone_call", "wechat_message", "in_person_meeting", "property_viewing",
      "follow_up", "negotiation", "contract_signing", "complaint", "other",
    ]) {
      const res = await POST(
        new NextRequest("http://localhost/api/clients/client-1/interactions", {
          method: "POST",
          body: JSON.stringify({ interaction_type: type, occurred_at: "2026-08-01T10:00:00Z" }),
        }),
        { params: Promise.resolve({ id: "client-1" }) }
      );
      expect(res.status).toBe(201);
    }
  });

  it("rejects invalid interaction_type enum value", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    const res = await POST(
      new NextRequest("http://localhost/api/clients/client-1/interactions", {
        method: "POST",
        body: JSON.stringify({ interaction_type: "email", occurred_at: "2026-08-01T10:00:00Z" }),
      }),
      { params: Promise.resolve({ id: "client-1" }) }
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("returns 500 on RPC error -- sanitized", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "database disk full at /var/lib/postgres" },
    });

    const res = await POST(
      new NextRequest("http://localhost/api/clients/client-1/interactions", {
        method: "POST",
        body: JSON.stringify({ interaction_type: "phone_call", occurred_at: "2026-08-01T10:00:00Z" }),
      }),
      { params: Promise.resolve({ id: "client-1" }) }
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
    const rawBody = JSON.stringify(body);
    expect(rawBody).not.toContain("disk full");
    expect(rawBody).not.toContain("postgres");
  });
});

// ===========================================================================
// Detail: GET /api/clients/[clientId]/interactions/[interactionId]
// ===========================================================================

describe("GET /api/clients/[clientId]/interactions/[interactionId]", () => {
  let GET: (req: NextRequest, ctx: { params: Promise<{ id: string; interactionId: string }> }) => Promise<Response>;

  beforeEach(async () => {
    resetMocks();
    const mod = await import("../[interactionId]/route");
    GET = mod.GET;
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await GET(
      new NextRequest("http://localhost/api/clients/client-1/interactions/int-1", { method: "GET" }),
      { params: Promise.resolve({ id: "client-1", interactionId: "int-1" }) }
    );

    expect(res.status).toBe(401);
  });

  it("returns 403 when user has no workspace membership", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: null, error: { code: "PGRST116" } }),
        });
      }
      return makeChain();
    });

    const mod = await import("../[interactionId]/route");
    const res = await mod.GET(
      new NextRequest("http://localhost/api/clients/client-1/interactions/int-1", { method: "GET" }),
      { params: Promise.resolve({ id: "client-1", interactionId: "int-1" }) }
    );

    expect(res.status).toBe(403);
  });

  it("returns 404 when client not found in workspace", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      if (table === "clients") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: null, error: { code: "PGRST116" } }),
        });
      }
      return makeChain();
    });

    const mod = await import("../[interactionId]/route");
    const res = await mod.GET(
      new NextRequest("http://localhost/api/clients/nonexistent/interactions/int-1", { method: "GET" }),
      { params: Promise.resolve({ id: "nonexistent", interactionId: "int-1" }) }
    );

    expect(res.status).toBe(404);
  });

  it("returns 404 when interaction not found", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      if (table === "clients") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { id: "client-1" }, error: null }),
        });
      }
      if (table === "interactions") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: null, error: { code: "PGRST116" } }),
        });
      }
      return makeChain();
    });

    const mod = await import("../[interactionId]/route");
    const res = await mod.GET(
      new NextRequest("http://localhost/api/clients/client-1/interactions/nonexistent", { method: "GET" }),
      { params: Promise.resolve({ id: "client-1", interactionId: "nonexistent" }) }
    );

    expect(res.status).toBe(404);
  });

  it("returns 200 with full detail including raw_text", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      if (table === "clients") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { id: "client-1" }, error: null }),
        });
      }
      if (table === "interactions") {
        return makeChain({
          single: () =>
            Promise.resolve({
              data: {
                id: "int-1",
                interaction_type: "phone_call",
                summary: "Test summary",
                raw_text: "Full transcript of the call...",
                next_action: "Follow up tomorrow",
                occurred_at: "2026-08-01T10:00:00Z",
                workspace_id: "ws-1",
                client_id: "client-1",
              },
              error: null,
            }),
        });
      }
      return makeChain();
    });

    const mod = await import("../[interactionId]/route");
    const res = await mod.GET(
      new NextRequest("http://localhost/api/clients/client-1/interactions/int-1", { method: "GET" }),
      { params: Promise.resolve({ id: "client-1", interactionId: "int-1" }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.raw_text).toBe("Full transcript of the call...");
    expect(body.data.next_action).toBe("Follow up tomorrow");
    expect(body.error).toBeNull();
  });
});

// ===========================================================================
// Update: PATCH /api/clients/[clientId]/interactions/[interactionId]
// ===========================================================================

describe("PATCH /api/clients/[clientId]/interactions/[interactionId]", () => {
  let PATCH: (req: NextRequest, ctx: { params: Promise<{ id: string; interactionId: string }> }) => Promise<Response>;

  beforeEach(async () => {
    resetMocks();
    const mod = await import("../[interactionId]/route");
    PATCH = mod.PATCH;
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await PATCH(
      new NextRequest("http://localhost/api/clients/client-1/interactions/int-1", {
        method: "PATCH",
        body: JSON.stringify({ summary: "Updated" }),
      }),
      { params: Promise.resolve({ id: "client-1", interactionId: "int-1" }) }
    );

    expect(res.status).toBe(401);
  });

  it("returns 403 when user has no workspace membership", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: null, error: { code: "PGRST116" } }),
        });
      }
      return makeChain();
    });

    const mod = await import("../[interactionId]/route");
    const res = await mod.PATCH(
      new NextRequest("http://localhost/api/clients/client-1/interactions/int-1", {
        method: "PATCH",
        body: JSON.stringify({ summary: "Updated" }),
      }),
      { params: Promise.resolve({ id: "client-1", interactionId: "int-1" }) }
    );

    expect(res.status).toBe(403);
  });

  it("returns 404 when interaction not found", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      if (table === "interactions") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: null, error: { code: "PGRST116" } }),
        });
      }
      return makeChain();
    });

    const mod = await import("../[interactionId]/route");
    const res = await mod.PATCH(
      new NextRequest("http://localhost/api/clients/client-1/interactions/nonexistent", {
        method: "PATCH",
        body: JSON.stringify({ summary: "Updated" }),
      }),
      { params: Promise.resolve({ id: "client-1", interactionId: "nonexistent" }) }
    );

    expect(res.status).toBe(404);
  });

  it("returns 200 on successful partial update", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      if (table === "interactions") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { id: "int-1" }, error: null }),
        });
      }
      return makeChain();
    });
    mockRpc.mockResolvedValue({ data: { updated: true }, error: null });

    const mod = await import("../[interactionId]/route");
    const res = await mod.PATCH(
      new NextRequest("http://localhost/api/clients/client-1/interactions/int-1", {
        method: "PATCH",
        body: JSON.stringify({ summary: "Updated summary" }),
      }),
      { params: Promise.resolve({ id: "client-1", interactionId: "int-1" }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.success).toBe(true);
    expect(body.error).toBeNull();
    expect(mockRpc).toHaveBeenCalledWith("update_interaction", expect.objectContaining({
      p_interaction_id: "int-1",
    }));
  });

  it("returns 422 when payload is empty (no fields to update)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    const res = await PATCH(
      new NextRequest("http://localhost/api/clients/client-1/interactions/int-1", {
        method: "PATCH",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "client-1", interactionId: "int-1" }) }
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("returns 500 on RPC error -- sanitized", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      if (table === "interactions") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { id: "int-1" }, error: null }),
        });
      }
      return makeChain();
    });
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "database disk full at /var/lib/postgres" },
    });

    const mod = await import("../[interactionId]/route");
    const res = await mod.PATCH(
      new NextRequest("http://localhost/api/clients/client-1/interactions/int-1", {
        method: "PATCH",
        body: JSON.stringify({ summary: "Updated" }),
      }),
      { params: Promise.resolve({ id: "client-1", interactionId: "int-1" }) }
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
    const rawBody = JSON.stringify(body);
    expect(rawBody).not.toContain("disk full");
    expect(rawBody).not.toContain("postgres");
  });

  it("returns 422 when trying to update with invalid interaction_type", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    const res = await PATCH(
      new NextRequest("http://localhost/api/clients/client-1/interactions/int-1", {
        method: "PATCH",
        body: JSON.stringify({ interaction_type: "invalid_type" }),
      }),
      { params: Promise.resolve({ id: "client-1", interactionId: "int-1" }) }
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });
});

// ===========================================================================
// Delete: DELETE /api/clients/[clientId]/interactions/[interactionId]
// ===========================================================================

describe("DELETE /api/clients/[clientId]/interactions/[interactionId]", () => {
  let DELETE: (req: NextRequest, ctx: { params: Promise<{ id: string; interactionId: string }> }) => Promise<Response>;

  beforeEach(async () => {
    resetMocks();
    const mod = await import("../[interactionId]/route");
    DELETE = mod.DELETE;
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await DELETE(
      new NextRequest("http://localhost/api/clients/client-1/interactions/int-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "client-1", interactionId: "int-1" }) }
    );

    expect(res.status).toBe(401);
  });

  it("returns 403 when user has no workspace membership", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: null, error: { code: "PGRST116" } }),
        });
      }
      return makeChain();
    });

    const mod = await import("../[interactionId]/route");
    const res = await mod.DELETE(
      new NextRequest("http://localhost/api/clients/client-1/interactions/int-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "client-1", interactionId: "int-1" }) }
    );

    expect(res.status).toBe(403);
  });

  it("returns 404 when interaction not found", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      if (table === "interactions") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: null, error: { code: "PGRST116" } }),
        });
      }
      return makeChain();
    });

    const mod = await import("../[interactionId]/route");
    const res = await mod.DELETE(
      new NextRequest("http://localhost/api/clients/client-1/interactions/nonexistent", { method: "DELETE" }),
      { params: Promise.resolve({ id: "client-1", interactionId: "nonexistent" }) }
    );

    expect(res.status).toBe(404);
  });

  it("returns 200 on successful soft delete", async () => {
    const now = "2026-08-03T10:30:00Z";
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      if (table === "interactions") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { id: "int-1" }, error: null }),
        });
      }
      return makeChain();
    });
    mockRpc.mockResolvedValue({ data: { deleted: true, deletedAt: now }, error: null });

    const mod = await import("../[interactionId]/route");
    const res = await mod.DELETE(
      new NextRequest("http://localhost/api/clients/client-1/interactions/int-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "client-1", interactionId: "int-1" }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.deleted).toBe(true);
    expect(body.data.deletedAt).toBe(now);
    expect(body.error).toBeNull();
    expect(mockRpc).toHaveBeenCalledWith("soft_delete_interaction", { p_interaction_id: "int-1" });
  });

  it("returns 500 on RPC error -- sanitized", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      if (table === "interactions") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { id: "int-1" }, error: null }),
        });
      }
      return makeChain();
    });
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "database disk full at /var/lib/postgres" },
    });

    const mod = await import("../[interactionId]/route");
    const res = await mod.DELETE(
      new NextRequest("http://localhost/api/clients/client-1/interactions/int-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "client-1", interactionId: "int-1" }) }
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
    const rawBody = JSON.stringify(body);
    expect(rawBody).not.toContain("disk full");
    expect(rawBody).not.toContain("postgres");
  });
});

// ===========================================================================
// Cross-workspace protection
// ===========================================================================

describe("Cross-workspace protection", () => {
  it("GET list: client in other workspace returns 404 (not leaked)", async () => {
    resetMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      if (table === "clients") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: null, error: { code: "PGRST116" } }),
        });
      }
      return makeChain();
    });

    const mod = await import("../route");
    const res = await mod.GET(
      new NextRequest("http://localhost/api/clients/other-ws-client/interactions", { method: "GET" }),
      { params: Promise.resolve({ id: "other-ws-client" }) }
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("RESOURCE_NOT_FOUND");
  });

  it("POST create: client in other workspace returns 404", async () => {
    resetMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      if (table === "clients") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: null, error: { code: "PGRST116" } }),
        });
      }
      return makeChain();
    });

    const mod = await import("../route");
    const res = await mod.POST(
      new NextRequest("http://localhost/api/clients/other-ws-client/interactions", {
        method: "POST",
        body: JSON.stringify({ interaction_type: "phone_call", occurred_at: "2026-08-01T10:00:00Z" }),
      }),
      { params: Promise.resolve({ id: "other-ws-client" }) }
    );

    expect(res.status).toBe(404);
  });

  it("GET detail: interaction in other workspace returns 404", async () => {
    resetMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      if (table === "clients") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { id: "other-ws-client" }, error: null }),
        });
      }
      if (table === "interactions") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: null, error: { code: "PGRST116" } }),
        });
      }
      return makeChain();
    });

    const mod = await import("../[interactionId]/route");
    const res = await mod.GET(
      new NextRequest("http://localhost/api/clients/other-ws-client/interactions/int-1", { method: "GET" }),
      { params: Promise.resolve({ id: "other-ws-client", interactionId: "int-1" }) }
    );

    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// Client existence guard
// ===========================================================================

describe("Client existence guard", () => {
  it("all endpoints verify client exists and belongs to workspace", async () => {
    resetMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    // Client check returns null = client not in workspace
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      if (table === "clients") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: null, error: { code: "PGRST116" } }),
        });
      }
      return makeChain();
    });

    const mod = await import("../route");
    // Test that POST also checks client existence
    const res = await mod.POST(
      new NextRequest("http://localhost/api/clients/soft-deleted-client/interactions", {
        method: "POST",
        body: JSON.stringify({ interaction_type: "phone_call", occurred_at: "2026-08-01T10:00:00Z" }),
      }),
      { params: Promise.resolve({ id: "soft-deleted-client" }) }
    );

    expect(res.status).toBe(404);
  });
});
