"use server";

import { createClient } from "@/lib/supabase/server";
import { hashInviteToken } from "@/features/auth/invite-token";
import { requireSystemAdmin } from "@/features/access-control/guards";

// ---- Types ----

export interface CreateInviteResult {
  success?: boolean;
  error?: string;
  rawToken?: string;
  inviteId?: string;
}

export interface RevokeInviteResult {
  success?: boolean;
  error?: string;
}

// ---- Actions ----

/**
 * Create a workspace invitation.
 *
 * - Verifies system admin status
 * - Hashes the raw token with HMAC-SHA-256 (server-side secret)
 * - Inserts into invitation_links with the hash only
 * - Returns the raw token ONCE for admin to share
 */
export async function createInviteAction(
  _prevState: CreateInviteResult | null,
  formData: FormData
): Promise<CreateInviteResult> {
  try {
    await requireSystemAdmin();

    const rawToken = formData.get("rawToken") as string;
    const targetWorkspaceId = formData.get("targetWorkspaceId") as string;
    const maxUsesRaw = formData.get("maxUses") as string;
    const expiresAtRaw = formData.get("expiresAt") as string;

    if (!rawToken || rawToken.length < 16) {
      return { error: "邀请令牌无效" };
    }
    if (!targetWorkspaceId) {
      return { error: "请选择目标工作区" };
    }

    const supabase = await createClient();

    // Get the current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return { error: "请先登录" };
    }

    const tokenHash = hashInviteToken(rawToken);
    const maxUses = maxUsesRaw ? parseInt(maxUsesRaw, 10) : null;
    const expiresAt = expiresAtRaw ? new Date(expiresAtRaw).toISOString() : null;

    // Validate maxUses is positive
    if (maxUses !== null && (isNaN(maxUses) || maxUses <= 0)) {
      return { error: "最大使用次数必须大于 0" };
    }

    // Validate expiresAt is in the future
    if (expiresAt && new Date(expiresAt) <= new Date()) {
      return { error: "过期时间必须是将来的时间" };
    }

    const { data: invite, error: insertError } = await supabase
      .from("invitation_links")
      .insert({
        token_hash: tokenHash,
        created_by: user.id,
        target_workspace_id: targetWorkspaceId,
        max_uses: maxUses,
        expires_at: expiresAt,
        status: "active",
      })
      .select("id")
      .single();

    if (insertError) {
      return { error: "创建邀请失败，请重试" };
    }

    return {
      success: true,
      rawToken,
      inviteId: invite.id,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "创建邀请时发生未知错误";
    return { error: message };
  }
}

/**
 * Revoke a workspace invitation by ID.
 * Only the invitation creator (the admin) can revoke via RLS.
 */
export async function revokeInviteAction(
  inviteId: string
): Promise<RevokeInviteResult> {
  try {
    await requireSystemAdmin();

    const supabase = await createClient();

    const { error } = await supabase
      .from("invitation_links")
      .update({ status: "revoked", updated_at: new Date().toISOString() })
      .eq("id", inviteId)
      .eq("status", "active");

    if (error) {
      return { error: "撤销邀请失败" };
    }

    return { success: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "撤销邀请时发生未知错误";
    return { error: message };
  }
}

/**
 * List workspaces for invite target selection.
 * System admins can list all workspaces.
 */
export async function listWorkspacesForInviteAction(): Promise<{
  data?: Array<{ id: string; name: string }>;
  error?: string;
}> {
  try {
    await requireSystemAdmin();

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("workspaces")
      .select("id, name")
      .order("name");

    if (error) {
      return { error: "获取工作区列表失败" };
    }

    return { data: data ?? [] };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "获取工作区列表时发生未知错误";
    return { error: message };
  }
}
