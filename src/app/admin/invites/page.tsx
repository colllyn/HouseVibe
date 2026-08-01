"use client";

import * as React from "react";
import {
  UserPlus,
  Plus,
  Trash2,
  Copy,
  Check,
  RefreshCw,
  Clock,
  AlertCircle,
  XCircle,
  CheckCircle,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { ResponsiveOverlay } from "@/components/ui/responsive-overlay";
import { createInviteAction, revokeInviteAction, listWorkspacesForInviteAction } from "../actions";

// ---- Types ----

interface InviteRow {
  id: string;
  token_hash: string;
  created_by: string;
  target_workspace_id: string;
  recipient_email: string | null;
  workspace_role: string;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  status: "active" | "expired" | "revoked";
  created_at: string;
  workspace_name: string | null;
}

interface WorkspaceOption {
  id: string;
  name: string;
}

// ---- Status Badge ----

function InviteStatusBadge({ status }: { status: string }) {
  const entries: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; className: string }> = {
    active: {
      icon: CheckCircle,
      label: "有效",
      className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    },
    expired: {
      icon: Clock,
      label: "已过期",
      className: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
    },
    revoked: {
      icon: XCircle,
      label: "已撤销",
      className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    },
  };

  const c = (entries[status] ?? entries.active) as NonNullable<typeof entries[string]>;
  const Icon = c.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
        "text-xs font-medium",
        c.className
      )}
    >
      <Icon className="h-3 w-3" />
      {c.label}
    </span>
  );
}

// ---- Main Component ----

