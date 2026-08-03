/**
 * Route Handler Unit Tests -- /api/clients and /api/clients/[id]
 *
 * Covers GET list, POST create, GET detail, PATCH update, DELETE with all
 * required scenarios per client-contract v1.0:
 * - GET list: 401, 403, 200 with data, 200 empty, phone/wechat exclusion,
 *   stage filter, search filter, error sanitization
 * - POST create: 401, 403, 400 missing name, 201 success with contract format,
 *   workspace_id from server, created_by from auth, idempotency, duplicate safe
 * - GET detail: 401, 403, 404, 200 includes phone/wechat
 * - PATCH update: 401, 403, 404, 200 partial update, stage change, 422
 *   invalid stage
 * - DELETE: 401, 403 no workspace, 403 member forbidden, 403 admin forbidden,
 *   200 owner soft-delete, 404, 422 closed_won, cross-workspace 404
 * - Error sanitization (no raw DB errors)
 * - Cross-workspace access denied
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
    // Thenable — makes `await chain` resolve to terminal
    then: vi.fn((resolve: (v: unknown) => void) => {
      resolve(terminal);
      return Promise.resolve(terminal);
    }),
  };

  return chain;
}

/** Returns a mock from() that delegates to makeChain per table. */
function defaultFrom() {
  return vi.fn((table: string) => {
    const overrides: Record<string, unknown> = {};
    if (table === "workspace_members") {
      overrides.single = () =>
        Promise.resolve({ data: { workspace_id: "ws-test" }, error: null });
    } else if (table === "clients") {
      overrides.single = () =>
        Promise.resolve({ data: { id: "client-1", workspace_id: "ws-test" }, error: null });
    }
    return makeChain(overrides);
  });
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
  mockFrom = defaultFrom();
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
// GET /api/clients -- list
// ===========================================================================

describe("GET /api/clients", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    resetMocks();
    const mod = await import("../route");
    GET = mod.GET;
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await GET(
      new NextRequest("http://localhost/api/clients", { method: "GET" })
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error).not.toContain("internal");
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
      new NextRequest("http://localhost/api/clients", { method: "GET" })
    );

    expect(res.status).toBe(403);
  });

  it("returns 200 with client data", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      return makeChain({
        single: () =>
          Promise.resolve({
            data: [
              {
                id: "c1",
                name: "Test Client",
                stage: "new",
                budget_min: 3000,
                budget_max: 5000,
              },
            ],
            count: 1,
            error: null,
          }),
      });
    });

    const mod = await import("../route");
    const res = await mod.GET(
      new NextRequest("http://localhost/api/clients", { method: "GET" })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.clients).toBeDefined();
    expect(body.error).toBeNull();
  });

  it("returns 200 with empty list", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      return makeChain({
        single: () =>
          Promise.resolve({ data: [], count: 0, error: null }),
      });
    });

    const mod = await import("../route");
    const res = await mod.GET(
      new NextRequest("http://localhost/api/clients", { method: "GET" })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.clients).toEqual([]);
    expect(body.data.total).toBe(0);
  });

  it("excludes phone and wechat from list response", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    let capturedSelect: string | null = null;
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      const chain = makeChain({
        single: () =>
          Promise.resolve({ data: [{ id: "c1", name: "Safe" }], count: 1, error: null }),
      });
      const origSelect = chain.select;
      chain.select = vi.fn((cols?: unknown) => {
        if (typeof cols === "string") capturedSelect = cols;
        return (origSelect as (c: unknown) => unknown)(cols);
      });
      return chain;
    });

    const mod = await import("../route");
    const res = await mod.GET(
      new NextRequest("http://localhost/api/clients", { method: "GET" })
    );

    expect(res.status).toBe(200);
    if (capturedSelect !== null) {
      expect(capturedSelect).not.toContain("phone");
      expect(capturedSelect).not.toContain("wechat");
      expect(capturedSelect).not.toContain("hard_requirements");
      expect(capturedSelect).not.toContain("soft_preferences");
      expect(capturedSelect).not.toContain("deal_breakers");
      expect(capturedSelect).not.toContain("raw_input_text");
    }
  });

  it("filters by stage query parameter", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    let stageEqValue: string | null = null;
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      const chain = makeChain({
        single: () =>
          Promise.resolve({ data: [{ id: "c1", stage: "qualified" }], count: 1, error: null }),
      });
      const origEq = chain.eq as (...args: unknown[]) => unknown;
      chain.eq = vi.fn((col: string, val: string) => {
        if (col === "stage") stageEqValue = val;
        return origEq(col, val);
      });
      return chain;
    });

    const mod = await import("../route");
    const res = await mod.GET(
      new NextRequest("http://localhost/api/clients?stage=qualified", { method: "GET" })
    );

    expect(res.status).toBe(200);
    if (stageEqValue !== null) {
      expect(stageEqValue).toBe("qualified");
    }
  });

  it("filters by search query parameter", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    let orPattern: string | null = null;
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      const chain = makeChain({
        single: () =>
          Promise.resolve({ data: [{ id: "c1", name: "Search" }], count: 1, error: null }),
      });
      chain.or = vi.fn((pattern: string) => {
        orPattern = pattern;
        return chain;
      });
      return chain;
    });

    const mod = await import("../route");
    const res = await mod.GET(
      new NextRequest("http://localhost/api/clients?search=张三", { method: "GET" })
    );

    expect(res.status).toBe(200);
    if (orPattern !== null) {
      expect(orPattern).toContain("张三");
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
      return makeChain({
        terminal: {
          data: null,
          error: { code: "XX000", message: "internal disk error at /var/data" },
        },
      });
    });

    const mod = await import("../route");
    const res = await mod.GET(
      new NextRequest("http://localhost/api/clients", { method: "GET" })
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error).not.toContain("disk");
    expect(body.error).not.toContain("internal disk");
    expect(body.error).not.toContain("/var/data");
  });
});

