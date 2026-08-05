/**
 * Route Handler Unit Tests — POST/DELETE /api/properties/[id]/share
 *
 * Covers:
 * - POST: share property (success, 401, 403, 404, 422, cross-workspace, cookie writeback)
 * - DELETE: unshare property (success, 401, 403, 404, reset both flags, cookie writeback)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mock state — resettable per test
// ---------------------------------------------------------------------------

let mockJsonResponse: ReturnType<typeof vi.fn>;
let mockGetUser: ReturnType<typeof vi.fn>;
let mockFrom: ReturnType<typeof vi.fn>;
let mockPendingCookies: { name: string; value: string; options: Record<string, unknown> }[];

/** Build a Thenable mock Supabase query chain. */
function makeChain(overrides: Record<string, unknown> = {}) {
  let terminal: unknown = { data: null, error: null };

  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    order: vi.fn(() => chain),
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
      if (typeof overrides.onUpdate === "function") (overrides.onUpdate as (d: unknown) => void)(data);
      if (typeof overrides.updateResult === "function") {
        terminal = (overrides.updateResult as () => unknown)();
      }
      return chain;
    }),
    insert: vi.fn((data: unknown) => {
      if (typeof overrides.onInsert === "function") (overrides.onInsert as (d: unknown) => void)(data);
      if (typeof overrides.insertResult === "function") {
        terminal = (overrides.insertResult as () => unknown)();
      }
      return chain;
    }),
    // Thenable — makes `await chain` resolve to terminal
    then: vi.fn((resolve: (v: unknown) => void) => { resolve(terminal); return Promise.resolve(terminal); }),
  };

  return chain;
}

/** Returns a mock from() that delegates to makeChain per table. */
function defaultFrom() {
  return vi.fn((table: string) => {
    const overrides: Record<string, unknown> = {};
    if (table === "workspace_members") {
      overrides.single = () => Promise.resolve({ data: { workspace_id: "ws-test" }, error: null });
    } else if (table === "properties") {
      overrides.single = () => Promise.resolve({ data: { id: "prop-1", workspace_id: "ws-test" }, error: null });
    }
    return makeChain(overrides);
  });
}

function resetMocks() {
  mockPendingCookies = [];
  mockGetUser = vi.fn();
  mockJsonResponse = vi.fn(
    (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => {
      const response = new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      });
      if (mockPendingCookies.length > 0) {
        const cookieHeader = mockPendingCookies.map((c) => `${c.name}=${c.value}`).join("; ");
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
      },
      jsonResponse: mockJsonResponse,
    })
  ),
}));

// ===========================================================================
// POST /api/properties/[id]/share
// ===========================================================================

