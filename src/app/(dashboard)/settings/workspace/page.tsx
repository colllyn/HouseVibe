import { getAuthenticatedUser } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import { WorkspacePageClient } from "./workspace-page-client";
import type { MemberListMember } from "@/components/ui/member-list";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const user = await getAuthenticatedUser();
  if (!user) return null;
  const supabase = await createClient();

  // Find the user's active workspace membership
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, status")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!membership) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p>未找到活跃的工作区</p>
      </div>
    );
  }

  const workspaceId = membership.workspace_id;
  const isOwner = membership.role === "owner";

  // Fetch workspace details
  const { data: workspace, error: wsError } = await supabase
    .from("workspaces")
    .select("name, city, business_type")
    .eq("id", workspaceId)
    .single();

  // Fetch workspace members
  const { data: members, error: memberError } = await supabase
    .from("workspace_members")
    .select(
      `
      id,
      user_id,
      role,
      status,
      profiles!inner(full_name, avatar_url)
    `
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  const memberList: MemberListMember[] =
    members?.map((m) => ({
      id: m.id,
      userId: m.user_id,
      fullName: (m.profiles as unknown as { full_name: string | null })?.full_name ?? null,
      avatarUrl: (m.profiles as unknown as { avatar_url: string | null })?.avatar_url ?? null,
      email: null,
      role: m.role as MemberListMember["role"],
      status: m.status as MemberListMember["status"],
    })) ?? [];

  const workspaceData = workspace
    ? {
        name: workspace.name,
        city: workspace.city,
        businessType: workspace.business_type,
      }
    : null;

  return (
    <WorkspacePageClient
      workspaceId={workspaceId}
      workspaceData={workspaceData}
      workspaceError={wsError ? "加载工作区信息失败" : null}
      memberError={memberError ? "加载成员列表失败" : null}
      members={memberList}
      isOwner={isOwner}
      currentUserId={user.id}
    />
  );
}