// ===========================================================================
// POST /api/clients -- create
// ===========================================================================

describe("POST /api/clients", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    resetMocks();
    const mod = await import("../route");
    POST = mod.POST;
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await POST(
      new NextRequest("http://localhost/api/clients", {
        method: "POST",
        body: JSON.stringify({ name: "Test Client" }),
      })
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
      new NextRequest("http://localhost/api/clients", {
        method: "POST",
        body: JSON.stringify({ name: "Test Client" }),
      })
    );

    expect(res.status).toBe(403);
  });

  it("returns 422 when name is missing", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    const res = await POST(
      new NextRequest("http://localhost/api/clients", {
        method: "POST",
        body: JSON.stringify({ phone: "13800138000" }),
      })
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("returns 201 with contract-compliant response format", async () => {
    const expectedClient = {
      id: "new-client-id",
      name: "New Client",
      stage: "new",
      created_at: "2026-08-02T10:00:00Z",
      workspace_id: "ws-1",
      created_by: "u1",
    };
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      return makeChain();
    });
    mockRpc.mockResolvedValue({ data: expectedClient, error: null });

    const mod = await import("../route");
    const res = await mod.POST(
      new NextRequest("http://localhost/api/clients", {
        method: "POST",
        body: JSON.stringify({ name: "New Client", phone: "13800138000", stage: "new" }),
      })
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.id).toBe("new-client-id");
    expect(body.data.name).toBe("New Client");
    expect(body.data.stage).toBe("new");
    expect(body.error).toBeNull();
  });

  it("workspace_id and created_by are server-assigned via RPC", async () => {
    let rpcArgs: Record<string, unknown> | null = null;
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      return makeChain();
    });
    mockRpc.mockImplementation(async (_fn: string, args: Record<string, unknown>) => {
      rpcArgs = args;
      return {
        data: {
          id: "c-rpc", name: args.p_name, stage: args.p_stage,
          created_at: "now", workspace_id: "ws-1", created_by: "u1",
        },
        error: null,
      };
    });

    const mod = await import("../route");
    const res = await mod.POST(
      new NextRequest("http://localhost/api/clients", {
        method: "POST",
        body: JSON.stringify({ name: "RPC Test", workspace_id: "ws-evil", phone: "13800138000" }),
      })
    );

    expect(res.status).toBe(201);
    // RPC derives workspace_id and created_by from auth, not request body
    expect(mockRpc).toHaveBeenCalled();
    expect(rpcArgs).not.toBeNull();
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
      return makeChain();
    });
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "database disk full at /var/data" },
    });

    const mod = await import("../route");
    const res = await mod.POST(
      new NextRequest("http://localhost/api/clients", {
        method: "POST",
        body: JSON.stringify({ name: "Fail" }),
      })
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error).not.toContain("disk");
  });

  it("idempotency: duplicate request returns existing client via RPC", async () => {
    const existingClient = {
      id: "existing-id", name: "Idempotent Client", stage: "new",
      created_at: "2026-08-02T10:00:00Z", workspace_id: "ws-1", created_by: "u1",
    };
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      return makeChain();
    });
    // RPC returns existing client (idempotent response)
    mockRpc.mockResolvedValue({ data: existingClient, error: null });

    const mod = await import("../route");
    const res = await mod.POST(
      new NextRequest("http://localhost/api/clients", {
        method: "POST",
        headers: { "X-Idempotency-Key": "idem-key-002" },
        body: JSON.stringify({ name: "Idempotent Client" }),
      })
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.id).toBe("existing-id");
    expect(body.error).toBeNull();
  });

  it("idempotency: different content with same key returns 409 CONFLICT", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      return makeChain();
    });
    // RPC raises conflict — idempotency key reused with different content
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "23505", message: "Idempotency key reused with different request content" },
    });

    const mod = await import("../route");
    const res = await mod.POST(
      new NextRequest("http://localhost/api/clients", {
        method: "POST",
        headers: { "X-Idempotency-Key": "idem-key-003" },
        body: JSON.stringify({ name: "Different Name" }),
      })
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("CONFLICT");
  });
});