describe("POST /api/properties/[id]/share", () => {
  let POST: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    resetMocks();
    const mod = await import("../route");
    POST = mod.POST;
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await POST(
      new NextRequest("http://localhost/api/properties/prop-1/share", {
        method: "POST",
        body: JSON.stringify({ allowMarketingReuse: false }),
      }),
      { params: Promise.resolve({ id: "prop-1" }) }
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
    expect(body.error.message).toContain("未登录");
  });

  it("returns 403 when user has no workspace membership", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({ single: () => Promise.resolve({ data: null, error: { code: "PGRST116" } }) });
      }
      return makeChain();
    });

    const mod = await import("../route");
    const res = await mod.POST(
      new NextRequest("http://localhost/api/properties/prop-1/share", {
        method: "POST",
        body: JSON.stringify({ allowMarketingReuse: false }),
      }),
      { params: Promise.resolve({ id: "prop-1" }) }
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("WORKSPACE_ACCESS_DENIED");
  });

  it("returns 404 when property does not exist in workspace", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({ single: () => Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }) });
      }
      return makeChain({ single: () => Promise.resolve({ data: null, error: { code: "PGRST116" } }) });
    });

    const mod = await import("../route");
    const res = await mod.POST(
      new NextRequest("http://localhost/api/properties/prop-1/share", {
        method: "POST",
        body: JSON.stringify({ allowMarketingReuse: false }),
      }),
      { params: Promise.resolve({ id: "prop-1" }) }
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("shares property successfully with correct fields", async () => {
    let capturedUpdate: Record<string, unknown> | null = null;

    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({ single: () => Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }) });
      }
      if (table === "audit_logs") {
        return makeChain({ onInsert: () => {} });
      }
      return makeChain({
        single: () => Promise.resolve({ data: { id: "prop-1", workspace_id: "ws-1" }, error: null }),
        onUpdate: (data: unknown) => { capturedUpdate = data as Record<string, unknown>; },
      });
    });

    const mod = await import("../route");
    const res = await mod.POST(
      new NextRequest("http://localhost/api/properties/prop-1/share", {
        method: "POST",
        body: JSON.stringify({
          sharedExpiresAt: "2026-12-31T00:00:00.000Z",
          allowMarketingReuse: true,
          commissionSplit: "5/5 分成",
        }),
      }),
      { params: Promise.resolve({ id: "prop-1" }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error).toBeNull();
    expect(body.data.shared).toBe(true);
    expect(body.data.sharedAt).toBeDefined();

    expect(capturedUpdate).not.toBeNull();
    const cu = capturedUpdate as unknown as Record<string, unknown>;
    expect(cu.is_shared).toBe(true);
    expect(cu.allow_marketing_reuse).toBe(true);
    expect(cu.shared_expires_at).toBe("2026-12-31T00:00:00.000Z");
    expect(cu.commission_split).toBe("5/5 分成");
  });

  it("shares property with default allowMarketingReuse = false", async () => {
    let capturedUpdate: Record<string, unknown> | null = null;

    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({ single: () => Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }) });
      }
      if (table === "audit_logs") {
        return makeChain();
      }
      return makeChain({
        single: () => Promise.resolve({ data: { id: "prop-1", workspace_id: "ws-1" }, error: null }),
        onUpdate: (data: unknown) => { capturedUpdate = data as Record<string, unknown>; },
      });
    });

    const mod = await import("../route");
    const res = await mod.POST(
      new NextRequest("http://localhost/api/properties/prop-1/share", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "prop-1" }) }
    );

    expect(res.status).toBe(200);
    const cu = capturedUpdate as unknown as Record<string, unknown>;
    expect(cu.is_shared).toBe(true);
    expect(cu.allow_marketing_reuse).toBe(false);
  });

  it("cross-workspace access denied on share", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({ single: () => Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }) });
      }
      // property belongs to ws-2, not found in ws-1
      return makeChain({ single: () => Promise.resolve({ data: null, error: { code: "PGRST116" } }) });
    });

    const mod = await import("../route");
    const res = await mod.POST(
      new NextRequest("http://localhost/api/properties/prop-other/share", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "prop-other" }) }
    );

    expect(res.status).toBe(404);
  });

  it("returns 422 on invalid body", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({ single: () => Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }) });
      }
      return makeChain({
        single: () => Promise.resolve({ data: { id: "prop-1", workspace_id: "ws-1" }, error: null }),
      });
    });

    const mod = await import("../route");
    const res = await mod.POST(
      new NextRequest("http://localhost/api/properties/prop-1/share", {
        method: "POST",
        body: JSON.stringify({ allowMarketingReuse: "not-a-boolean" }),
      }),
      { params: Promise.resolve({ id: "prop-1" }) }
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("writes audit log on share", async () => {
    let auditLogged = false;

    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({ single: () => Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }) });
      }
      if (table === "audit_logs") {
        return makeChain({
          onInsert: () => { auditLogged = true; },
        });
      }
      return makeChain({
        single: () => Promise.resolve({ data: { id: "prop-1", workspace_id: "ws-1" }, error: null }),
      });
    });

    const mod = await import("../route");
    const res = await mod.POST(
      new NextRequest("http://localhost/api/properties/prop-1/share", {
        method: "POST",
        body: JSON.stringify({ allowMarketingReuse: true }),
      }),
      { params: Promise.resolve({ id: "prop-1" }) }
    );

    expect(res.status).toBe(200);
    expect(auditLogged).toBe(true);
  });

  it("handles 500 on DB update failure — sanitized", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({ single: () => Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }) });
      }
      return makeChain({
        single: () => Promise.resolve({ data: { id: "prop-1", workspace_id: "ws-1" }, error: null }),
        updateResult: () => ({ error: { code: "XX000", message: "disk full" } }),
      });
    });

    const mod = await import("../route");
    const res = await mod.POST(
      new NextRequest("http://localhost/api/properties/prop-1/share", {
        method: "POST",
        body: JSON.stringify({ allowMarketingReuse: false }),
      }),
      { params: Promise.resolve({ id: "prop-1" }) }
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.message).toBeDefined();
    expect(body.error.message).not.toContain("disk full");
  });

  it("handles 500 on unexpected exception — sanitized", async () => {
    mockGetUser.mockRejectedValue(new Error("Connection refused"));

    const mod = await import("../route");
    const res = await mod.POST(
      new NextRequest("http://localhost/api/properties/prop-1/share", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "prop-1" }) }
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.message).toMatch(/服务器错误/);
    expect(body.error.message).not.toContain("Connection refused");
  });
});

