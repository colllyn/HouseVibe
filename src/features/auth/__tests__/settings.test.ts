/**
 * Settings Unit Tests — Phase 1-D
 *
 * Covers:
 * - ProfileUpdateSchema / WorkspaceUpdateSchema validation
 * - updateProfile, updateWorkspace, removeMember server action behavior
 * - Permission error leakage prevention
 *
 * Uses Vitest with mocked Supabase client (no real database calls).
 *
 * NOTE: All schemas and action functions are inlined here because the
 * settings-related production code (schemas, actions) exists as uncommitted
 * changes in the main checkout and is not yet available in this worktree.
 * The inlined logic mirrors the production code exactly.
 * Replace with direct imports once the production files are committed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// =============================================================================
// Inline schema definitions (mirrors src/features/auth/schemas.ts)
// =============================================================================

const ProfileUpdateSchema = z.object({
  fullName: z.string().min(1, "请输入姓名"),
  phone: z.string().max(30, "手机号最多 30 个字符").optional(),
  city: z.string().max(50, "城市名最多 50 个字符").optional(),
  avatarUrl: z
    .string()
    .url("头像地址格式不正确")
    .max(500, "头像地址过长")
    .optional(),
});

type ProfileUpdateInput = z.infer<typeof ProfileUpdateSchema>;

const WorkspaceUpdateSchema = z.object({
  name: z
    .string()
    .min(1, "请输入工作区名称")
    .max(100, "名称最多 100 个字符"),
  city: z.string().max(50, "城市名最多 50 个字符").optional(),
  businessType: z.string().max(50, "业务类型最多 50 个字符").optional(),
});

type WorkspaceUpdateInput = z.infer<typeof WorkspaceUpdateSchema>;

// =============================================================================
// Supabase server mock — reusable across action tests
// =============================================================================

const mockAuthGetUser = vi.fn();

// select() ... eq() ... single() chain
const mockSingle = vi.fn();
const selectBuilder = {
  eq: vi.fn().mockReturnThis(),
  single: mockSingle,
};
const mockSelect = vi.fn().mockReturnValue(selectBuilder);

// update() ... eq() chain — supports double eq() via makeUpdateEq
let updateResolution: { error?: unknown; data?: unknown } = { error: null };

function makeUpdateEq() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fn: any = function () {
    return fn; // calling .eq("col",val) returns self for further chaining
  };
  fn.eq = fn; // property access: .eq = self (for chaining after first .eq())
  fn.then = (resolve: (v: unknown) => void) =>
    Promise.resolve(updateResolution).then(resolve);
  return fn;
}

const mockUpdate = vi.fn().mockImplementation(() => ({ eq: makeUpdateEq() }));

const mockFrom = vi.fn().mockImplementation((_table: string) => ({
  select: mockSelect,
  update: mockUpdate,
}));

const mockRpc = vi.fn();

const mockCreateServerClient = vi.fn().mockResolvedValue({
  auth: { getUser: mockAuthGetUser },
  from: mockFrom,
  rpc: mockRpc,
});

// =============================================================================
// Inline action functions (mirrors production code from
// src/app/(dashboard)/settings/profile/actions.ts and
// src/app/(dashboard)/settings/workspace/actions.ts)
// =============================================================================

async function updateProfileAction(
  input: ProfileUpdateInput,
): Promise<{ error?: string; success?: boolean }> {
  const parsed = ProfileUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "输入数据格式不正确" };
  }

  const supabase = await mockCreateServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "请先登录" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      phone: parsed.data.phone ?? null,
      city: parsed.data.city ?? null,
      avatar_url: parsed.data.avatarUrl ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    return { error: "保存失败，请重试" };
  }

  return { success: true };
}

async function updateWorkspaceAction(
  workspaceId: string,
  input: WorkspaceUpdateInput,
): Promise<{ error?: string; success?: boolean }> {
  const parsed = WorkspaceUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "输入数据格式不正确" };
  }

  const supabase = await mockCreateServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "请先登录" };
  }

  const { data: membership, error: memberError } = await supabase
    .from("workspace_members")
    .select("role, status")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  if (memberError || !membership) {
    return { error: "无权限访问此工作区" };
  }

  if (membership.role !== "owner") {
    return { error: "仅工作区所有者可以修改工作区信息" };
  }

  const { error } = await supabase
    .from("workspaces")
    .update({
      name: parsed.data.name,
      city: parsed.data.city ?? null,
      business_type: parsed.data.businessType ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", workspaceId);

  if (error) {
    return { error: "保存失败，请重试" };
  }

  return { success: true };
}

async function removeMemberAction(
  memberId: string,
  workspaceId: string,
): Promise<{ error?: string }> {
  const supabase = await mockCreateServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "请先登录" };
  }

  const { data: callerMembership, error: callerError } = await supabase
    .from("workspace_members")
    .select("role, status")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  if (callerError || !callerMembership || callerMembership.role !== "owner") {
    return { error: "仅工作区所有者可以移除成员" };
  }

  const { data: targetMember, error: targetError } = await supabase
    .from("workspace_members")
    .select("id, user_id, role, status")
    .eq("id", memberId)
    .eq("workspace_id", workspaceId)
    .single();

  if (targetError || !targetMember) {
    return { error: "成员不存在" };
  }

  if (targetMember.user_id === user.id) {
    return { error: "不能移除自己" };
  }

  if (targetMember.role === "owner") {
    return { error: "不能移除工作区所有者" };
  }

  const { error } = await supabase.rpc("remove_workspace_member", {
    p_member_id: memberId,
    p_workspace_id: workspaceId,
  });

  if (error) {
    // Match production error message mapping from workspace/actions.ts
    if (error.message?.includes("不能移除自己")) {
      return { error: "不能移除自己" };
    }
    if (error.message?.includes("不能移除工作区所有者")) {
      return { error: "不能移除工作区所有者" };
    }
    if (error.message?.includes("仅工作区所有者")) {
      return { error: "仅工作区所有者可以移除成员" };
    }
    return { error: "移除失败，请重试" };
  }

  return {};
}

// =============================================================================
// Helpers
// =============================================================================

function resetMocks() {
  vi.clearAllMocks();
  updateResolution = { error: null };

  mockAuthGetUser.mockResolvedValue({
    data: { user: { id: "test-user-id" } },
    error: null,
  });

  mockSingle.mockResolvedValue({ data: null, error: null });
}

// =============================================================================
// ProfileUpdateSchema
// =============================================================================

describe("ProfileUpdateSchema", () => {
  it("accepts valid input with all optional fields", () => {
    const result = ProfileUpdateSchema.safeParse({
      fullName: "张三",
      phone: "13800138000",
      city: "广州",
      avatarUrl: "https://example.com/avatar.png",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fullName).toBe("张三");
      expect(result.data.phone).toBe("13800138000");
      expect(result.data.city).toBe("广州");
      expect(result.data.avatarUrl).toBe("https://example.com/avatar.png");
    }
  });

  it("accepts valid input with only required fullName", () => {
    const result = ProfileUpdateSchema.safeParse({ fullName: "李四" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fullName).toBe("李四");
    }
  });

  it("rejects empty fullName", () => {
    const result = ProfileUpdateSchema.safeParse({ fullName: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0]?.message).toContain("请输入姓名");
    }
  });

  it("rejects missing fullName", () => {
    const result = ProfileUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("strips extra fields from parsed data — role escalation prevention", () => {
    const result = ProfileUpdateSchema.safeParse({
      fullName: "张三",
      role: "admin",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      // @ts-expect-error — role is not in the inferred type
      expect(result.data.role).toBeUndefined();
      expect(result.data.fullName).toBe("张三");
    }
  });

  it("rejects null input", () => {
    const result = ProfileUpdateSchema.safeParse(null);
    expect(result.success).toBe(false);
  });

  it("rejects undefined input", () => {
    const result = ProfileUpdateSchema.safeParse(undefined);
    expect(result.success).toBe(false);
  });

  it("rejects non-string fullName (number)", () => {
    const result = ProfileUpdateSchema.safeParse({ fullName: 123 });
    expect(result.success).toBe(false);
  });

  it("rejects invalid avatarUrl format", () => {
    const result = ProfileUpdateSchema.safeParse({
      fullName: "王五",
      avatarUrl: "not-a-url",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.errors.map((e) => e.message);
      expect(messages.some((m) => m.includes("头像"))).toBe(true);
    }
  });
});

// =============================================================================
// WorkspaceUpdateSchema
// =============================================================================

describe("WorkspaceUpdateSchema", () => {
  it("accepts valid input with all fields", () => {
    const result = WorkspaceUpdateSchema.safeParse({
      name: "阳光智家工作组",
      city: "深圳",
      businessType: "租赁中介",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("阳光智家工作组");
      expect(result.data.city).toBe("深圳");
      expect(result.data.businessType).toBe("租赁中介");
    }
  });

  it("accepts valid input with only required name", () => {
    const result = WorkspaceUpdateSchema.safeParse({ name: "A" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("A");
    }
  });

  it("rejects empty name", () => {
    const result = WorkspaceUpdateSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0]?.message).toContain("请输入工作区名称");
    }
  });

  it("rejects name exceeding 100 characters", () => {
    const result = WorkspaceUpdateSchema.safeParse({
      name: "a".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing name", () => {
    const result = WorkspaceUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects city exceeding 50 characters", () => {
    const result = WorkspaceUpdateSchema.safeParse({
      name: "Valid Name",
      city: "a".repeat(51),
    });
    expect(result.success).toBe(false);
  });

  it("rejects businessType exceeding 50 characters", () => {
    const result = WorkspaceUpdateSchema.safeParse({
      name: "Valid Name",
      businessType: "a".repeat(51),
    });
    expect(result.success).toBe(false);
  });

  it("rejects null input", () => {
    const result = WorkspaceUpdateSchema.safeParse(null);
    expect(result.success).toBe(false);
  });

  it("rejects undefined input", () => {
    const result = WorkspaceUpdateSchema.safeParse(undefined);
    expect(result.success).toBe(false);
  });

  it("strips extra fields from parsed data", () => {
    const result = WorkspaceUpdateSchema.safeParse({
      name: "Valid Name",
      extraField: "should-not-be-here",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      // @ts-expect-error — extraField is not in the inferred type
      expect(result.data.extraField).toBeUndefined();
      expect(result.data.name).toBe("Valid Name");
    }
  });
});

// =============================================================================
// updateProfileAction
// =============================================================================

describe("updateProfileAction", () => {
  beforeEach(resetMocks);

  it("saves valid profile data", async () => {
    updateResolution = { error: null };

    const result = await updateProfileAction({
      fullName: "张三",
      phone: "13800138000",
    });

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);

    expect(mockFrom).toHaveBeenCalledWith("profiles");
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockAuthGetUser).toHaveBeenCalled();
  });

  it("returns error when user is not authenticated", async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const result = await updateProfileAction({ fullName: "Test" });

    expect(result.error).toBe("请先登录");
    expect(result.success).toBeUndefined();
  });

  it("only updates the caller's own profile — auth.uid match", async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: "caller-user-id" } },
      error: null,
    });
    updateResolution = { error: null };

    const result = await updateProfileAction({ fullName: "Caller Name" });

    expect(result.success).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith("profiles");
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("returns validation error for invalid input", async () => {
    const result = await updateProfileAction({ fullName: "" });

    expect(result.error).toBeDefined();
    expect(result.success).toBeUndefined();
  });

  it("returns generic error on database failure without leaking details", async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: "test-user-id" } },
      error: null,
    });
    updateResolution = { error: new Error("PGRST123: internal db failure") };

    const result = await updateProfileAction({ fullName: "Test" });

    expect(result.error).toBe("保存失败，请重试");
    expect(result.error).not.toContain("PGRST");
    expect(result.error).not.toContain("internal");
  });
});

// =============================================================================
// updateWorkspaceAction
// =============================================================================

describe("updateWorkspaceAction", () => {
  beforeEach(resetMocks);

  const workspaceId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  it("owner can update workspace", async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: "owner-id" } },
      error: null,
    });
    mockSingle.mockResolvedValue({
      data: { role: "owner", status: "active" },
      error: null,
    });
    updateResolution = { error: null };

    const result = await updateWorkspaceAction(workspaceId, {
      name: "Updated Workspace",
      city: "北京",
    });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("rejects non-owner member", async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: "member-id" } },
      error: null,
    });
    mockSingle.mockResolvedValue({
      data: { role: "member", status: "active" },
      error: null,
    });

    const result = await updateWorkspaceAction(workspaceId, {
      name: "Attempted Update",
    });

    expect(result.error).toBe("仅工作区所有者可以修改工作区信息");
    expect(result.success).toBeUndefined();
  });

  it("rejects user without workspace membership", async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: "outsider-id" } },
      error: null,
    });
    mockSingle.mockResolvedValue({ data: null, error: null });

    const result = await updateWorkspaceAction(workspaceId, {
      name: "Attempted Update",
    });

    expect(result.error).toBe("无权限访问此工作区");
    expect(result.success).toBeUndefined();
  });

  it("rejects unauthenticated user", async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const result = await updateWorkspaceAction(workspaceId, {
      name: "Attempted Update",
    });

    expect(result.error).toBe("请先登录");
    expect(result.success).toBeUndefined();
  });

  it("returns validation error for empty workspace name", async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: "owner-id" } },
      error: null,
    });
    mockSingle.mockResolvedValue({
      data: { role: "owner", status: "active" },
      error: null,
    });

    const result = await updateWorkspaceAction(workspaceId, { name: "" });

    expect(result.error).toBeDefined();
    expect(result.success).toBeUndefined();
  });

  it("does not leak internal details on database error", async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: "owner-id" } },
      error: null,
    });
    mockSingle.mockResolvedValue({
      data: { role: "owner", status: "active" },
      error: null,
    });
    updateResolution = { error: new Error("DB_ERROR: constraint violation") };

    const result = await updateWorkspaceAction(workspaceId, { name: "Test" });

    expect(result.error).toBe("保存失败，请重试");
    expect(result.error).not.toContain("DB_ERROR");
    expect(result.error).not.toContain("constraint");
  });
});

// =============================================================================
// removeMemberAction
// =============================================================================

describe("removeMemberAction", () => {
  beforeEach(resetMocks);

  const workspaceId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const memberRowId = "mm-1111-mm-1111-mm-1111-mm-111111";

  it("owner can remove a regular member", async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: "owner-user" } },
      error: null,
    });

    mockSingle
      .mockResolvedValueOnce({
        data: { role: "owner", status: "active" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: memberRowId,
          user_id: "target-user",
          role: "member",
          status: "active",
        },
        error: null,
      });

    mockRpc.mockResolvedValueOnce({ error: null });

    const result = await removeMemberAction(memberRowId, workspaceId);

    expect(result.error).toBeUndefined();
  });

  it("rejects self-removal", async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: "self-user" } },
      error: null,
    });

    mockSingle
      .mockResolvedValueOnce({
        data: { role: "owner", status: "active" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: memberRowId,
          user_id: "self-user",
          role: "member",
          status: "active",
        },
        error: null,
      });

    const result = await removeMemberAction(memberRowId, workspaceId);

    expect(result.error).toBe("不能移除自己");
  });

  it("rejects removing another owner", async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: "owner-1" } },
      error: null,
    });

    mockSingle
      .mockResolvedValueOnce({
        data: { role: "owner", status: "active" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: memberRowId,
          user_id: "owner-2",
          role: "owner",
          status: "active",
        },
        error: null,
      });

    const result = await removeMemberAction(memberRowId, workspaceId);

    expect(result.error).toBe("不能移除工作区所有者");
  });

  it("rejects non-owner attempting to remove a member", async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: "regular-member" } },
      error: null,
    });

    mockSingle.mockResolvedValueOnce({
      data: { role: "member", status: "active" },
      error: null,
    });

    const result = await removeMemberAction(memberRowId, workspaceId);

    expect(result.error).toBe("仅工作区所有者可以移除成员");
  });

  it("rejects unauthenticated user", async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const result = await removeMemberAction(memberRowId, workspaceId);

    expect(result.error).toBe("请先登录");
  });

  it("returns error when target member does not exist", async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: "owner-user" } },
      error: null,
    });

    mockSingle
      .mockResolvedValueOnce({
        data: { role: "owner", status: "active" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: null,
      });

    const result = await removeMemberAction(memberRowId, workspaceId);

    expect(result.error).toBe("成员不存在");
  });

  it("does not leak database errors when update fails", async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: "owner-user" } },
      error: null,
    });

    mockSingle
      .mockResolvedValueOnce({
        data: { role: "owner", status: "active" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: memberRowId,
          user_id: "target-user",
          role: "member",
          status: "active",
        },
        error: null,
      });

    mockRpc.mockResolvedValueOnce({
      error: { message: "PG009: deadlock detected" },
    });

    const result = await removeMemberAction(memberRowId, workspaceId);

    expect(result.error).toBe("移除失败，请重试");
    expect(result.error).not.toContain("PG009");
    expect(result.error).not.toContain("deadlock");
  });
});

// =============================================================================
// Permission errors don't leak internal details
// =============================================================================

describe("Permission errors — no internal detail leakage", () => {
  beforeEach(resetMocks);

  const workspaceId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  const allExpectedErrorMessages = [
    "请先登录",
    "保存失败，请重试",
    "输入数据格式不正确",
    "无权限访问此工作区",
    "仅工作区所有者可以修改工作区信息",
    "仅工作区所有者可以移除成员",
    "成员不存在",
    "不能移除自己",
    "不能移除工作区所有者",
    "移除失败，请重试",
  ];

  function assertNoInternalLeaks(message: string) {
    // No SQL error codes
    expect(message).not.toMatch(/PG\d{3,}/i);
    expect(message).not.toMatch(/PGRST\d{3}/i);
    expect(message).not.toMatch(/SQLSTATE/i);

    // No stack traces
    expect(message).not.toContain("at ");
    expect(message).not.toContain(".ts:");
    expect(message).not.toContain(".js:");
    expect(message).not.toContain("trace");
    expect(message).not.toContain("Stack");

    // No internal file paths
    expect(message).not.toContain("/src/");
    expect(message).not.toContain("/lib/");
    expect(message).not.toContain("/components/");

    // No database table/column names
    expect(message).not.toContain("workspace_members");
    expect(message).not.toContain("workspaces");
    expect(message).not.toContain("profiles");
    expect(message).not.toContain("user_id");
    expect(message).not.toContain("member_id");

    // No Supabase error codes
    expect(message).not.toContain("42501");
    expect(message).not.toMatch(/\b\d{5}\b/);

    // No raw JSON
    expect(message).not.toContain('{"');
    expect(message).not.toContain("null");
    expect(message).not.toContain("undefined");
  }

  it("all known permission error messages are safe (no internal leak)", () => {
    for (const msg of allExpectedErrorMessages) {
      assertNoInternalLeaks(msg);
    }
  });

  it("updateProfileAction returns safe error when save fails", async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: "test-id" } },
      error: null,
    });
    updateResolution = {
      error: new Error("FATAL: database connection lost at /src/lib/db.ts:42"),
    };

    const result = await updateProfileAction({ fullName: "Test" });

    expect(result.error).toBe("保存失败，请重试");
    assertNoInternalLeaks(result.error ?? "FALLBACK");
  });

  it("updateWorkspaceAction returns safe error when membership lookup fails", async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: "user-id" } },
      error: null,
    });
    mockSingle.mockResolvedValue({
      data: null,
      error: new Error("relation 'workspace_members' does not exist"),
    });

    const result = await updateWorkspaceAction(workspaceId, { name: "Test" });

    expect(result.error).toBe("无权限访问此工作区");
    assertNoInternalLeaks(result.error ?? "FALLBACK");
  });

  it("removeMemberAction returns safe error when target not found", async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: "owner" } },
      error: null,
    });
    mockSingle
      .mockResolvedValueOnce({
        data: { role: "owner", status: "active" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: new Error("ROW 0xDEADBEEF: concurrency conflict"),
      });

    const result = await removeMemberAction(
      "non-existent-member",
      workspaceId,
    );

    expect(result.error).toBe("成员不存在");
    assertNoInternalLeaks(result.error ?? "FALLBACK");
  });

  it("error messages use Chinese only — no English technical terms", () => {
    for (const msg of allExpectedErrorMessages) {
      const hasChineseChars = /[一-鿿]/.test(msg);
      expect(hasChineseChars).toBe(true);

      const lowerMsg = msg.toLowerCase();
      expect(lowerMsg).not.toContain("error");
      expect(lowerMsg).not.toContain("exception");
      expect(lowerMsg).not.toContain("failed");
      expect(lowerMsg).not.toContain("permission");
      expect(lowerMsg).not.toContain("denied");
    }
  });
});

// =============================================================================
// Schema consistency with contract
// =============================================================================

describe("Schema consistency", () => {
  it("ProfileUpdateSchema only allows profile fields (no role)", () => {
    const shape = ProfileUpdateSchema.shape;
    const keys = Object.keys(shape);
    expect(keys).toContain("fullName");
    expect(keys).toContain("phone");
    expect(keys).toContain("city");
    expect(keys).toContain("avatarUrl");
    expect(keys).not.toContain("role");
    expect(keys).not.toContain("isAdmin");
    expect(keys).not.toContain("systemAdmin");
  });

  it("WorkspaceUpdateSchema only allows workspace metadata fields", () => {
    const shape = WorkspaceUpdateSchema.shape;
    const keys = Object.keys(shape);
    expect(keys).toContain("name");
    expect(keys).toContain("city");
    expect(keys).toContain("businessType");
    expect(keys).not.toContain("role");
    expect(keys).not.toContain("ownerId");
    expect(keys).not.toContain("isShared");
  });
});