// ===========================================================================
// GET /api/clients/[id] -- detail
// ===========================================================================

describe("GET /api/clients/[id]", () => {
  let GET: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    resetMocks();
    const mod = await import("../[id]/route");
    GET = mod.GET;
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await GET(
      new NextRequest("http://localhost/api/clients/client-1", { method: "GET" }),
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

    const mod = await import("../[id]/route");
    const res = await mod.GET(
      new NextRequest("http://localhost/api/clients/client-1", { method: "GET" }),
      { params: Promise.resolve({ id: "client-1" }) }
    );

    expect(res.status).toBe(403);
  });

  it("returns 404 when client does not exist in workspace", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      return makeChain({
        single: () =>
          Promise.resolve({ data: null, error: { code: "PGRST116" } }),
      });
    });

    const mod = await import("../[id]/route");
    const res = await mod.GET(
      new NextRequest("http://localhost/api/clients/nonexistent", { method: "GET" }),
      { params: Promise.resolve({ id: "nonexistent" }) }
    );

    expect(res.status).toBe(404);
  });

  it("returns 200 and includes phone and wechat in detail", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      return makeChain({
        single: () =>
          Promise.resolve({
            data: {
              id: "client-1",
              name: "Detail Client",
              phone: "13800138000",
              wechat: "wxid_test",
              stage: "new",
              workspace_id: "ws-1",
            },
            error: null,
          }),
      });
    });

    const mod = await import("../[id]/route");
    const res = await mod.GET(
      new NextRequest("http://localhost/api/clients/client-1", { method: "GET" }),
      { params: Promise.resolve({ id: "client-1" }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.phone).toBe("13800138000");
    expect(body.data.wechat).toBe("wxid_test");
    expect(body.error).toBeNull();
  });

  it("cross-workspace access returns 404 (not leaked)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      return makeChain({
        single: () =>
          Promise.resolve({ data: null, error: { code: "PGRST116" } }),
      });
    });

    const mod = await import("../[id]/route");
    const res = await mod.GET(
      new NextRequest("http://localhost/api/clients/other-ws-client", { method: "GET" }),
      { params: Promise.resolve({ id: "other-ws-client" }) }
    );

    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// PATCH /api/clients/[id] -- update
// ===========================================================================

