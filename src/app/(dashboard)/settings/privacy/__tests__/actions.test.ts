/**
 * Unit tests for privacy actions (exportDataAction, deleteAccountAction)
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockGetUser } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
}));

let mockFrom: ReturnType<typeof vi.fn>;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
      from: mockFrom,
    })
  ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildChain(opts: {
  maybeSingle?: unknown;
  terminal?: unknown;
} = {}) {
  const terminal = opts.terminal ?? { data: null, error: null };
  const maybeSingleValue = opts.maybeSingle ?? terminal;

  const chain: Record<string, unknown> = {
    select: vi.fn(function () { return chain; }),
    eq: vi.fn(function () { return chain; }),
    limit: vi.fn(function () { return chain; }),
    order: vi.fn(function () { return chain; }),
    single: vi.fn(() => Promise.resolve(terminal)),
    maybeSingle: vi.fn(() => Promise.resolve(maybeSingleValue)),
    update: vi.fn(function () { return chain; }),
    then: vi.fn(function (resolve: (v: unknown) => void) {
      resolve(terminal);
      return Promise.resolve(terminal);
    }),
  };
  return chain;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("exportDataAction", () => {
  let exportDataAction: () => Promise<{
    error?: string;
    success?: boolean;
    data?: Record<string, unknown>;
  }>;

  beforeAll(async () => {
    const mod = await import("@/app/(dashboard)/settings/privacy/actions");
    exportDataAction = mod.exportDataAction;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom = vi.fn();
  });

  it("returns error when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const result = await exportDataAction();
    expect(result.error).toBe("请先登录");
  });

  it("returns error when auth fails with error", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "token expired" } });
    const result = await exportDataAction();
    expect(result.error).toBe("请先登录");
  });

  it("returns profile and memberships for authenticated user", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "test@example.com" } },
      error: null,
    });

    const profileRow = { id: "user-1", display_name: "Test User" };
    const memberRows = [
      { workspace_id: "ws-1", role: "owner", status: "active", created_at: "2026-01-01", workspaces: { name: "My WS" } },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles") {
        return buildChain({ terminal: { data: profileRow, error: null } });
      }
      if (table === "workspace_members") {
        return buildChain({ terminal: { data: memberRows, error: null } });
      }
      return buildChain();
    });

    const result = await exportDataAction();
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    const data = result.data as Record<string, unknown>;
    expect(data.profile).toEqual(profileRow);
    expect(data.email).toBe("test@example.com");
    expect((data.memberships as Array<Record<string, unknown>>)).toHaveLength(1);
  });

  it("returns null profile when user has no profile row", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "test@example.com" } },
      error: null,
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles") {
        return buildChain({ terminal: { data: null, error: { code: "PGRST116" } } });
      }
      if (table === "workspace_members") {
        return buildChain({ terminal: { data: [], error: null } });
      }
      return buildChain();
    });

    const result = await exportDataAction();
    expect(result.success).toBe(true);
    const expData = result.data as Record<string, unknown>;
    expect(expData.profile).toBeNull();
  });
});

describe("deleteAccountAction", () => {
  let deleteAccountAction: () => Promise<{ error?: string; success?: boolean }>;

  beforeAll(async () => {
    const mod = await import("@/app/(dashboard)/settings/privacy/actions");
    deleteAccountAction = mod.deleteAccountAction;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "test@example.com" } },
      error: null,
    });
    mockFrom = vi.fn();
  });

  it("returns error when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const result = await deleteAccountAction();
    expect(result.error).toBe("请先登录");
  });

  it("returns error when profile is already deleted", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles") {
        return buildChain({
          maybeSingle: { data: { id: "user-1", deleted_at: "2026-08-01T00:00:00Z" }, error: null },
        });
      }
      return buildChain();
    });

    const result = await deleteAccountAction();
    expect(result.error).toBe("账号已删除");
  });

  it("returns error when profile update fails", async () => {
    let profileCalls = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles") {
        profileCalls++;
        if (profileCalls === 1) {
          return buildChain({
            maybeSingle: { data: { id: "user-1", deleted_at: null }, error: null },
          });
        }
        return buildChain({
          terminal: { data: null, error: { message: "permission denied" } },
        });
      }
      return buildChain();
    });

    const result = await deleteAccountAction();
    expect(result.error).toBe("操作失败，请重试");
  });

  it("returns success on successful soft-delete", async () => {
    let profileCalls = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles") {
        profileCalls++;
        if (profileCalls === 1) {
          return buildChain({
            maybeSingle: { data: { id: "user-1", deleted_at: null }, error: null },
          });
        }
        return buildChain({ terminal: { data: null, error: null } });
      }
      if (table === "workspace_members") {
        return buildChain({ terminal: { data: null, error: null } });
      }
      return buildChain();
    });

    const result = await deleteAccountAction();
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });
});
