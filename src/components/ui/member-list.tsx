"use client";

import * as React from "react";
import {
  User,
  Crown,
  ShieldCheck,
  UserPlus,
  MoreHorizontal,
} from "lucide-react";
import { SettingsSection } from "@/components/ui/settings-section";
import { SettingsFormCard } from "@/components/ui/settings-form-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { cn } from "@/lib/utils";

// --- Types ---

export interface MemberListMember {
  /** The workspace_members row id */
  id: string;
  /** The user profile id */
  userId: string;
  fullName: string | null;
  avatarUrl: string | null;
  email: string | null;
  role: "owner" | "member" | "external_collaborator";
  status: "active" | "inactive" | "invited";
}

export interface MemberListProps {
  /** List of workspace members */
  members: MemberListMember[];
  /** Whether members are still loading */
  isLoading: boolean;
  /** Error loading members */
  error: string | null;
  /** Whether the current user is the workspace owner */
  isOwner: boolean;
  /** The current user's profile id */
  currentUserId: string;
  /** Retry loading members */
  onRetry: () => void;
  /** Remove a member — returns error message on failure */
  onRemoveMember: (member: MemberListMember) => Promise<{ error?: string }>;
}

// --- Helpers ---

const roleLabels: Record<string, string> = {
  owner: "所有者",
  member: "成员",
  external_collaborator: "外部协作",
};

const statusLabels: Record<string, string> = {
  active: "正常",
  inactive: "已禁用",
  invited: "待接受",
};

// --- Component ---

export function MemberList({
  members,
  isLoading,
  error,
  isOwner,
  currentUserId,
  onRetry,
  onRemoveMember,
}: MemberListProps) {
  const [memberToRemove, setMemberToRemove] =
    React.useState<MemberListMember | null>(null);
  const [removeError, setRemoveError] = React.useState<string | null>(null);
  const [isRemoving, setIsRemoving] = React.useState(false);
  // Track success message per-member for feedback
  const [removedMembers, setRemovedMembers] = React.useState<Set<string>>(
    new Set()
  );

  // Loading state
  if (isLoading) {
    return (
      <SettingsSection title="成员管理" description="管理工作区成员和权限">
        <SettingsFormCard title="成员列表">
          <LoadingState message="加载成员列表..." />
        </SettingsFormCard>
      </SettingsSection>
    );
  }

  // Error state
  if (error) {
    return (
      <SettingsSection title="成员管理" description="管理工作区成员和权限">
        <SettingsFormCard title="成员列表">
          <ErrorState
            title="加载失败"
            description={error}
            onRetry={onRetry}
          />
        </SettingsFormCard>
      </SettingsSection>
    );
  }

  // Empty state
  if (members.length === 0) {
    return (
      <SettingsSection title="成员管理" description="管理工作区成员和权限">
        <SettingsFormCard title="成员列表">
          <EmptyState
            title="暂无成员"
            description="尚未有成员加入此工作区"
          />
        </SettingsFormCard>
      </SettingsSection>
    );
  }

  const handleRemoveClick = (member: MemberListMember) => {
    setRemoveError(null);
    setMemberToRemove(member);
  };

  const handleRemoveConfirm = async () => {
    if (!memberToRemove) return;

    setIsRemoving(true);
    setRemoveError(null);

    try {
      const result = await onRemoveMember(memberToRemove);

      if (result.error) {
        setRemoveError(result.error);
      } else {
        setRemovedMembers((prev) => new Set(prev).add(memberToRemove.id));
        setMemberToRemove(null);
      }
    } catch {
      setRemoveError("移除失败，请重试");
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <SettingsSection title="成员管理" description="管理工作区成员和权限">
      <SettingsFormCard
        title={`成员列表 · ${members.length} 人`}
        error={removeError}
      >
        <ul className="divide-y -mx-5 -my-3">
          {members.map((member) => {
            // If the member has been removed, show a removed state
            if (removedMembers.has(member.id)) {
              return (
                <li
                  key={member.id}
                  className="px-5 py-3 text-sm text-muted-foreground"
                >
                  该成员已被移除
                </li>
              );
            }

            const isSelf = member.userId === currentUserId;
            const canRemove =
              isOwner && !isSelf && member.role !== "owner";

            return (
              <li key={member.id} className="px-5 py-3">
                <div className="flex items-center justify-between gap-3">
                  {/* Left: avatar + name */}
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Avatar */}
                    <div
                      className={cn(
                        "h-10 w-10 flex-shrink-0 rounded-full",
                        "flex items-center justify-center",
                        "bg-muted text-muted-foreground",
                        "border text-sm font-medium",
                        "overflow-hidden"
                      )}
                    >
                      {member.avatarUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element -- dynamic Supabase storage URLs require onError fallback; next/image impractical */
                        <img
                          src={member.avatarUrl}
                          alt=""
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display =
                              "none";
                          }}
                        />
                      ) : (
                        <User className="h-5 w-5" />
                      )}
                    </div>

                    {/* Name + email */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {member.fullName || "未设置姓名"}
                        </span>
                        {isSelf ? (
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            (我)
                          </span>
                        ) : null}
                      </div>
                      {member.email ? (
                        <p className="text-xs text-muted-foreground truncate">
                          {member.email}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {/* Right: badges + actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Role badge */}
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
                        member.role === "owner"
                          ? "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                          : member.role === "member"
                            ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                      )}
                    >
                      {member.role === "owner" ? (
                        <Crown className="h-3 w-3" />
                      ) : member.role === "member" ? (
                        <ShieldCheck className="h-3 w-3" />
                      ) : (
                        <UserPlus className="h-3 w-3" />
                      )}
                      {roleLabels[member.role] || member.role}
                    </span>

                    {/* Status badge */}
                    {member.status !== "active" ? (
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          member.status === "inactive"
                            ? "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {statusLabels[member.status] || member.status}
                      </span>
                    ) : null}

                    {/* Remove button */}
                    {canRemove ? (
                      <button
                        type="button"
                        onClick={() => handleRemoveClick(member)}
                        className={cn(
                          "inline-flex items-center justify-center rounded-md",
                          "h-8 w-8",
                          "text-muted-foreground hover:text-destructive hover:bg-destructive/10",
                          "transition-colors",
                          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                        )}
                        title="移除成员"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </SettingsFormCard>

      {/* Remove confirmation dialog */}
      <ConfirmDialog
        open={memberToRemove !== null}
        onOpenChange={(open) => {
          if (!open) {
            setMemberToRemove(null);
            setRemoveError(null);
          }
        }}
        title="移除成员"
        description={`确定要将 ${memberToRemove?.fullName || "该成员"} 从工作区中移除吗？移除后该成员将无法访问此工作区的任何数据。`}
        confirmLabel={isRemoving ? "移除中..." : "确认移除"}
        variant="destructive"
        isLoading={isRemoving}
        onConfirm={handleRemoveConfirm}
      />
    </SettingsSection>
  );
}
