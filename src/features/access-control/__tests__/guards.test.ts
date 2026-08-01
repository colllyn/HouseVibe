import { describe, it, expect, vi, beforeEach } from "vitest";
import { AppError } from "@/lib/errors";

// =============================================================================
// Module-scoped mock state — each test sets these before executing
// =============================================================================

const mockAuthGetUser = vi.fn<() => Promise<{ data: { user: { id: string } | null }; error: null }>>();
const mockSystemAdminsMaybeSingle = vi.fn<() => Promise<{ data: unknown; error: null }>>();

// Chainable builder for system_admins: select() → eq() → eq() → maybeSingle()
const mockSystemAdminsBuilder = {
  eq: vi.fn().mockReturnThis(),
  maybeSingle: mockSystemAdminsMaybeSingle,
};
const mockSystemAdminsSelect = vi.fn().mockReturnValue(mockSystemAdminsBuilder);

const mockFeatureEntitlementsMaybeSingle = vi.fn<() => Promise<{ data: unknown; error: null }>>();

// Chainable builder for feature_entitlements: select() → eq() → eq() → eq() → maybeSingle()
const mockFeatureEntitlementsBuilder = {
  eq: vi.fn().mockReturnThis(),
  maybeSingle: mockFeatureEntitlementsMaybeSingle,
};
const mockFeatureEntitlementsSelect = vi.fn().mockReturnValue(mockFeatureEntitlementsBuilder);

const mockFrom = vi.fn().mockImplementation((table: string) => {
  if (table === "system_admins") {
    return { select: mockSystemAdminsSelect };
  }
  if (table === "feature_entitlements") {
    return { select: mockFeatureEntitlementsSelect };
  }
  return { select: vi.fn() };
});

const mockCreateClient = vi.fn().mockResolvedValue({
  auth: { getUser: mockAuthGetUser },
  from: mockFrom,
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

// Import the module under test AFTER the mock is set up
import {
  isSystemAdmin,
  requireSystemAdmin,
  hasFeature,
  requireFeature,
} from "@/features/access-control/guards";

// =============================================================================
// Helpers
// =============================================================================

/** Reset all mock state to defaults before each test. */
function resetMocks() {
  vi.clearAllMocks();

  // Default: authenticated user exists
  mockAuthGetUser.mockResolvedValue({
    data: { user: { id: "test-user-id" } },
    error: null,
  });

  // Default: admin lookup returns matching row
  mockSystemAdminsMaybeSingle.mockResolvedValue({
    data: { id: "admin-row-id" },
    error: null,
  });

  // Default: feature entitlement returns matching row
  mockFeatureEntitlementsMaybeSingle.mockResolvedValue({
    data: { id: "ent-id", expires_at: null },
    error: null,
  });
}

// =============================================================================
// isSystemAdmin
// =============================================================================

describe("isSystemAdmin", () => {
  beforeEach(resetMocks);

  it("returns false when user is not authenticated", async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    expect(await isSystemAdmin()).toBe(false);
  });

  it("returns true when authenticated user is in system_admins", async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: "admin-user" } },
      error: null,
    });
    mockSystemAdminsMaybeSingle.mockResolvedValue({
      data: { id: "admin-row" },
      error: null,
    });

    const result = await isSystemAdmin();

    expect(result).toBe(true);
    expect(mockAuthGetUser).toHaveBeenCalled();
  });

  it("returns false when authenticated user is not in system_admins", async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: "regular-user" } },
      error: null,
    });
    mockSystemAdminsMaybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    const result = await isSystemAdmin();

    expect(result).toBe(false);
  });

  it("queries system_admins table with correct user id filter", async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: "query-user-id" } },
      error: null,
    });
    mockSystemAdminsMaybeSingle.mockResolvedValue({
      data: { id: "found" },
      error: null,
    });

    await isSystemAdmin();

    expect(mockFrom).toHaveBeenCalledWith("system_admins");
    expect(mockSystemAdminsSelect).toHaveBeenCalledWith("id");
  });
});

// =============================================================================
// requireSystemAdmin
// =============================================================================

