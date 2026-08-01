"use server";

import { createClient } from "@/lib/supabase/server";
import { WorkspaceUpdateSchema, type WorkspaceUpdateInput } from "@/features/auth/schemas";

/**
 * Update workspace information (owner only).
 *
 * - Validates input via Zod
 * - Verifies the caller is authenticated
 * - Checks ownership via workspace_members table (service role not used)
 * - Only owner can update workspace name, city, businessType
 */
export async function updateWorkspaceAction(
  workspaceId: string,
  input: WorkspaceUpdateInput
): Promise<{ error?: string; success?: boolean }> {
  const parsed = WorkspaceUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "输入数据格式不正确" };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "请先登录" };
  }

  // Verify caller is the workspace owner
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

/**
 * Remove a member from the workspace (owner only).
 *
 * - Verifies the caller is the workspace owner
 * - Cannot remove self
 * - Cannot remove another owner (workspace must always have an owner)
 * - Sets member status to 'inactive' (soft delete per domain model)
 */
export async function removeMemberAction(
  memberId: string,
  workspaceId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "请先登录" };
  }

  // Verify caller is the workspace owner
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

  // Fetch the target member
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

  // Call the SECURITY DEFINER RPC — DB-level enforcement of self-removal
  // and owner-removal guards (belt-and-suspenders with app-layer checks above).
  const { error } = await supabase.rpc("remove_workspace_member", {
    p_member_id: memberId,
    p_workspace_id: workspaceId,
  });

  if (error) {
    // Map DB error codes to user-facing messages
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

/**
 * Wrapper for WorkspaceForm onSubmit — takes data object directly.
 * Bind workspaceId: updateWorkspaceFormAction.bind(null, workspaceId)
 */
export async function updateWorkspaceFormAction(
  workspaceId: string,
  data: { name?: string; city?: string; businessType?: string }
): Promise<{ error?: string; success?: boolean }> {
  "use server";
  return updateWorkspaceAction(workspaceId, {
    name: data.name ?? "",
    city: data.city,
    businessType: data.businessType,
  });
}

/**
 * Wrapper for MemberList onRemoveMember — takes member object directly.
 * Bind workspaceId: removeMemberFormAction.bind(null, workspaceId)
 */
export async function removeMemberFormAction(
  workspaceId: string,
  member: { id: string }
): Promise<{ error?: string }> {
  "use server";
  return removeMemberAction(member.id, workspaceId);
}
