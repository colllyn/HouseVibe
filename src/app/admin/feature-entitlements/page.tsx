"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  Search,
  ShieldCheck,
  Plus,
  Trash2,
  Ban,
  CheckCircle,
  AlertCircle,
  XCircle,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { ResponsiveOverlay } from "@/components/ui/responsive-overlay";

// ---- Types ----

interface EntitlementRow {
  id: string;
  user_id: string;
  feature: string;
  status: "active" | "disabled" | "revoked";
  granted_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  reason: string | null;
  user_email: string;
  user_name: string | null;
}

type FeatureKey =
  | "ai_data_extraction"
  | "semantic_search"
  | "property_matching"
  | "shared_property_pool"
  | "content_factory";

const FEATURE_KEYS: FeatureKey[] = [
  "ai_data_extraction",
  "semantic_search",
  "property_matching",
  "shared_property_pool",
  "content_factory",
];

const FEATURE_LABELS: Record<string, string> = {
  ai_data_extraction: "AI 数据提取",
  semantic_search: "语义搜索",
  property_matching: "房源匹配",
  shared_property_pool: "共享房源池",
  content_factory: "内容工厂",
};

// ---- Status Badge Component ----

function StatusBadge({ status, reason }: { status: string; reason?: string | null }) {
  // Style lookup map — fallback for unknown status values
  const entries: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; className: string }> = {
    active: {
      icon: CheckCircle,
      label: "已激活",
      className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    },
    disabled: {
      icon: AlertCircle,
      label: "已禁用",
      className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
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
      title={reason ?? undefined}
    >
      <Icon className="h-3 w-3" />
      {c.label}
    </span>
  );
}

// ---- Main Component ----