describe("requireSystemAdmin", () => {
  beforeEach(resetMocks);

  it("throws FORBIDDEN AppError when user is not admin", async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    await expect(requireSystemAdmin()).rejects.toThrow(AppError);
    await expect(requireSystemAdmin()).rejects.toMatchObject({
      code: "FORBIDDEN",
      statusCode: 403,
    });
  });

  it("error message is in Chinese", async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    await expect(requireSystemAdmin()).rejects.toThrow("需要系统管理员权限");
  });

  it("resolves successfully when user is admin", async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: "admin-user" } },
      error: null,
    });
    mockSystemAdminsMaybeSingle.mockResolvedValue({
      data: { id: "admin-row" },
      error: null,
    });

    await expect(requireSystemAdmin()).resolves.toBeUndefined();
  });
});

// =============================================================================
// hasFeature
// =============================================================================

describe("hasFeature", () => {
  beforeEach(resetMocks);

  it("returns false when user is not authenticated", async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    expect(await hasFeature("ai_data_extraction")).toBe(false);
  });

  it("returns true when user has active, non-expired entitlement", async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: "feature-user" } },
      error: null,
    });
    mockFeatureEntitlementsMaybeSingle.mockResolvedValue({
      data: { id: "ent-active", expires_at: null },
      error: null,
    });

    const result = await hasFeature("ai_data_extraction");

    expect(result).toBe(true);
  });

  it("returns false when user has no matching entitlement (data is null)", async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: "feature-user" } },
      error: null,
    });
    mockFeatureEntitlementsMaybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    expect(await hasFeature("content_factory")).toBe(false);
  });

  it("returns false when entitlement has expired", async () => {
    const pastDate = new Date(Date.now() - 3600000).toISOString();

    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: "feature-user" } },
      error: null,
    });
    mockFeatureEntitlementsMaybeSingle.mockResolvedValue({
      data: { id: "ent-expired", expires_at: pastDate },
      error: null,
    });

    const result = await hasFeature("semantic_search");

    expect(result).toBe(false);
  });

  it("returns true when entitlement has future expires_at", async () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();

    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: "feature-user" } },
      error: null,
    });
    mockFeatureEntitlementsMaybeSingle.mockResolvedValue({
      data: { id: "ent-future", expires_at: futureDate },
      error: null,
    });

    const result = await hasFeature("shared_property_pool");

    expect(result).toBe(true);
  });

  it("queries feature_entitlements table with correct filters", async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: "query-user" } },
      error: null,
    });
    mockFeatureEntitlementsMaybeSingle.mockResolvedValue({
      data: { id: "found", expires_at: null },
      error: null,
    });

    await hasFeature("property_matching");

    expect(mockFrom).toHaveBeenCalledWith("feature_entitlements");
    expect(mockFeatureEntitlementsSelect).toHaveBeenCalledWith(
      "id, expires_at",
    );
  });
});

// =============================================================================
// requireFeature
// =============================================================================

describe("requireFeature", () => {
  beforeEach(resetMocks);

  it("throws FEATURE_NOT_ALLOWED when feature is not active", async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    await expect(requireFeature("content_factory")).rejects.toThrow(AppError);
    await expect(requireFeature("content_factory")).rejects.toMatchObject({
      code: "FEATURE_NOT_ALLOWED",
      statusCode: 403,
    });
  });

  it("resolves successfully when feature is active", async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: "feature-user" } },
      error: null,
    });
    mockFeatureEntitlementsMaybeSingle.mockResolvedValue({
      data: { id: "ent-active", expires_at: null },
      error: null,
    });

    await expect(requireFeature("ai_data_extraction")).resolves.toBeUndefined();
  });

  it("error message contains the feature name for debugging", async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    try {
      await requireFeature("content_factory");
      expect.fail("Should have thrown");
    } catch (e) {
      const appErr = e as AppError;
      expect(appErr.message).toContain("content_factory");
      expect(appErr.message).toContain("未授权");
    }
  });

  it("throws when entitlement exists but is expired", async () => {
    const pastDate = new Date(Date.now() - 3600000).toISOString();

    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: "feature-user" } },
      error: null,
    });
    mockFeatureEntitlementsMaybeSingle.mockResolvedValue({
      data: { id: "ent-expired", expires_at: pastDate },
      error: null,
    });

    await expect(requireFeature("semantic_search")).rejects.toThrow(AppError);
    await expect(requireFeature("semantic_search")).rejects.toMatchObject({
      code: "FEATURE_NOT_ALLOWED",
    });
  });
});
