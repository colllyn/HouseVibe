"use client";

import * as React from "react";
import Link from "next/link";
import { Search, Users, ShieldCheck, ChevronRight, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  workspace_count: number;
  is_admin: boolean;
}

export default function AdminUsersPage() {
  const [users, setUsers] = React.useState<UserRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [grantingId, setGrantingId] = React.useState<string | null>(null);
  const [revokingId, setRevokingId] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const supabaseRef = React.useRef(createClient());

  async function fetchUsers() {
    setLoading(true);
    setError(null);
    try {
      const supabase = supabaseRef.current;

      // Fetch profiles
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, email, full_name, created_at")
        .order("created_at", { ascending: false });

      if (profileError) throw profileError;

      // Fetch system admins via RPC
      const { data: admins, error: adminError } = await supabase.rpc(
        "list_system_admins"
      );

      if (adminError) throw adminError;

      const adminUserIds = new Set(
        (admins as Array<{ user_id: string }> | null)?.map(
          (a) => a.user_id
        ) ?? []
      );

      // Fetch workspace counts per user
      const workspaceCounts = new Map<string, number>();
      for (const profile of profiles ?? []) {
        const { count, error: wcError } = await supabase
          .from("workspace_members")
          .select("*", { count: "exact", head: true })
          .eq("user_id", profile.id)
          .eq("status", "active");

        if (!wcError && count !== null) {
          workspaceCounts.set(profile.id, count);
        } else {
          workspaceCounts.set(profile.id, 0);
        }
      }

      const mapped: UserRow[] = (profiles ?? []).map((p) => ({
        id: p.id,
        email: p.email ?? "",
        full_name: p.full_name,
        created_at: p.created_at ?? "",
        workspace_count: workspaceCounts.get(p.id) ?? 0,
        is_admin: adminUserIds.has(p.id),
      }));

      setUsers(mapped);
    } catch {
      setError("获取用户列表失败，请重试");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    fetchUsers();
  }, []);

  // Filtered users based on search
  const filteredUsers = React.useMemo(() => {
    if (!searchQuery.trim()) return users;
    const q = searchQuery.toLowerCase();
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.full_name && u.full_name.toLowerCase().includes(q))
    );
  }, [users, searchQuery]);

  async function handleGrantAdmin(userId: string) {
    setGrantingId(userId);
    setActionError(null);
    try {
      const supabase = supabaseRef.current;
      const { error } = await supabase.rpc("grant_system_admin", {
        p_user_id: userId,
      });

      if (error) throw error;

      await fetchUsers();
    } catch {
      setActionError("授权失败，请重试");
    } finally {
      setGrantingId(null);
    }
  }

  async function handleRevokeAdmin(userId: string) {
    const confirmed = window.confirm("确定要撤销此用户的管理员权限吗？");
    if (!confirmed) return;

    setRevokingId(userId);
    setActionError(null);
    try {
      const supabase = supabaseRef.current;
      const { error } = await supabase.rpc("revoke_system_admin", {
        p_user_id: userId,
      });

      if (error) throw error;

      await fetchUsers();
    } catch {
      setActionError("撤销失败，请重试");
    } finally {
      setRevokingId(null);
    }
  }

  // --- Render helpers ---

  function renderUserCard(user: UserRow) {
    return (
      <div
        key={user.id}
        className="rounded-lg border bg-card p-4 space-y-3"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm truncate">
              {user.full_name || user.email}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {user.email}
            </p>
          </div>
          {user.is_admin && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
                "text-xs font-medium",
                "bg-primary/10 text-primary",
                "flex-shrink-0"
              )}
            >
              <ShieldCheck className="h-3 w-3" />
              管理员
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>工作区: {user.workspace_count}</span>
          <span>
            注册: {new Date(user.created_at).toLocaleDateString("zh-CN")}
          </span>
        </div>

        <div className="flex gap-2 pt-1 border-t">
          {user.is_admin ? (
            <button
              type="button"
              onClick={() => handleRevokeAdmin(user.id)}
              disabled={revokingId === user.id}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-3 py-1.5",
                "text-xs font-medium transition-colors",
                "min-h-[44px]",
                "bg-destructive/10 text-destructive hover:bg-destructive/20",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "focus:outline-none focus:ring-2 focus:ring-ring"
              )}
            >
              {revokingId === user.id ? (
                <>
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  撤销中...
                </>
              ) : (
                "撤销管理员"
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleGrantAdmin(user.id)}
              disabled={grantingId === user.id}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-3 py-1.5",
                "text-xs font-medium transition-colors",
                "min-h-[44px]",
                "bg-primary/10 text-primary hover:bg-primary/20",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "focus:outline-none focus:ring-2 focus:ring-ring"
              )}
            >
              {grantingId === user.id ? (
                <>
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  授权中...
                </>
              ) : (
                "设为管理员"
              )}
            </button>
          )}
          <Link
            href={`/admin/feature-entitlements?userId=${user.id}`}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-3 py-1.5",
              "text-xs font-medium transition-colors",
              "min-h-[44px]",
              "bg-secondary text-secondary-foreground hover:bg-secondary/80",
              "focus:outline-none focus:ring-2 focus:ring-ring"
            )}
          >
            功能授权
            <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    );
  }

  function renderDesktopRow(user: UserRow) {
    return (
      <tr
        key={user.id}
        className="border-b last:border-b-0 hover:bg-muted/40 transition-colors"
      >
        <td className="px-4 py-3">
          <div>
            <p className="font-medium text-sm">
              {user.full_name || user.email}
            </p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-muted-foreground">
          {new Date(user.created_at).toLocaleDateString("zh-CN")}
        </td>
        <td className="px-4 py-3 text-sm text-center">
          {user.workspace_count}
        </td>
        <td className="px-4 py-3">
          {user.is_admin ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
                "text-xs font-medium",
                "bg-primary/10 text-primary"
              )}
            >
              <ShieldCheck className="h-3 w-3" />
              管理员
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">普通用户</span>
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex gap-2 justify-end">
            {user.is_admin ? (
              <button
                type="button"
                onClick={() => handleRevokeAdmin(user.id)}
                disabled={revokingId === user.id}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-3 py-1.5",
                  "text-xs font-medium transition-colors",
                  "min-h-[44px]",
                  "bg-destructive/10 text-destructive hover:bg-destructive/20",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  "focus:outline-none focus:ring-2 focus:ring-ring"
                )}
              >
                {revokingId === user.id ? "撤销中..." : "撤销管理员"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleGrantAdmin(user.id)}
                disabled={grantingId === user.id}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-3 py-1.5",
                  "text-xs font-medium transition-colors",
                  "min-h-[44px]",
                  "bg-primary/10 text-primary hover:bg-primary/20",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  "focus:outline-none focus:ring-2 focus:ring-ring"
                )}
              >
                {grantingId === user.id ? "授权中..." : "设为管理员"}
              </button>
            )}
            <Link
              href={`/admin/feature-entitlements?userId=${user.id}`}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-3 py-1.5",
                "text-xs font-medium transition-colors",
                "min-h-[44px]",
                "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                "focus:outline-none focus:ring-2 focus:ring-ring"
              )}
            >
              功能授权
            </Link>
          </div>
        </td>
      </tr>
    );
  }

  // --- Loading / Error states ---
  if (loading) {
    return (
      <div className="p-4 md:p-8">
        <LoadingState message="正在加载用户列表..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 md:p-8">
        <ErrorState
          title="加载失败"
          description={error}
          onRetry={fetchUsers}
        />
      </div>
    );
  }

  // --- Main render ---
  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold">用户管理</h1>
        <p className="text-sm text-muted-foreground mt-1">
          管理系统用户和管理员权限
        </p>
      </div>

      {/* Action error banner */}
      {actionError && (
        <div
          role="alert"
          className="mb-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {actionError}
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="ml-2 underline hover:no-underline"
          >
            关闭
          </button>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索邮箱或姓名..."
          className={cn(
            "w-full rounded-md border bg-background pl-10 pr-4 py-2",
            "text-sm",
            "placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-2 focus:ring-ring",
            "min-h-[44px]"
          )}
        />
      </div>

      {/* Content */}
      {filteredUsers.length === 0 ? (
        <EmptyState
          icon={<Users className="h-12 w-12" />}
          title={searchQuery ? "未找到匹配用户" : "暂无用户"}
          description={
            searchQuery
              ? "尝试其他搜索条件"
              : "当用户注册后，将在此处显示"
          }
        />
      ) : (
        <>
          {/* Mobile: Cards */}
          <div className="space-y-3 md:hidden">
            {filteredUsers.map(renderUserCard)}
          </div>

          {/* Desktop: Table */}
          <div className="hidden md:block rounded-lg border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                      用户
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                      注册时间
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">
                      工作区
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                      角色
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(renderDesktopRow)}
                </tbody>
              </table>
            </div>
          </div>

          {/* User count */}
          <p className="mt-4 text-xs text-muted-foreground">
            共 {filteredUsers.length} 位用户
          </p>
        </>
      )}
    </div>
  );
}