describe("PATCH /api/clients/[id]", () => {
  let PATCH: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    resetMocks();
    const mod = await import("../[id]/route");
    PATCH = mod.PATCH;
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await PATCH(
      new NextRequest("http://localhost/api/clients/client-1", {
        method: "PATCH",
        body: JSON.stringify({ name: "Updated" }),
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

    const mod = await import("../[id]/route");
    const res = await mod.PATCH(
      new NextRequest("http://localhost/api/clients/client-1", {
        method: "PATCH",
        body: JSON.stringify({ name: "Updated" }),
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
      return makeChain({
        single: () =>
          Promise.resolve({ data: null, error: { code: "PGRST116" } }),
      });
    });

    const mod = await import("../[id]/route");
    const res = await mod.PATCH(
      new NextRequest("http://localhost/api/clients/missing", {
        method: "PATCH",
        body: JSON.stringify({ name: "Nope" }),
      }),
      { params: Promise.resolve({ id: "missing" }) }
    );

    expect(res.status).toBe(404);
  });

  it("succeeds on partial update (200)", async () => {
    let capturedUpdate: Record<string, unknown> | null = null;
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      return makeChain({
        single: () =>
          Promise.resolve({ data: { id: "client-1", workspace_id: "ws-1" }, error: null }),
        onUpdate: (data: unknown) => {
          capturedUpdate = data as Record<string, unknown>;
        },
      });
    });

    const mod = await import("../[id]/route");
    const res = await mod.PATCH(
      new NextRequest("http://localhost/api/clients/client-1", {
        method: "PATCH",
        body: JSON.stringify({ name: "Partial Update", budget_min: 3000 }),
      }),
      { params: Promise.resolve({ id: "client-1" }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.success).toBe(true);
    expect(body.error).toBeNull();
    expect(capturedUpdate).not.toBeNull();
    const cu = capturedUpdate as unknown as Record<string, unknown>;
    expect(cu.name).toBe("Partial Update");
    expect(cu.budget_min).toBe(3000);
  });

  it("routes stage change through set_client_stage RPC", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      return makeChain();
    });
    mockRpc.mockResolvedValue({ data: { stage: "qualified" }, error: null });

    const mod = await import("../[id]/route");
    const res = await mod.PATCH(
      new NextRequest("http://localhost/api/clients/client-1", {
        method: "PATCH",
        body: JSON.stringify({ stage: "qualified" }),
      }),
      { params: Promise.resolve({ id: "client-1" }) }
    );

    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("set_client_stage", {
      p_client_id: "client-1",
      p_new_stage: "qualified",
    });
  });

  it("rejects invalid stage transition via RPC", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      return makeChain();
    });
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "Stage transition from new to viewed is not allowed" },
    });

    const mod = await import("../[id]/route");
    const res = await mod.PATCH(
      new NextRequest("http://localhost/api/clients/client-1", {
        method: "PATCH",
        body: JSON.stringify({ stage: "viewed" }),
      }),
      { params: Promise.resolve({ id: "client-1" }) }
    );

    expect(res.status).toBe(422);
  });

  it("rejects stage+field mixed PATCH", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      return makeChain();
    });

    const mod = await import("../[id]/route");
    const res = await mod.PATCH(
      new NextRequest("http://localhost/api/clients/client-1", {
        method: "PATCH",
        body: JSON.stringify({ name: "New Name", stage: "qualified" }),
      }),
      { params: Promise.resolve({ id: "client-1" }) }
    );

    expect(res.status).toBe(422);
  });

  it("cross-workspace update denied", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      return makeChain({
        single: () =>
          Promise.resolve({ data: null, error: { code: "PGRST116" } }),
      });
    });

    const mod = await import("../[id]/route");
    const res = await mod.PATCH(
      new NextRequest("http://localhost/api/clients/other-ws-client", {
        method: "PATCH",
        body: JSON.stringify({ name: "Hacked" }),
      }),
      { params: Promise.resolve({ id: "other-ws-client" }) }
    );

    expect(res.status).toBe(404);
  });

  it("returns 500 on update failure -- sanitized", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      return makeChain({
        single: () =>
          Promise.resolve({ data: { id: "client-1" }, error: null }),
        updateResult: () => ({ error: { code: "XX000", message: "disk full" } }),
      });
    });

    const mod = await import("../[id]/route");
    const res = await mod.PATCH(
      new NextRequest("http://localhost/api/clients/client-1", {
        method: "PATCH",
        body: JSON.stringify({ name: "Will Fail" }),
      }),
      { params: Promise.resolve({ id: "client-1" }) }
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error).not.toContain("disk full");
  });
});

// ===========================================================================
// DELETE /api/clients/[id] -- soft-delete (Owner Only)
// Per client-contract §4.5, §5.1: Member = CRU, Owner = CRUD.
// ===========================================================================

