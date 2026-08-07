"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Export the authenticated user's data.
 *
 * Fetches the user's profile and workspace memberships
 * and returns a structured JSON object suitable for download.
 */
export async function exportDataAction(): Promise<{
  error?: string;
  success?: boolean;
  data?: Record<string, unknown>;
}> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "请先登录" };
  }

  // Fetch profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // Fetch workspace memberships — only active, non-deleted workspaces
  const { data: memberships } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, status, created_at, workspaces (name)")
    .eq("user_id", user.id)
    .eq("status", "active");

  type MemberRow = typeof memberships extends readonly (infer T)[] | null ? T : never;

  return {
    success: true,
    data: {
      exportedAt: new Date().toISOString(),
      profile: profile ?? null,
      email: user.email,
      memberships: (memberships ?? []).filter(
        (m: MemberRow) => m !== null
      ),
    },
  };
}

/**
 * Soft-delete the authenticated user's profile.
 *
 * Sets deleted_at on the profiles table and marks all workspace
 * memberships as inactive. User can still log in but will see
 * account-deactivated state. Full deletion requires admin review.
 */
export async function deleteAccountAction(): Promise<{
  error?: string;
  success?: boolean;
}> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "请先登录" };
  }

  // Soft-delete profile
  const { error: profileErr } = await supabase
    .from("profiles")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", user.id);

  if (profileErr) {
    return { error: "操作失败，请重试" };
  }

  // Deactivate all workspace memberships
  await supabase
    .from("workspace_members")
    .update({ status: "inactive" })
    .eq("user_id", user.id)
    .eq("status", "active");

  return { success: true };
}
