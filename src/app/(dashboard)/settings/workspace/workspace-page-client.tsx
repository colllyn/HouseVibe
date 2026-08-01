"use client";

import { useRouter } from "next/navigation";
import { WorkspaceForm } from "@/components/ui/workspace-form";
import { MemberList, type MemberListMember } from "@/components/ui/member-list";
import { updateWorkspaceFormAction, removeMemberFormAction } from "./actions";

interface WorkspacePageClientProps {
  workspaceId: string;
  workspaceData: {
    name: string;
    city: string | null;
    businessType: string | null;
  } | null;
  workspaceError: string | null;
  memberError: string | null;
  members: MemberListMember[];
  isOwner: boolean;
  currentUserId: string;
}

export function WorkspacePageClient({
  workspaceId,
  workspaceData,
  workspaceError,
  memberError,
  members,
  isOwner,
  currentUserId,
}: WorkspacePageClientProps) {
  const handleUpdateWorkspace = updateWorkspaceFormAction.bind(null, workspaceId);

  const router = useRouter();
  const handleRemoveMember = removeMemberFormAction.bind(null, workspaceId);

  return (
    <div className="space-y-8">
      <WorkspaceForm
        initialData={workspaceData}
        loadError={workspaceError}
        isOwner={isOwner}
        onSubmit={handleUpdateWorkspace}
      />

      <MemberList
        members={members}
        isLoading={false}
        error={memberError}
        isOwner={isOwner}
        currentUserId={currentUserId}
        onRetry={() => router.refresh()}
        onRemoveMember={handleRemoveMember}
      />
    </div>
  );
}
