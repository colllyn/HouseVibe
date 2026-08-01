"use server";

import { createClient } from "@/lib/supabase/server";
import { requireSystemAdmin } from "@/features/access-control/guards";
import {
  GrantEntitlementInputSchema,
  RevokeEntitlementInputSchema,
  DisableEntitlementInputSchema,
  GrantSystemAdminInputSchema,
  RevokeSystemAdminInputSchema,
} from "./schemas";
import type {
  GrantEntitlementInput,
  RevokeEntitlementInput,
  GrantSystemAdminInput,
  RevokeSystemAdminInput,
  AdminUserRow,
} from "./schemas";

// ---------------------------------------------------------------------------
// Shared result types
// ---------------------------------------------------------------------------

type ActionResult<T = void> =
  | { success: true; data: T; message: string }
  | { success: false; error: string };

// ---------------------------------------------------------------------------
// Feature Entitlement Actions
// ---------------------------------------------------------------------------

/**
 * Grant a feature entitlement to a user.
 *
 * 1. Verifies the caller is a system admin.
 * 2. Validates input with Zod.
 * 3. Calls the public.grant_feature_entitlement SECURITY DEFINER RPC.
 * 4. The RPC internally determines the granting admin via auth.uid() — never
 *    trusts client-supplied identity fields.
 * 5. Returns success or a Chinese error message. Never leaks SQL internals.
 */
export async function grantFeatureEntitlementAction(
  input: GrantEntitlementInput
): Promise<ActionResult> {
  try {
    // 1. Authorization check
    await requireSystemAdmin();

    // 2. Validate input
    const parsed = GrantEntitlementInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "输入数据格式不正确",
      };
    }

    const supabase = await createClient();

    // 3. Call the SECURITY DEFINER RPC (anon key — no service role)
    const { error } = await supabase.rpc("grant_feature_entitlement", {
      p_user_id: parsed.data.userId,
      p_feature: parsed.data.feature,
      p_expires_at: parsed.data.expiresAt ?? null,
    });

    if (error) {
      // Map known error codes to Chinese messages
      return { success: false, error: mapRpcError(error) };
    }

    // 4. Success
    return {
      success: true,
      data: undefined,
      message: "功能授权成功",
    };
  } catch (err) {
    return handleActionError(err);
  }
}

/**
 * Revoke a feature entitlement from a user.
 *
 * Immediately sets status to 'revoked'. The revocation is effective
 * immediately — has_feature will return false on next check.
 * Audit log is written by the DB trigger.
 */
export async function revokeFeatureEntitlementAction(
  input: RevokeEntitlementInput
): Promise<ActionResult> {
  try {
    await requireSystemAdmin();

    const parsed = RevokeEntitlementInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "输入数据格式不正确",
      };
    }

    const supabase = await createClient();

    const { error } = await supabase.rpc("revoke_feature_entitlement", {
      p_user_id: parsed.data.userId,
      p_feature: parsed.data.feature,
      p_reason: parsed.data.reason ?? null,
    });

    if (error) {
      return { success: false, error: mapRpcError(error) };
    }

    return {
      success: true,
      data: undefined,
      message: "功能授权已撤销",
    };
  } catch (err) {
    return handleActionError(err);
  }
}

/**
 * Disable a feature entitlement for a user.
 *
 * Disable differs from revoke: status='disabled' without recording revoked_by
 * or revoked_at. This preserves the distinction between a temporary suspension
 * (disabled) and a permanent withdrawal (revoked). A disabled entitlement can
 * be re-granted (reactivated) or revoked later.
 *
 * 1. Verifies the caller is a system admin.
 * 2. Validates input with Zod.
 * 3. Calls the public.disable_feature_entitlement SECURITY DEFINER RPC.
 * 4. The RPC internally determines the disabling admin via auth.uid() — never
 *    trusts client-supplied identity fields.
 * 5. Returns success or a Chinese error message. Never leaks SQL internals.
 */
export async function disableFeatureEntitlementAction(
  _prevState: unknown,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  try {
    await requireSystemAdmin();

    const raw = {
      userId: formData.get("userId") as string,
      feature: formData.get("feature") as string,
      reason: (formData.get("reason") as string) || undefined,
    };

    const parsed = DisableEntitlementInputSchema.safeParse(raw);
    if (!parsed.success) {
      return { error: parsed.error.errors[0]?.message ?? "输入数据格式不正确" };
    }

    const supabase = await createClient();

    const { error } = await supabase.rpc("disable_feature_entitlement", {
      p_user_id: parsed.data.userId,
      p_feature: parsed.data.feature,
      p_reason: parsed.data.reason ?? null,
    });

    if (error) {
      if (error.message.includes("FE002")) {
        return { error: "未找到活跃的功能授权" };
      }
      return { error: "禁用功能授权失败，请重试" };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "操作失败";
    if (message === "需要系统管理员权限") {
      return { error: "需要系统管理员权限" };
    }
    return { error: "操作失败，请重试" };
  }
}

// ---------------------------------------------------------------------------
// System Admin Actions
// ---------------------------------------------------------------------------

/**
 * Grant system admin status to a user.
 *
 * Cannot self-grant (enforced by the RPC). The granting admin is determined
 * by auth.uid() inside the SECURITY DEFINER RPC.
 * Audit log entry is written by the RPC.
 */
export async function grantSystemAdminAction(
  input: GrantSystemAdminInput
): Promise<ActionResult> {
  try {
    await requireSystemAdmin();

    const parsed = GrantSystemAdminInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "输入数据格式不正确",
      };
    }

    const supabase = await createClient();

    const { error } = await supabase.rpc("grant_system_admin", {
      p_user_id: parsed.data.userId,
    });

    if (error) {
      return { success: false, error: mapRpcError(error) };
    }

    return {
      success: true,
      data: undefined,
      message: "系统管理员授权成功",
    };
  } catch (err) {
    return handleActionError(err);
  }
}