// ===========================================================================
// DELETE /api/properties/[id]/share
// ===========================================================================

describe("DELETE /api/properties/[id]/share", () => {
  let DELETE: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    resetMocks();
    const mod = await import("../route");
    DELETE = mod.DELETE;
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await DELETE(
      new NextRequest("http://localhost/api/properties/prop-1/share", { method: "DELETE" }),
      { params: Promise.resolve({ id: "prop-1" }) }
    );

    expect(res.status).toBe(401);
  });

  it("returns 403 when user has no workspace membership", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({ single: () => Promise.resolve({ data: null, error: { code: "PGRST116" } }) });
      }
      return makeChain();
    });

    const mod = await import("../route");
    const res = await mod.DELETE(
      new NextRequest("http://localhost/api/properties/prop-1/share", { method: "DELETE" }),
      { params: Promise.resolve({ id: "prop-1" }) }
    );

    expect(res.status).toBe(403);
  });

  it("resets is_shared and allow_marketing_reuse to false on unshare", async () => {
    let capturedUpdate: Record<string, unknown> | null = null;

    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({ single: () => Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }) });
      }
      if (table === "audit_logs") {
        return makeChain();
      }
      return makeChain({
        single: () => Promise.resolve({ data: { id: "prop-1", workspace_id: "ws-1" }, error: null }),
        onUpdate: (data: unknown) => { capturedUpdate = data as Record<string, unknown>; },
      });
    });

    const mod = await import("../route");
    const res = await mod.DELETE(
      new NextRequest("http://localhost/api/properties/prop-1/share", { method: "DELETE" }),
      { params: Promise.resolve({ id: "prop-1" }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error).toBeNull();
    expect(body.data.shared).toBe(false);
    expect(body.data.unsharedAt).toBeDefined();

    const cu = capturedUpdate as unknown as Record<string, unknown>;
    expect(cu.is_shared).toBe(false);
    expect(cu.allow_marketing_reuse).toBe(false);
    expect(cu.shared_at).toBeNull();
    expect(cu.shared_expires_at).toBeNull();
  });

  it("returns 404 when property not found", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({ single: () => Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }) });
      }
      return makeChain({ single: () => Promise.resolve({ data: null, error: { code: "PGRST116" } }) });
    });

    const mod = await import("../route");
    const res = await mod.DELETE(
      new NextRequest("http://localhost/api/properties/nonexistent/share", { method: "DELETE" }),
      { params: Promise.resolve({ id: "nonexistent" }) }
    );

    expect(res.status).toBe(404);
  });

  it("writes audit log on unshare", async () => {
    let auditLogged = false;

    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({ single: () => Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }) });
      }
      if (table === "audit_logs") {
        return makeChain({
          onInsert: () => { auditLogged = true; },
        });
      }
      return makeChain({
        single: () => Promise.resolve({ data: { id: "prop-1", workspace_id: "ws-1" }, error: null }),
      });
    });

    const mod = await import("../route");
    const res = await mod.DELETE(
      new NextRequest("http://localhost/api/properties/prop-1/share", { method: "DELETE" }),
      { params: Promise.resolve({ id: "prop-1" }) }
    );

    expect(res.status).toBe(200);
    expect(auditLogged).toBe(true);
  });

  it("handles 500 on DB update failure — sanitized", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({ single: () => Promise.resolve({ data: { workspace_id: "ws-1" }, error: null }) });
      }
      return makeChain({
        single: () => Promise.resolve({ data: { id: "prop-1", workspace_id: "ws-1" }, error: null }),
        updateResult: () => ({ error: { code: "XX000", message: "disk full" } }),
      });
    });

    const mod = await import("../route");
    const res = await mod.DELETE(
      new NextRequest("http://localhost/api/properties/prop-1/share", { method: "DELETE" }),
      { params: Promise.resolve({ id: "prop-1" }) }
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.message).toBeDefined();
    expect(body.error.message).not.toContain("disk full");
  });
});