export default function AdminFeatureEntitlementsPage() {
  const searchParams = useSearchParams();
  const preselectedUserId = searchParams.get("userId");

  const [entitlements, setEntitlements] = React.useState<EntitlementRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [actionError, setActionError] = React.useState<string | null>(null);

  // Grant form state
  const [grantOverlayOpen, setGrantOverlayOpen] = React.useState(false);
  const [grantSubmitting, setGrantSubmitting] = React.useState(false);
  const [grantError, setGrantError] = React.useState<string | null>(null);

  // Grant form fields
  const [selectedUser, setSelectedUser] = React.useState("");
  const [selectedFeature, setSelectedFeature] = React.useState<FeatureKey>("ai_data_extraction");
  const [expiryDate, setExpiryDate] = React.useState("");
  const [expiryTime, setExpiryTime] = React.useState("");

  // Revoke/Disable state
  const [disablingId, setDisablingId] = React.useState<string | null>(null);
  const [revokingId, setRevokingId] = React.useState<string | null>(null);

  // Users list for grant form
  const [users, setUsers] = React.useState<Array<{ id: string; email: string; full_name: string | null }>>([]);
  const [usersLoading, setUsersLoading] = React.useState(false);

  const supabaseRef = React.useRef(createClient());

  // ---- Data Fetching ----

  async function fetchEntitlements() {
    setLoading(true);
    setError(null);
    try {
      const supabase = supabaseRef.current;

      // Query entitlements directly (RLS allows system admins to read all)
      const { data, error: queryError } = await supabase
        .from("feature_entitlements")
        .select("*")
        .order("created_at", { ascending: false });

      if (queryError) throw queryError;

      // Get user details for each entitlement
      const userIds = [...new Set((data ?? []).map((e) => e.user_id))];
      const userMap = new Map<string, { email: string; full_name: string | null }>();

      for (const uid of userIds) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, email, full_name")
          .eq("id", uid)
          .single();

        if (profile) {
          userMap.set(profile.id, {
            email: profile.email ?? "",
            full_name: profile.full_name,
          });
        }
      }

      const mapped: EntitlementRow[] = (data ?? []).map((e) => {
        const user = userMap.get(e.user_id);
        return {
          id: e.id,
          user_id: e.user_id,
          feature: e.feature,
          status: e.status,
          granted_at: e.granted_at ?? "",
          expires_at: e.expires_at,
          revoked_at: e.revoked_at,
          reason: e.reason,
          user_email: user?.email ?? "",
          user_name: user?.full_name ?? null,
        };
      });

      setEntitlements(mapped);
    } catch (err) {
      const message = err instanceof Error ? err.message : "获取功能授权列表失败";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchUsers() {
    setUsersLoading(true);
    try {
      const supabase = supabaseRef.current;
      const { data, error: queryError } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .order("email");

      if (queryError) throw queryError;
      setUsers(data ?? []);
    } catch {
      // Silently fail; user can still use functionality
    } finally {
      setUsersLoading(false);
    }
  }

  React.useEffect(() => {
    fetchEntitlements();
    fetchUsers();
  }, []);

  // ---- Filtering ----

  const filteredEntitlements = React.useMemo(() => {
    if (preselectedUserId) {
      return entitlements.filter((e) => e.user_id === preselectedUserId);
    }
    if (!searchQuery.trim()) return entitlements;
    const q = searchQuery.toLowerCase();
    return entitlements.filter(
      (e) =>
        e.user_email.toLowerCase().includes(q) ||
        (e.user_name && e.user_name.toLowerCase().includes(q)) ||
        FEATURE_LABELS[e.feature]?.toLowerCase().includes(q)
    );
  }, [entitlements, searchQuery, preselectedUserId]);

  // ---- Actions ----

  async function handleGrant() {
    if (!selectedUser) {
      setGrantError("请选择用户");
      return;
    }

    setGrantSubmitting(true);
    setGrantError(null);

    try {
      const supabase = supabaseRef.current;

      // Build expiry timestamp
      let expiresAt: string | null = null;
      if (expiryDate) {
        const time = expiryTime || "23:59";
        expiresAt = new Date(`${expiryDate}T${time}:00`).toISOString();
      }

      const { error: rpcError } = await supabase.rpc("grant_feature_entitlement", {
        p_user_id: selectedUser,
        p_feature: selectedFeature,
        p_expires_at: expiresAt,
      });

      if (rpcError) throw rpcError;

      // Reset form and refresh
      setSelectedUser("");
      setSelectedFeature("ai_data_extraction");
      setExpiryDate("");
      setExpiryTime("");
      setGrantOverlayOpen(false);
      await fetchEntitlements();
    } catch {
      setGrantError("授权失败，请重试");
    } finally {
      setGrantSubmitting(false);
    }
  }

  async function handleDisable(entitlement: EntitlementRow) {
    const confirmed = window.confirm(
      `确定要禁用 "${FEATURE_LABELS[entitlement.feature] ?? entitlement.feature}" 功能吗？`
    );
    if (!confirmed) return;

    setDisablingId(entitlement.id);
    setActionError(null);
    try {
      const supabase = supabaseRef.current;
      const { error: rpcError } = await supabase.rpc("disable_feature_entitlement", {
        p_user_id: entitlement.user_id,
        p_feature: entitlement.feature,
        p_reason: "管理员禁用",
      });

      if (rpcError) throw rpcError;

      await fetchEntitlements();
    } catch {
      setActionError("禁用失败，请重试");
    } finally {
      setDisablingId(null);
    }
  }

  async function handleRevoke(entitlement: EntitlementRow) {
    const confirmed = window.confirm(
      `确定要撤销 "${FEATURE_LABELS[entitlement.feature] ?? entitlement.feature}" 功能吗？此操作不可撤销。`
    );
    if (!confirmed) return;

    setRevokingId(entitlement.id);
    setActionError(null);
    try {
      const supabase = supabaseRef.current;
      const { error: rpcError } = await supabase.rpc("revoke_feature_entitlement", {
        p_user_id: entitlement.user_id,
        p_feature: entitlement.feature,
        p_reason: null,
      });

      if (rpcError) throw rpcError;

      await fetchEntitlements();
    } catch {
      setActionError("撤销失败，请重试");
    } finally {
      setRevokingId(null);
    }
  }

  // ---- Render Helpers ----

  function renderEntitlementCard(entitlement: EntitlementRow) {
    const isExpired = entitlement.expires_at && new Date(entitlement.expires_at) < new Date();

    return (
      <div key={entitlement.id} className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm">
              {FEATURE_LABELS[entitlement.feature] ?? entitlement.feature}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {entitlement.user_name || entitlement.user_email}
            </p>
          </div>
          <StatusBadge
            status={isExpired ? "revoked" : entitlement.status}
            reason={entitlement.reason}
          />
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>
            授权: {new Date(entitlement.granted_at).toLocaleDateString("zh-CN")}
          </span>
          {entitlement.expires_at && (
            <span>
              过期: {new Date(entitlement.expires_at).toLocaleDateString("zh-CN")}
            </span>
          )}
        </div>

        {/* Action buttons for active entitlements */}
        {entitlement.status === "active" && !isExpired && (
          <div className="flex gap-2 pt-1 border-t">
            <button
              type="button"
              onClick={() => handleDisable(entitlement)}
              disabled={disablingId === entitlement.id}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-3 py-1.5",
                "text-xs font-medium transition-colors",
                "min-h-[44px]",
                "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
                "hover:bg-yellow-200 dark:hover:bg-yellow-900/50",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "focus:outline-none focus:ring-2 focus:ring-ring"
              )}
            >
              {disablingId === entitlement.id ? (
                <>
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  禁用中...
                </>
              ) : (
                <>
                  <Ban className="h-3 w-3" />
                  禁用
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => handleRevoke(entitlement)}
              disabled={revokingId === entitlement.id}
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
              {revokingId === entitlement.id ? (
                <>
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  撤销中...
                </>
              ) : (
                <>
                  <Trash2 className="h-3 w-3" />
                  撤销
                </>
              )}
            </button>
          </div>
        )}
      </div>
    );
  }

  function renderDesktopRow(entitlement: EntitlementRow) {
    const isExpired = entitlement.expires_at && new Date(entitlement.expires_at) < new Date();

    return (
      <tr
        key={entitlement.id}
        className="border-b last:border-b-0 hover:bg-muted/40 transition-colors"
      >
        <td className="px-4 py-3">
          <div>
            <p className="font-medium text-sm">
              {entitlement.user_name || entitlement.user_email}
            </p>
            <p className="text-xs text-muted-foreground">{entitlement.user_email}</p>
          </div>
        </td>
        <td className="px-4 py-3 text-sm">
          {FEATURE_LABELS[entitlement.feature] ?? entitlement.feature}
        </td>
        <td className="px-4 py-3">
          <StatusBadge
            status={isExpired ? "revoked" : entitlement.status}
            reason={entitlement.reason}
          />
        </td>
        <td className="px-4 py-3 text-sm text-muted-foreground">
          {new Date(entitlement.granted_at).toLocaleDateString("zh-CN")}
          {entitlement.expires_at && (
            <span className="block text-xs">
              至 {new Date(entitlement.expires_at).toLocaleDateString("zh-CN")}
            </span>
          )}
        </td>
        <td className="px-4 py-3">
          {entitlement.status === "active" && !isExpired ? (
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => handleDisable(entitlement)}
                disabled={disablingId === entitlement.id}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-3 py-1.5",
                  "text-xs font-medium transition-colors",
                  "min-h-[44px]",
                  "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
                  "hover:bg-yellow-200 dark:hover:bg-yellow-900/50",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  "focus:outline-none focus:ring-2 focus:ring-ring"
                )}
              >
                {disablingId === entitlement.id ? "禁用中..." : "禁用"}
              </button>
              <button
                type="button"
                onClick={() => handleRevoke(entitlement)}
                disabled={revokingId === entitlement.id}
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
                {revokingId === entitlement.id ? "撤销中..." : "撤销"}
              </button>
            </div>
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
        <LoadingState message="正在加载功能授权列表..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 md:p-8">
        <ErrorState
          title="加载失败"
          description={error}
          onRetry={fetchEntitlements}
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
          <h1 className="text-xl font-semibold">功能授权</h1>
          <p className="text-sm text-muted-foreground mt-1">
            管理用户功能授权和权限
            {preselectedUserId && (
              <span className="ml-2 text-primary">已筛选特定用户</span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setGrantError(null);
            setGrantOverlayOpen(true);
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
          授权功能
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
          placeholder="搜索用户邮箱、姓名或功能名称..."
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
      {filteredEntitlements.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="h-12 w-12" />}
          title={searchQuery ? "未找到匹配授权" : "暂无功能授权"}
          description={
            searchQuery
              ? "尝试其他搜索条件"
              : "点击「授权功能」按钮为用户添加功能"
          }
        />
      ) : (
        <>
          {/* Mobile: Cards */}
          <div className="space-y-3 md:hidden">
            {filteredEntitlements.map(renderEntitlementCard)}
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
                      功能
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                      状态
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                      授权时间
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntitlements.map(renderDesktopRow)}
                </tbody>
              </table>
            </div>
          </div>

          {/* Count */}
          <p className="mt-4 text-xs text-muted-foreground">
            共 {filteredEntitlements.length} 项授权
          </p>
        </>
      )}

      {/* Grant entitlement overlay */}
      <ResponsiveOverlay
        open={grantOverlayOpen}
        onOpenChange={setGrantOverlayOpen}
        title="授予功能授权"
        description="选择用户和功能以授予访问权限"
        footer={
          <div className="flex gap-2 justify-end w-full">
            <button
              type="button"
              onClick={() => setGrantOverlayOpen(false)}
              disabled={grantSubmitting}
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
              onClick={handleGrant}
              disabled={grantSubmitting || !selectedUser}
              className={cn(
                "rounded-md px-4 py-2 text-sm font-medium",
                "bg-primary text-primary-foreground hover:bg-primary/90 transition-colors",
                "min-h-[44px]",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              )}
            >
              {grantSubmitting ? "授权中..." : "确认授权"}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {grantError && (
            <div
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {grantError}
            </div>
          )}

          {/* User selection */}
          <div className="space-y-1.5">
            <label htmlFor="grant-user" className="text-sm font-medium">
              用户
            </label>
            <select
              id="grant-user"
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className={cn(
                "w-full rounded-md border bg-background px-3 py-2 text-sm",
                "focus:outline-none focus:ring-2 focus:ring-ring",
                "min-h-[44px]"
              )}
            >
              <option value="">选择用户...</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name || u.email} ({u.email})
                </option>
              ))}
            </select>
            {usersLoading && (
              <p className="text-xs text-muted-foreground">加载用户列表中...</p>
            )}
          </div>

          {/* Feature selection */}
          <div className="space-y-1.5">
            <label htmlFor="grant-feature" className="text-sm font-medium">
              功能
            </label>
            <select
              id="grant-feature"
              value={selectedFeature}
              onChange={(e) => setSelectedFeature(e.target.value as FeatureKey)}
              className={cn(
                "w-full rounded-md border bg-background px-3 py-2 text-sm",
                "focus:outline-none focus:ring-2 focus:ring-ring",
                "min-h-[44px]"
              )}
            >
              {FEATURE_KEYS.map((key) => (
                <option key={key} value={key}>
                  {FEATURE_LABELS[key]}
                </option>
              ))}
            </select>
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

          {/* Reason */}
          <div className="space-y-1.5">
            <label htmlFor="grant-reason" className="text-sm font-medium">
              备注（可选）
            </label>
            <textarea
              id="grant-reason"
              rows={2}
              placeholder="授权原因..."
              className={cn(
                "w-full rounded-md border bg-background px-3 py-2 text-sm",
                "placeholder:text-muted-foreground",
                "focus:outline-none focus:ring-2 focus:ring-ring"
              )}
            />
          </div>
        </div>
      </ResponsiveOverlay>
    </div>
  );
}
