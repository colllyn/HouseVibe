/**
 * Route Handler Unit Tests -- /api/tasks and /api/tasks/[id]
 *
 * Covers GET list, POST create, GET detail, PATCH update, DELETE soft-delete
 * with all required scenarios:
 * - GET list: 401, 403, 200 with data, 200 empty, status filter, type filter
 * - POST create: 401, 403, 422 missing title, 422 invalid taskType, 201 success
 * - GET detail: 401, 403, 404, 200
 * - PATCH update: 401, 403, 404, 200 partial update, status to done sets completed_at
 * - DELETE: 401, 403 no workspace, 404, 200 soft-delete
 * - Cross-workspace access denied
 * - Error sanitization (no raw DB errors)
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
    select: vi.fn((_cols?: unknown) => chain),
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
    // Thenable -- makes `await chain` resolve to terminal
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
    } else if (table === "tasks") {
      overrides.single = () =>
        Promise.resolve({ data: { id: "task-1", workspace_id: "ws-test" }, error: null });
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
// GET /api/tasks -- list
// ===========================================================================

describe("GET /api/tasks", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    resetMocks();
    const mod = await import("../route");
    GET = mod.GET;
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await GET(
      new NextRequest("http://localhost/api/tasks", { method: "GET" })
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("UNAUTHENTICATED");
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
      new NextRequest("http://localhost/api/tasks", { method: "GET" })
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("WORKSPACE_ACCESS_DENIED");
  });

  it("returns 200 with task data", async () => {
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
          data: [
            {
              id: "t1",
              task_type: "contact_client",
              title: "联系客户",
              status: "todo",
              workspace_id: "ws-1",
            },
          ],
          count: 1,
          error: null,
        },
      });
    });

    const mod = await import("../route");
    const res = await mod.GET(
      new NextRequest("http://localhost/api/tasks", { method: "GET" })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.tasks).toBeDefined();
    expect(body.data.total).toBe(1);
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
        terminal: { data: [], count: 0, error: null },
      });
    });

    const mod = await import("../route");
    const res = await mod.GET(
      new NextRequest("http://localhost/api/tasks", { method: "GET" })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.tasks).toEqual([]);
    expect(body.data.total).toBe(0);
  });

  it("filters by status query parameter", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    let statusEqValue: string | null = null;
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      const chain = makeChain({
        terminal: {
          data: [{ id: "t1", task_type: "contact_client", status: "todo" }],
          count: 1,
          error: null,
        },
      });
      const origEq = chain.eq as (...args: unknown[]) => unknown;
      chain.eq = vi.fn((col: string, val: string) => {
        if (col === "status") statusEqValue = val;
        return origEq(col, val);
      });
      return chain;
    });

    const mod = await import("../route");
    const res = await mod.GET(
      new NextRequest("http://localhost/api/tasks?status=todo", { method: "GET" })
    );

    expect(res.status).toBe(200);
    expect(statusEqValue).toBe("todo");
  });

  it("filters by taskType query parameter", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    let typeEqValue: string | null = null;
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      const chain = makeChain({
        terminal: {
          data: [{ id: "t1", task_type: "send_property", status: "todo" }],
          count: 1,
          error: null,
        },
      });
      const origEq = chain.eq as (...args: unknown[]) => unknown;
      chain.eq = vi.fn((col: string, val: string) => {
        if (col === "task_type") typeEqValue = val;
        return origEq(col, val);
      });
      return chain;
    });

    const mod = await import("../route");
    const res = await mod.GET(
      new NextRequest("http://localhost/api/tasks?taskType=send_property", { method: "GET" })
    );

    expect(res.status).toBe(200);
    expect(typeEqValue).toBe("send_property");
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
      new NextRequest("http://localhost/api/tasks", { method: "GET" })
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.message).not.toContain("disk");
    expect(body.error.message).not.toContain("/var/data");
  });

  it("returns 422 for invalid query param", async () => {
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

    const mod = await import("../route");
    const res = await mod.GET(
      new NextRequest("http://localhost/api/tasks?sortBy=invalid", { method: "GET" })
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });
});

// ===========================================================================
// POST /api/tasks -- create
// ===========================================================================

describe("POST /api/tasks", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    resetMocks();
    const mod = await import("../route");
    POST = mod.POST;
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await POST(
      new NextRequest("http://localhost/api/tasks", {
        method: "POST",
        body: JSON.stringify({ taskType: "contact_client", title: "测试" }),
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
      new NextRequest("http://localhost/api/tasks", {
        method: "POST",
        body: JSON.stringify({ taskType: "contact_client", title: "测试" }),
      })
    );

    expect(res.status).toBe(403);
  });

  it("returns 422 when title is missing", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    const res = await POST(
      new NextRequest("http://localhost/api/tasks", {
        method: "POST",
        body: JSON.stringify({ taskType: "contact_client" }),
      })
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("returns 422 when taskType is invalid", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    const res = await POST(
      new NextRequest("http://localhost/api/tasks", {
        method: "POST",
        body: JSON.stringify({ taskType: "invalid_type", title: "测试" }),
      })
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("returns 201 with created task", async () => {
    const expectedTask = {
      id: "new-task-id",
      workspace_id: "ws-1",
      assigned_to: "u1",
      task_type: "contact_client",
      title: "测试任务",
      description: null,
      property_id: null,
      client_id: null,
      status: "todo",
      due_at: null,
      completed_at: null,
      created_at: "2026-08-05T10:00:00Z",
      updated_at: "2026-08-05T10:00:00Z",
      deleted_at: null,
    };
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      return makeChain({
        terminal: { data: expectedTask, error: null },
      });
    });

    const mod = await import("../route");
    const res = await mod.POST(
      new NextRequest("http://localhost/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          taskType: "contact_client",
          title: "测试任务",
          description: "任务描述",
          dueAt: "2026-08-10T10:00:00Z",
        }),
      })
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.id).toBe("new-task-id");
    expect(body.data.task_type).toBe("contact_client");
    expect(body.data.title).toBe("测试任务");
    expect(body.data.status).toBe("todo");
    expect(body.error).toBeNull();
  });

  it("workspace_id and assigned_to are server-assigned", async () => {
    let capturedInsert: Record<string, unknown> | null = null;
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      return makeChain({
        onInsert: (payload: unknown) => {
          capturedInsert = payload as Record<string, unknown>;
        },
        terminal: {
          data: {
            id: "t1", workspace_id: "ws-1", assigned_to: "u1",
            task_type: "contact_client", title: "测试", status: "todo",
          },
          error: null,
        },
      });
    });

    const mod = await import("../route");
    const res = await mod.POST(
      new NextRequest("http://localhost/api/tasks", {
        method: "POST",
        body: JSON.stringify({ taskType: "contact_client", title: "测试" }),
      })
    );

    expect(res.status).toBe(201);
    expect(capturedInsert).not.toBeNull();
    const ci = capturedInsert as unknown as Record<string, unknown>;
    expect(ci.workspace_id).toBe("ws-1");
    expect(ci.assigned_to).toBe("u1");
  });

  it("returns 500 on insert error -- sanitized", async () => {
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
          error: { code: "XX000", message: "database disk full at /var/data" },
        },
      });
    });

    const mod = await import("../route");
    const res = await mod.POST(
      new NextRequest("http://localhost/api/tasks", {
        method: "POST",
        body: JSON.stringify({ taskType: "contact_client", title: "失败" }),
      })
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.message).not.toContain("disk");
  });
});

// ===========================================================================
// GET /api/tasks/[id] -- detail
// ===========================================================================

describe("GET /api/tasks/[id]", () => {
  let GET: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    resetMocks();
    const mod = await import("../[id]/route");
    GET = mod.GET;
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await GET(
      new NextRequest("http://localhost/api/tasks/task-1", { method: "GET" }),
      { params: Promise.resolve({ id: "task-1" }) }
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
      new NextRequest("http://localhost/api/tasks/task-1", { method: "GET" }),
      { params: Promise.resolve({ id: "task-1" }) }
    );

    expect(res.status).toBe(403);
  });

  it("returns 404 when task does not exist in workspace", async () => {
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
      new NextRequest("http://localhost/api/tasks/nonexistent", { method: "GET" }),
      { params: Promise.resolve({ id: "nonexistent" }) }
    );

    expect(res.status).toBe(404);
  });

  it("returns 200 with task detail", async () => {
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
              id: "task-1",
              task_type: "contact_client",
              title: "详细任务",
              status: "todo",
              workspace_id: "ws-1",
              description: "任务详情",
            },
            error: null,
          }),
      });
    });

    const mod = await import("../[id]/route");
    const res = await mod.GET(
      new NextRequest("http://localhost/api/tasks/task-1", { method: "GET" }),
      { params: Promise.resolve({ id: "task-1" }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.task_type).toBe("contact_client");
    expect(body.data.title).toBe("详细任务");
    expect(body.data.description).toBe("任务详情");
    expect(body.error).toBeNull();
  });

  it("cross-workspace access returns 404", async () => {
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
      new NextRequest("http://localhost/api/tasks/other-ws-task", { method: "GET" }),
      { params: Promise.resolve({ id: "other-ws-task" }) }
    );

    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// PATCH /api/tasks/[id] -- update
// ===========================================================================

describe("PATCH /api/tasks/[id]", () => {
  let PATCH: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    resetMocks();
    const mod = await import("../[id]/route");
    PATCH = mod.PATCH;
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await PATCH(
      new NextRequest("http://localhost/api/tasks/task-1", {
        method: "PATCH",
        body: JSON.stringify({ title: "Updated" }),
      }),
      { params: Promise.resolve({ id: "task-1" }) }
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
      new NextRequest("http://localhost/api/tasks/task-1", {
        method: "PATCH",
        body: JSON.stringify({ title: "Updated" }),
      }),
      { params: Promise.resolve({ id: "task-1" }) }
    );

    expect(res.status).toBe(403);
  });

  it("returns 404 when task not found in workspace", async () => {
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
      new NextRequest("http://localhost/api/tasks/missing", {
        method: "PATCH",
        body: JSON.stringify({ title: "Nope" }),
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
      const chain = makeChain({
        single: () =>
          Promise.resolve({ data: { id: "task-1", workspace_id: "ws-1", status: "todo" }, error: null }),
        onUpdate: (data: unknown) => {
          capturedUpdate = data as Record<string, unknown>;
        },
      });
      // Need to override single to handle two calls in order:
      // 1st: workspace lookup (handled by workspace_members branch)
      // In the tasks handler, we call .single() twice: once for existence check, once for the update chain
      // Our makeChain's single will be called for both - first returns the existing task, second is the update chain
      return chain;
    });

    const mod = await import("../[id]/route");
    const res = await mod.PATCH(
      new NextRequest("http://localhost/api/tasks/task-1", {
        method: "PATCH",
        body: JSON.stringify({ title: "Partial Update", description: "New desc" }),
      }),
      { params: Promise.resolve({ id: "task-1" }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.success).toBe(true);
    expect(body.error).toBeNull();
    expect(capturedUpdate).not.toBeNull();
    const cu = capturedUpdate as unknown as Record<string, unknown>;
    expect(cu.title).toBe("Partial Update");
    expect(cu.description).toBe("New desc");
  });

  it("sets completed_at when status changes to done", async () => {
    let capturedUpdate: Record<string, unknown> | null = null;
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      const chain = makeChain({
        single: () =>
          Promise.resolve({ data: { id: "task-1", workspace_id: "ws-1", status: "todo" }, error: null }),
        onUpdate: (data: unknown) => {
          capturedUpdate = data as Record<string, unknown>;
        },
      });
      return chain;
    });

    const mod = await import("../[id]/route");
    const res = await mod.PATCH(
      new NextRequest("http://localhost/api/tasks/task-1", {
        method: "PATCH",
        body: JSON.stringify({ status: "done" }),
      }),
      { params: Promise.resolve({ id: "task-1" }) }
    );

    expect(res.status).toBe(200);
    expect(capturedUpdate).not.toBeNull();
    const cu = capturedUpdate as unknown as Record<string, unknown>;
    expect(cu.status).toBe("done");
    expect(cu.completed_at).toBeDefined();
  });

  it("clears completed_at when status changes away from done", async () => {
    let capturedUpdate: Record<string, unknown> | null = null;
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }),
        });
      }
      const chain = makeChain({
        single: () =>
          Promise.resolve({ data: { id: "task-1", workspace_id: "ws-1", status: "done" }, error: null }),
        onUpdate: (data: unknown) => {
          capturedUpdate = data as Record<string, unknown>;
        },
      });
      return chain;
    });

    const mod = await import("../[id]/route");
    const res = await mod.PATCH(
      new NextRequest("http://localhost/api/tasks/task-1", {
        method: "PATCH",
        body: JSON.stringify({ status: "todo" }),
      }),
      { params: Promise.resolve({ id: "task-1" }) }
    );

    expect(res.status).toBe(200);
    const cu = capturedUpdate as unknown as Record<string, unknown>;
    expect(cu.status).toBe("todo");
    expect(cu.completed_at).toBeNull();
  });

  it("returns 422 when no update fields provided", async () => {
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
      new NextRequest("http://localhost/api/tasks/task-1", {
        method: "PATCH",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "task-1" }) }
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
      new NextRequest("http://localhost/api/tasks/other-ws-task", {
        method: "PATCH",
        body: JSON.stringify({ title: "Hacked" }),
      }),
      { params: Promise.resolve({ id: "other-ws-task" }) }
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
          Promise.resolve({ data: { id: "task-1", status: "todo" }, error: null }),
        updateResult: () => ({ error: { code: "XX000", message: "disk full" } }),
      });
    });

    const mod = await import("../[id]/route");
    const res = await mod.PATCH(
      new NextRequest("http://localhost/api/tasks/task-1", {
        method: "PATCH",
        body: JSON.stringify({ title: "Will Fail" }),
      }),
      { params: Promise.resolve({ id: "task-1" }) }
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.message).not.toContain("disk full");
  });
});

// ===========================================================================
// DELETE /api/tasks/[id] -- soft-delete
// ===========================================================================

describe("DELETE /api/tasks/[id]", () => {
  let DELETE: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    resetMocks();
    const mod = await import("../[id]/route");
    DELETE = mod.DELETE;
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await DELETE(
      new NextRequest("http://localhost/api/tasks/task-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "task-1" }) }
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
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
    const res = await mod.DELETE(
      new NextRequest("http://localhost/api/tasks/task-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "task-1" }) }
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("WORKSPACE_ACCESS_DENIED");
  });

  it("returns 404 when task not found", async () => {
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
    const res = await mod.DELETE(
      new NextRequest("http://localhost/api/tasks/missing", { method: "DELETE" }),
      { params: Promise.resolve({ id: "missing" }) }
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("RESOURCE_NOT_FOUND");
  });

  it("soft-deletes task successfully (200)", async () => {
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
          Promise.resolve({ data: { id: "task-1" }, error: null }),
        onUpdate: (data: unknown) => {
          capturedUpdate = data as Record<string, unknown>;
        },
      });
    });

    const mod = await import("../[id]/route");
    const res = await mod.DELETE(
      new NextRequest("http://localhost/api/tasks/task-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "task-1" }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.deleted).toBe(true);
    expect(body.data.deletedAt).toBeDefined();
    expect(body.error).toBeNull();
    expect(capturedUpdate).not.toBeNull();
    expect((capturedUpdate as unknown as Record<string, unknown>).deleted_at).toBeDefined();
  });

  it("returns 500 on update error -- sanitized", async () => {
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
          Promise.resolve({ data: { id: "task-1" }, error: null }),
        updateResult: () => ({ error: { code: "XX000", message: "disk full at /var/lib/postgresql/data" } }),
      });
    });

    const mod = await import("../[id]/route");
    const res = await mod.DELETE(
      new NextRequest("http://localhost/api/tasks/task-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "task-1" }) }
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.message).not.toContain("disk");
    expect(body.error.message).not.toContain("postgresql");
  });

  it("cross-workspace delete returns 404", async () => {
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
    const res = await mod.DELETE(
      new NextRequest("http://localhost/api/tasks/other-ws-task", { method: "DELETE" }),
      { params: Promise.resolve({ id: "other-ws-task" }) }
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("RESOURCE_NOT_FOUND");
  });
});