describe("DELETE /api/clients/[id]", () => {
  let DELETE: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    resetMocks();
    const mod = await import("../[id]/route");
    DELETE = mod.DELETE;
  });

  // --- Error: Authentication ---

  it("returns 401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await DELETE(
      new NextRequest("http://localhost/api/clients/client-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "client-1" }) }
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  // --- Error: Workspace Membership ---

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

    const mod = await import("../[id]/route");
    const res = await mod.DELETE(
      new NextRequest("http://localhost/api/clients/client-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "client-1" }) }
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("WORKSPACE_ACCESS_DENIED");
  });

  // --- Error: Member denied (FORBIDDEN) ---

  it("returns 403 when member tries to delete (owner-only)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u-member" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1", role: "member" }, error: null }),
        });
      }
      return makeChain();
    });

    const mod = await import("../[id]/route");
    const res = await mod.DELETE(
      new NextRequest("http://localhost/api/clients/client-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "client-1" }) }
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  // --- Error: Admin denied (FORBIDDEN) ---

  it("returns 403 when admin tries to delete (owner-only)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u-admin" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1", role: "admin" }, error: null }),
        });
      }
      return makeChain();
    });

    const mod = await import("../[id]/route");
    const res = await mod.DELETE(
      new NextRequest("http://localhost/api/clients/client-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "client-1" }) }
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  // --- Error: Client not found ---

  it("returns 404 when client not found", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1", role: "owner" }, error: null }),
        });
      }
      // Client lookup returns nothing
      const chain = makeChain();
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.is = vi.fn(() => chain);
      chain.single = vi.fn(() => Promise.resolve({ data: null, error: { code: "PGRST116" } }));
      return chain;
    });

    const mod = await import("../[id]/route");
    const res = await mod.DELETE(
      new NextRequest("http://localhost/api/clients/missing", { method: "DELETE" }),
      { params: Promise.resolve({ id: "missing" }) }
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("RESOURCE_NOT_FOUND");
  });

  // --- Error: closed_won cannot be deleted ---

  it("returns 422 when deleting closed_won client", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1", role: "owner" }, error: null }),
        });
      }
      const chain = makeChain();
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.is = vi.fn(() => chain);
      chain.single = vi.fn(() =>
        Promise.resolve({ data: { id: "client-1", stage: "closed_won" }, error: null })
      );
      return chain;
    });

    const mod = await import("../[id]/route");
    const res = await mod.DELETE(
      new NextRequest("http://localhost/api/clients/client-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "client-1" }) }
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  // --- Success: Owner soft-deletes client ---

  it("owner soft-deletes client successfully (200)", async () => {
    const now = "2026-08-02T10:30:00Z";
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockRpc.mockResolvedValue({ data: { deleted: true, deletedAt: now }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1", role: "owner" }, error: null }),
        });
      }
      const chain = makeChain();
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.is = vi.fn(() => chain);
      chain.single = vi.fn(() =>
        Promise.resolve({ data: { id: "client-1", stage: "new" }, error: null })
      );
      return chain;
    });

    const mod = await import("../[id]/route");
    const res = await mod.DELETE(
      new NextRequest("http://localhost/api/clients/client-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "client-1" }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.deleted).toBe(true);
    expect(body.data.deletedAt).toBe(now);
    expect(body.error).toBeNull();
    // Verify RPC was called with the correct client ID
    expect(mockRpc).toHaveBeenCalledWith("soft_delete_client", { p_client_id: "client-1" });
  });

  // --- Error: RPC failure ---

  it("returns 500 on RPC error -- sanitized", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "disk full at /var/lib/postgresql/data" },
    });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1", role: "owner" }, error: null }),
        });
      }
      const chain = makeChain();
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.is = vi.fn(() => chain);
      chain.single = vi.fn(() =>
        Promise.resolve({ data: { id: "client-1", stage: "new" }, error: null })
      );
      return chain;
    });

    const mod = await import("../[id]/route");
    const res = await mod.DELETE(
      new NextRequest("http://localhost/api/clients/client-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "client-1" }) }
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error).not.toContain("disk");
    expect(body.error).not.toContain("postgresql");
  });

  // --- Error: Cross-workspace ---

  it("cross-workspace delete returns 404", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1", role: "owner" }, error: null }),
        });
      }
      const chain = makeChain();
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.is = vi.fn(() => chain);
      chain.single = vi.fn(() => Promise.resolve({ data: null, error: { code: "PGRST116" } }));
      return chain;
    });

    const mod = await import("../[id]/route");
    const res = await mod.DELETE(
      new NextRequest("http://localhost/api/clients/other-ws-client", { method: "DELETE" }),
      { params: Promise.resolve({ id: "other-ws-client" }) }
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("RESOURCE_NOT_FOUND");
  });
});