export default function AdminInvitesPage() {
  const [invites, setInvites] = React.useState<InviteRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [actionError, setActionError] = React.useState<string | null>(null);

  // Create invite form state
  const [createOverlayOpen, setCreateOverlayOpen] = React.useState(false);
  const [createSubmitting, setCreateSubmitting] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);

  // Form fields
  const [selectedWorkspace, setSelectedWorkspace] = React.useState("");
  const [maxUses, setMaxUses] = React.useState("");
  const [expiryDate, setExpiryDate] = React.useState("");
  const [expiryTime, setExpiryTime] = React.useState("");
  const [workspaceRole, setWorkspaceRole] = React.useState("member");

  // Token display (shown once after creation)
  const [createdToken, setCreatedToken] = React.useState<string | null>(null);
  const [createdInviteUrl, setCreatedInviteUrl] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  // Revoke state
  const [revokingId, setRevokingId] = React.useState<string | null>(null);

  // Workspace list for form
  const [workspaces, setWorkspaces] = React.useState<WorkspaceOption[]>([]);
  const [wsLoading, setWsLoading] = React.useState(false);

  const supabaseRef = React.useRef(createClient());

  // ---- Data Fetching ----

  async function fetchInvites() {
    setLoading(true);
    setError(null);
    try {
      const supabase = supabaseRef.current;

      // Query invitations (RLS limits to creator's own)
      const { data, error: queryError } = await supabase
        .from("invitation_links")
        .select("*")
        .order("created_at", { ascending: false });

      if (queryError) throw queryError;

      // Get workspace names
      const wsIds = [...new Set((data ?? []).map((i) => i.target_workspace_id))];
      const wsMap = new Map<string, string>();

      for (const wsId of wsIds) {
        const { data: ws } = await supabase
          .from("workspaces")
          .select("name")
          .eq("id", wsId)
          .single();

        if (ws) {
          wsMap.set(wsId, ws.name ?? "");
        }
      }

      const mapped: InviteRow[] = (data ?? []).map((i) => ({
        id: i.id,
        token_hash: i.token_hash,
        created_by: i.created_by,
        target_workspace_id: i.target_workspace_id,
        recipient_email: i.recipient_email,
        workspace_role: i.workspace_role ?? "member",
        max_uses: i.max_uses,
        used_count: i.used_count ?? 0,
        expires_at: i.expires_at,
        status: i.status,
        created_at: i.created_at ?? "",
        workspace_name: wsMap.get(i.target_workspace_id) ?? null,
      }));

      setInvites(mapped);
    } catch (err) {
      const message = err instanceof Error ? err.message : "获取邀请列表失败";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchWorkspaces() {
    setWsLoading(true);
    try {
      // Use server action for workspace listing (admin-only)
      const result = await listWorkspacesForInviteAction();
      if (result.data) {
        setWorkspaces(result.data);
      }
    } catch {
      // If server action fails, try client-side query
      try {
        const supabase = supabaseRef.current;
        const { data } = await supabase
          .from("workspaces")
          .select("id, name")
          .order("name");
        setWorkspaces(data ?? []);
      } catch {
        // Silently fail
      }
    } finally {
      setWsLoading(false);
    }
  }

  React.useEffect(() => {
    fetchInvites();
    fetchWorkspaces();
  }, []);

  // ---- Filtering ----

  const filteredInvites = React.useMemo(() => {
    if (!searchQuery.trim()) return invites;
    const q = searchQuery.toLowerCase();
    return invites.filter(
      (i) =>
        (i.workspace_name && i.workspace_name.toLowerCase().includes(q)) ||
        (i.recipient_email && i.recipient_email.toLowerCase().includes(q)) ||
        i.status.toLowerCase().includes(q)
    );
  }, [invites, searchQuery]);

  // ---- Actions ----

  async function handleCreate() {
    if (!selectedWorkspace) {
      setCreateError("请选择目标工作区");
      return;
    }

    setCreateSubmitting(true);
    setCreateError(null);

    try {
      // Generate a cryptographically random token
      const rawToken = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");

      const formData = new FormData();
      formData.set("rawToken", rawToken);
      formData.set("targetWorkspaceId", selectedWorkspace);

      if (maxUses) {
        formData.set("maxUses", maxUses);
      }

      if (expiryDate) {
        const time = expiryTime || "23:59";
        formData.set("expiresAt", `${expiryDate}T${time}:00`);
      }

      const result = await createInviteAction(null, formData);

      if (result.error) {
        setCreateError(result.error);
        return;
      }

      // Store the raw token for one-time display
      setCreatedToken(result.rawToken ?? null);

      // Build the invite URL
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
      const inviteUrl = `${appUrl}/accept-invite?token=${encodeURIComponent(result.rawToken ?? "")}`;
      setCreatedInviteUrl(inviteUrl);

      // Reset form
      setSelectedWorkspace("");
      setMaxUses("");
      setExpiryDate("");
      setExpiryTime("");
      setWorkspaceRole("member");

      // Refresh list
      await fetchInvites();
    } catch (err) {
      const message = err instanceof Error ? err.message : "创建邀请失败";
      setCreateError(message);
    } finally {
      setCreateSubmitting(false);
    }
  }

  function handleCloseTokenDisplay() {
    setCreatedToken(null);
    setCreatedInviteUrl(null);
    setCopied(false);
    setCreateOverlayOpen(false);
  }

  async function handleCopyToken() {
    if (!createdInviteUrl) return;
    try {
      await navigator.clipboard.writeText(createdInviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Clipboard API not available
    }
  }

  async function handleRevoke(inviteId: string) {
    const confirmed = window.confirm("确定要撤销此邀请吗？撤销后邀请链接将立即失效。");
    if (!confirmed) return;

    setRevokingId(inviteId);
    setActionError(null);
    try {
      const result = await revokeInviteAction(inviteId);

      if (result.error) {
        setActionError(result.error);
        return;
      }

      await fetchInvites();
    } catch (err) {
      const message = err instanceof Error ? err.message : "撤销失败";
      setActionError(message);
    } finally {
      setRevokingId(null);
    }
  }

  // ---- Render Helpers ----

  function renderInviteCard(invite: InviteRow) {
    return (
      <div key={invite.id} className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm truncate">
              {invite.workspace_name ?? invite.target_workspace_id}
            </p>
            <p className="text-xs text-muted-foreground">
              角色: {invite.workspace_role === "admin" ? "管理员" : "成员"}
            </p>
          </div>
          <InviteStatusBadge status={invite.status} />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>已用: {invite.used_count}{invite.max_uses ? `/${invite.max_uses}` : ""}</span>
          <span>
            创建: {new Date(invite.created_at).toLocaleDateString("zh-CN")}
          </span>
          {invite.expires_at && (
            <span>
              过期: {new Date(invite.expires_at).toLocaleDateString("zh-CN")}
            </span>
          )}
        </div>

        {invite.recipient_email && (
          <p className="text-xs text-muted-foreground truncate">
            收件人: {invite.recipient_email}
          </p>
        )}

        {/* Revoke button for active invites */}
        {invite.status === "active" && (
          <div className="flex gap-2 pt-1 border-t">
            <button
              type="button"
              onClick={() => handleRevoke(invite.id)}
              disabled={revokingId === invite.id}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-3 py-1.5",
                "text-xs font-medium transition-colors",
                "min-h-[44px]",
                "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
                "hover:bg-red-200 dark:hover:bg-red-900/50",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "focus:outline-none focus:ring-2 focus:ring-ring"
              )}
            >
              {revokingId === invite.id ? (
                <>
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  撤销中...
                </>
              ) : (
                <>
                  <Trash2 className="h-3 w-3" />
                  撤销邀请
                </>
              )}
            </button>
          </div>
        )}
      </div>
    );
  }

  function renderDesktopRow(invite: InviteRow) {
    return (
      <tr
        key={invite.id}
        className="border-b last:border-b-0 hover:bg-muted/40 transition-colors"
      >
        <td className="px-4 py-3">
          <div>
            <p className="font-medium text-sm">
              {invite.workspace_name ?? "未知工作区"}
            </p>
            {invite.recipient_email && (
              <p className="text-xs text-muted-foreground">{invite.recipient_email}</p>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-sm">
          {invite.workspace_role === "admin" ? "管理员" : "成员"}
        </td>
        <td className="px-4 py-3 text-sm text-center">
          {invite.used_count}{invite.max_uses ? `/${invite.max_uses}` : "/∞"}
        </td>
        <td className="px-4 py-3">
          <InviteStatusBadge status={invite.status} />
        </td>
        <td className="px-4 py-3 text-sm text-muted-foreground">
          {new Date(invite.created_at).toLocaleDateString("zh-CN")}
          {invite.expires_at && (
            <span className="block text-xs">
              至 {new Date(invite.expires_at).toLocaleDateString("zh-CN")}
            </span>
          )}
        </td>
        <td className="px-4 py-3">
          {invite.status === "active" ? (
            <button
              type="button"
              onClick={() => handleRevoke(invite.id)}
              disabled={revokingId === invite.id}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-3 py-1.5",
                "text-xs font-medium transition-colors",
                "min-h-[44px]",
                "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
                "hover:bg-red-200 dark:hover:bg-red-900/50",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "focus:outline-none focus:ring-2 focus:ring-ring"
              )}
            >
              {revokingId === invite.id ? "撤销中..." : "撤销"}
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          )}
        </td>
      </tr>
    );
  }

  // ---- Loading / Error states ----

  if (loading) {
    return (
      <div className="p-4 md:p-8">
        <LoadingState message="正在加载邀请列表..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 md:p-8">
        <ErrorState
          title="加载失败"
          description={error}
          onRetry={fetchInvites}
        />
      </div>
    );
  }

  // ---- Main render ----

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">邀请管理</h1>
          <p className="text-sm text-muted-foreground mt-1">
            管理工作区邀请链接
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreateError(null);
            setCreateOverlayOpen(true);
          }}
          className={cn(
            "inline-flex items-center gap-2 rounded-md px-4 py-2",
            "text-sm font-medium",
            "bg-primary text-primary-foreground",
            "hover:bg-primary/90 transition-colors",
            "min-h-[44px]",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          )}
        >
          <Plus className="h-4 w-4" />
          创建邀请
        </button>
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
          placeholder="搜索工作区或收件人..."
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
      {filteredInvites.length === 0 ? (
        <EmptyState
          icon={<UserPlus className="h-12 w-12" />}
          title={searchQuery ? "未找到匹配邀请" : "暂无邀请"}
          description={
            searchQuery
              ? "尝试其他搜索条件"
              : "点击「创建邀请」按钮生成邀请链接"
          }
        />
      ) : (
        <>
          {/* Mobile: Cards */}
          <div className="space-y-3 md:hidden">
            {filteredInvites.map(renderInviteCard)}
          </div>

          {/* Desktop: Table */}
          <div className="hidden md:block rounded-lg border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                      目标
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                      角色
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">
                      使用次数
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                      状态
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                      创建时间
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvites.map(renderDesktopRow)}
                </tbody>
              </table>
            </div>
          </div>

          {/* Count */}
          <p className="mt-4 text-xs text-muted-foreground">
            共 {filteredInvites.length} 个邀请
          </p>
        </>
      )}

      {/* Create invite overlay */}
      <ResponsiveOverlay
        open={createOverlayOpen}
        onOpenChange={setCreateOverlayOpen}
        title={createdToken ? "邀请已创建" : "创建邀请"}
        description={
          createdToken
            ? "请立即复制并安全保存邀请链接。关闭后将无法再次查看。"
            : "选择目标工作区并设置参数生成邀请链接"
        }
        footer={
          createdToken ? (
            <div className="flex gap-2 justify-end w-full">
              <button
                type="button"
                onClick={handleCloseTokenDisplay}
                className={cn(
                  "rounded-md px-4 py-2 text-sm font-medium",
                  "border bg-background hover:bg-muted transition-colors",
                  "min-h-[44px]",
                  "focus:outline-none focus:ring-2 focus:ring-ring"
                )}
              >
                我已保存，关闭
              </button>
            </div>
          ) : (
            <div className="flex gap-2 justify-end w-full">
              <button
                type="button"
                onClick={() => setCreateOverlayOpen(false)}
                disabled={createSubmitting}
                className={cn(
                  "rounded-md px-4 py-2 text-sm font-medium",
                  "border bg-background hover:bg-muted transition-colors",
                  "min-h-[44px]",
                  "disabled:opacity-50",
                  "focus:outline-none focus:ring-2 focus:ring-ring"
                )}
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={createSubmitting || !selectedWorkspace}
                className={cn(
                  "rounded-md px-4 py-2 text-sm font-medium",
                  "bg-primary text-primary-foreground hover:bg-primary/90 transition-colors",
                  "min-h-[44px]",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                )}
              >
                {createSubmitting ? "创建中..." : "生成邀请链接"}
              </button>
            </div>
          )
        }
      >
        {createError && !createdToken && (
          <div
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive mb-4"
          >
            {createError}
          </div>
        )}

        {createdToken ? (
          /* Token display */
          <div className="space-y-4">
            <div
              className={cn(
                "rounded-md border-2 border-destructive/40 bg-destructive/5 p-4",
                "space-y-3"
              )}
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
                <p className="text-sm font-medium text-destructive">
                  重要：此链接仅在本次显示
                </p>
              </div>

              <div className="rounded-md border bg-background p-3">
                <p className="text-xs font-mono break-all select-all leading-relaxed">
                  {createdInviteUrl}
                </p>
              </div>

              <button
                type="button"
                onClick={handleCopyToken}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md px-4 py-2",
                  "text-sm font-medium transition-colors",
                  "min-h-[44px]",
                  copied
                    ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                  "focus:outline-none focus:ring-2 focus:ring-ring"
                )}
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" />
                    已复制
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    复制邀请链接
                  </>
                )}
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              复制此链接并安全发送给受邀人。刷新页面后将无法再次查看此链接。
            </p>
          </div>
        ) : (
          /* Create form */
          <div className="space-y-4">
            {/* Workspace selection */}
            <div className="space-y-1.5">
              <label htmlFor="invite-workspace" className="text-sm font-medium">
                目标工作区
              </label>
              <select
                id="invite-workspace"
                value={selectedWorkspace}
                onChange={(e) => setSelectedWorkspace(e.target.value)}
                className={cn(
                  "w-full rounded-md border bg-background px-3 py-2 text-sm",
                  "focus:outline-none focus:ring-2 focus:ring-ring",
                  "min-h-[44px]"
                )}
              >
                <option value="">选择工作区...</option>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              {wsLoading && (
                <p className="text-xs text-muted-foreground">加载工作区列表中...</p>
              )}
            </div>

            {/* Role */}
            <div className="space-y-1.5">
              <label htmlFor="invite-role" className="text-sm font-medium">
                角色
              </label>
              <select
                id="invite-role"
                value={workspaceRole}
                onChange={(e) => setWorkspaceRole(e.target.value)}
                className={cn(
                  "w-full rounded-md border bg-background px-3 py-2 text-sm",
                  "focus:outline-none focus:ring-2 focus:ring-ring",
                  "min-h-[44px]"
                )}
              >
                <option value="member">成员</option>
                <option value="admin">管理员</option>
              </select>
            </div>

            {/* Max uses */}
            <div className="space-y-1.5">
              <label htmlFor="invite-max-uses" className="text-sm font-medium">
                最大使用次数（可选）
              </label>
              <input
                id="invite-max-uses"
                type="number"
                min="1"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                placeholder="不限制"
                className={cn(
                  "w-full rounded-md border bg-background px-3 py-2 text-sm",
                  "placeholder:text-muted-foreground",
                  "focus:outline-none focus:ring-2 focus:ring-ring",
                  "min-h-[44px]"
                )}
              />
            </div>

            {/* Expiry */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">过期时间（可选）</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className={cn(
                    "flex-1 rounded-md border bg-background px-3 py-2 text-sm",
                    "focus:outline-none focus:ring-2 focus:ring-ring",
                    "min-h-[44px]"
                  )}
                />
                <input
                  type="time"
                  value={expiryTime}
                  onChange={(e) => setExpiryTime(e.target.value)}
                  className={cn(
                    "w-32 rounded-md border bg-background px-3 py-2 text-sm",
                    "focus:outline-none focus:ring-2 focus:ring-ring",
                    "min-h-[44px]"
                  )}
                />
              </div>
            </div>
          </div>
        )}
      </ResponsiveOverlay>
    </div>
  );
}