/**
 * Revoke system admin status from a user.
 *
 * Audit log entry is written by the RPC.
 */
export async function revokeSystemAdminAction(
  input: RevokeSystemAdminInput
): Promise<ActionResult> {
  try {
    await requireSystemAdmin();

    const parsed = RevokeSystemAdminInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "输入数据格式不正确",
      };
    }

    const supabase = await createClient();

    const { error } = await supabase.rpc("revoke_system_admin", {
      p_user_id: parsed.data.userId,
    });

    if (error) {
      return { success: false, error: mapRpcError(error) };
    }

    return {
      success: true,
      data: undefined,
      message: "系统管理员权限已撤销",
    };
  } catch (err) {
    return handleActionError(err);
  }
}

// ---------------------------------------------------------------------------
// User Listing (Admin)
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

/**
 * List users for the admin panel.
 *
 * Returns safe fields only: id, email (when available from auth.users join),
 * full_name, workspace_count, created_at.
 *
 * Email retrieval requires a SECURITY DEFINER function that joins profiles
 * with auth.users. Currently returns null for email — this is a known
 * limitation pending a dedicated RPC for admin user listing.
 */
export async function listUsersForAdminAction(
  search?: string,
  page: number = 1
): Promise<
  | { success: true; data: { users: AdminUserRow[]; total: number; page: number }; message: string }
  | { success: false; error: string }
> {
  try {
    await requireSystemAdmin();

    const supabase = await createClient();

    // Build the profiles query.
    // System admins can read all profiles via RLS policy:
    //   "System admins can read all profiles" ON profiles
    //   FOR SELECT USING (is_system_admin());
    let query = supabase
      .from("profiles")
      .select("id, full_name, created_at", { count: "exact" });

    if (search && search.trim().length > 0) {
      query = query.ilike("full_name", `%${search.trim()}%`);
    }

    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data: profiles, count, error } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      return { success: false, error: "查询用户列表失败，请稍后重试" };
    }

    // Build workspace count map in a single query.
    // System admins can read all workspace_members via RLS policy.
    const profileIds = (profiles ?? []).map((p) => p.id);

    const countMap = new Map<string, number>();

    if (profileIds.length > 0) {
      const { data: memberships } = await supabase
        .from("workspace_members")
        .select("user_id")
        .in("user_id", profileIds)
        .eq("status", "active");

      if (memberships) {
        for (const row of memberships) {
          countMap.set(row.user_id, (countMap.get(row.user_id) ?? 0) + 1);
        }
      }
    }

    const users: AdminUserRow[] = (profiles ?? []).map((p) => ({
      id: p.id,
      // email requires a SECURITY DEFINER function joining auth.users.
      // Return null until the dedicated list_users_for_admin RPC is created.
      email: null,
      fullName: p.full_name,
      workspaceCount: countMap.get(p.id) ?? 0,
      createdAt: p.created_at,
    }));

    return {
      success: true,
      data: { users, total: count ?? 0, page },
      message: "查询成功",
    };
  } catch (err) {
    return handleActionError(err);
  }
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

/**
 * Map known Postgres error codes from SECURITY DEFINER RPCs to safe,
 * Chinese user-facing messages. Never leaks SQL internals or stack traces.
 */
function mapRpcError(error: { message?: string; code?: string }): string {
  const msg = error.message ?? "";
  const code = error.code ?? "";

  // Custom error codes from the RPCs
  if (msg.includes("Cannot self-grant")) return "不能为自己授权系统管理员权限";
  if (msg.includes("already a system admin")) return "该用户已是系统管理员";
  if (msg.includes("not an active system admin")) return "该用户不是系统管理员";
  if (msg.includes("profile not found") || msg.includes("User profile not found")) {
    return "用户不存在";
  }
  if (msg.includes("No active or disabled entitlement")) return "未找到该功能的授权记录";

  // Standard Postgres error codes
  if (code === "42501") return "权限不足";
  if (code === "US001") return "用户不存在";
  if (code === "SA001") return "该用户已是系统管理员";
  if (code === "SA002") return "该用户不是系统管理员";
  if (code === "FE001") return "未找到该功能的授权记录";
  if (code === "UA001") return "请先登录";

  // Generic fallback — never leak internal error details
  return "操作失败，请稍后重试";
}

/**
 * Catch-all error handler for actions. Converts AppError instances to
 * user-facing messages; swallows all other errors with a generic message.
 */
function handleActionError(err: unknown): { success: false; error: string } {
  if (err instanceof Error) {
    // AppError has its own Chinese message — safe to pass through
    if ("code" in err && "statusCode" in err) {
      const appErr = err as { code: string; message: string };
      // Log internally but never leak code to the user in production
      console.error(`[AdminAction] ${appErr.code}: ${appErr.message}`);
      return { success: false, error: appErr.message };
    }
  }

  // Unknown errors — generic fallback, never leak details
  console.error("[AdminAction] Unexpected error:", err);
  return { success: false, error: "服务器内部错误，请稍后重试" };
}
