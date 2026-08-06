"use client";

// ============================================================
// Admin AI Usage Dashboard — P3-AI-017
// Platform-level AI usage stats, cost tracking, user limits.
// ============================================================

import { useState, useEffect, useCallback } from "react";
import type { UsageSummary, Period, GroupBy } from "@/features/ai-usage/schemas";

// ============================================================
// Types
// ============================================================

interface PageState {
  status: "loading" | "loaded" | "error";
  message?: string;
  summary: UsageSummary | null;
}

interface UserLimitsForm {
  userId: string;
  dailyRequestLimit: string;
  dailyCostLimitUsd: string;
  submitting: boolean;
  result: string | null;
  error: string | null;
}

// ============================================================
// Helpers
// ============================================================

const PERIOD_LABELS: Record<Period, string> = {
  today: "今日",
  "7d": "近 7 日",
  "30d": "近 30 日",
};

const GROUP_LABELS: Record<GroupBy, string> = {
  user: "按用户",
  workspace: "按工作区",
  feature: "按功能",
  model: "按模型",
  status: "按状态",
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(n: number): string {
  return `$${n.toFixed(4)}`;
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    succeeded: { label: "成功", className: "bg-green-100 text-green-700" },
    failed: { label: "失败", className: "bg-red-100 text-red-700" },
    reserved: { label: "预占", className: "bg-blue-100 text-blue-700" },
    rejected_compliance: { label: "合规拒绝", className: "bg-yellow-100 text-yellow-700" },
    blocked_by_cost_limit: { label: "成本熔断", className: "bg-orange-100 text-orange-700" },
    released: { label: "已释放", className: "bg-gray-100 text-gray-600" },
    rejected: { label: "拒绝", className: "bg-red-100 text-red-700" },
  };
  const m = map[status] ?? { label: status, className: "bg-gray-100 text-gray-600" };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${m.className}`}>
      {m.label}
    </span>
  );
}

// ============================================================
// Page
// ============================================================

export default function AdminAiUsagePage() {
  const [state, setState] = useState<PageState>({ status: "loading", summary: null });
  const [period, setPeriod] = useState<Period>("today");
  const [groupBy, setGroupBy] = useState<GroupBy>("feature");

  // User limits form
  const [limitsForm, setLimitsForm] = useState<UserLimitsForm>({
    userId: "",
    dailyRequestLimit: "",
    dailyCostLimitUsd: "",
    submitting: false,
    result: null,
    error: null,
  });

  const fetchUsage = useCallback(async (p: Period, g: GroupBy) => {
    setState({ status: "loading", summary: null });
    try {
      const res = await fetch(`/api/admin/ai-usage?period=${p}&groupBy=${g}`);
      const json = await res.json();
      if (!res.ok || json.error) {
        setState({ status: "error", message: json.error?.message ?? "加载失败", summary: null });
        return;
      }
      setState({ status: "loaded", summary: json.data });
    } catch {
      setState({ status: "error", message: "网络错误", summary: null });
    }
  }, []);

  useEffect(() => {
    fetchUsage(period, groupBy);
  }, [period, groupBy, fetchUsage]);

  const handlePeriodChange = (p: Period) => setPeriod(p);
  const handleGroupByChange = (g: GroupBy) => setGroupBy(g);

  const handleUpdateLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!limitsForm.userId.trim()) return;

    setLimitsForm((s) => ({ ...s, submitting: true, result: null, error: null }));

    const body: Record<string, number> = {};
    const reqLimit = parseInt(limitsForm.dailyRequestLimit, 10);
    const costLimit = parseFloat(limitsForm.dailyCostLimitUsd);
    if (!isNaN(reqLimit) && reqLimit > 0) body.daily_request_limit = reqLimit;
    if (!isNaN(costLimit) && costLimit > 0) body.daily_cost_limit_usd = costLimit;

    if (Object.keys(body).length === 0) {
      setLimitsForm((s) => ({ ...s, submitting: false, error: "请至少填写一个限制值" }));
      return;
    }

    try {
      const res = await fetch(`/api/admin/ai-usage/users/${limitsForm.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setLimitsForm((s) => ({ ...s, submitting: false, error: json.error?.message ?? "更新失败" }));
        return;
      }
      setLimitsForm((s) => ({ ...s, submitting: false, result: "用户限制已更新", error: null }));
      fetchUsage(period, groupBy);
    } catch {
      setLimitsForm((s) => ({ ...s, submitting: false, error: "网络错误" }));
    }
  };

  const handleRestoreUser = async () => {
    if (!limitsForm.userId.trim()) return;
    setLimitsForm((s) => ({ ...s, submitting: true, result: null, error: null }));

    try {
      const res = await fetch(`/api/admin/ai-usage/users/${limitsForm.userId}`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || json.error) {
        setLimitsForm((s) => ({ ...s, submitting: false, error: json.error?.message ?? "恢复失败" }));
        return;
      }
      setLimitsForm((s) => ({ ...s, submitting: false, result: "用户 AI 访问已恢复", error: null }));
      fetchUsage(period, groupBy);
    } catch {
      setLimitsForm((s) => ({ ...s, submitting: false, error: "网络错误" }));
    }
  };

  // ============================================================
  // Loading state
  // ============================================================

  if (state.status === "loading") {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">AI 用量看板</h1>
        <div className="mt-6 animate-pulse space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 rounded-lg bg-muted" />
            ))}
          </div>
          <div className="h-64 rounded-lg bg-muted" />
        </div>
      </div>
    );
  }

  // ============================================================
  // Error state
  // ============================================================

  if (state.status === "error") {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">AI 用量看板</h1>
        <div className="mt-6 rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">{state.message}</p>
          <button
            onClick={() => fetchUsage(period, groupBy)}
            className="mt-3 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  // ============================================================
  // Loaded state
  // ============================================================

  const s = state.summary;
  if (!s) {
    return null; // unreachable — status is "loaded" guarantees summary exists
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">AI 用量看板</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        查看全平台 AI 用量、成本统计与用户级配额管理。
      </p>

      {/* ================================================================
          Period & GroupBy selectors
          ================================================================ */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border">
          {(["today", "7d", "30d"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => handlePeriodChange(p)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors first:rounded-l-md last:rounded-r-md ${
                period === p
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-secondary"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        <div className="flex rounded-md border">
          {(["feature", "user", "model", "status"] as GroupBy[]).map((g) => (
            <button
              key={g}
              onClick={() => handleGroupByChange(g)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors first:rounded-l-md last:rounded-r-md ${
                groupBy === g
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-secondary"
              }`}
            >
              {GROUP_LABELS[g]}
            </button>
          ))}
        </div>
      </div>

      {/* ================================================================
          Summary stat cards
          ================================================================ */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="总 Token"
          value={formatTokens(s.totals.total_tokens)}
          detail={`${s.totals.total_requests} 次请求`}
        />
        <StatCard
          label="总成本"
          value={formatCost(s.totals.total_cost_usd)}
          detail={`${s.userCount} 位活跃用户 · 人均 ${formatCost(s.avgCostPerUser)}`}
        />
        <StatCard
          label="成功率"
          value={
            s.totals.total_requests > 0
              ? `${Math.round((s.totals.succeeded / s.totals.total_requests) * 100)}%`
              : "—"
          }
          detail={`成功 ${s.totals.succeeded} · 失败 ${s.totals.failed}`}
        />
        <StatCard
          label="拦截"
          value={String(s.totals.rejected_compliance + s.totals.blocked_by_cost_limit)}
          detail={`合规 ${s.totals.rejected_compliance} · 熔断 ${s.totals.blocked_by_cost_limit}`}
        />
      </div>

      {/* ================================================================
          Text vs Vision breakdown
          ================================================================ */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border p-4">
          <h3 className="text-sm font-semibold">文本生成</h3>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Token</dt>
              <dd>{formatTokens(s.text.total_tokens)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">成本</dt>
              <dd>{formatCost(s.text.total_cost_usd)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">请求数</dt>
              <dd>{s.text.total_requests}</dd>
            </div>
          </dl>
        </div>
        <div className="rounded-lg border p-4">
          <h3 className="text-sm font-semibold">视觉分析</h3>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Token</dt>
              <dd>{formatTokens(s.vision.total_tokens)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">成本</dt>
              <dd>{formatCost(s.vision.total_cost_usd)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">请求数</dt>
              <dd>{s.vision.total_requests}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* ================================================================
          Grouped stats table (empty state handled)
          ================================================================ */}
      <div className="mt-6">
        <h2 className="text-lg font-semibold">{GROUP_LABELS[groupBy]}统计</h2>
        {s.groups.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">暂无数据</p>
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2 text-left font-medium">
                    {groupBy === "user" ? "用户 ID" :
                     groupBy === "workspace" ? "工作区" :
                     groupBy === "model" ? "模型" :
                     groupBy === "status" ? "状态" : "功能"}
                  </th>
                  <th className="px-4 py-2 text-right font-medium">Token</th>
                  <th className="px-4 py-2 text-right font-medium">成本</th>
                  <th className="px-4 py-2 text-right font-medium">请求数</th>
                  <th className="px-4 py-2 text-right font-medium">成功</th>
                  <th className="px-4 py-2 text-right font-medium">失败</th>
                  <th className="px-4 py-2 text-right font-medium">人均成本</th>
                </tr>
              </thead>
              <tbody>
                {s.groups.map((g) => (
                  <tr key={g.key} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2 font-mono text-xs">
                      {groupBy === "status" ? statusBadge(g.key) : g.label || g.key}
                    </td>
                    <td className="px-4 py-2 text-right">{formatTokens(g.total_tokens)}</td>
                    <td className="px-4 py-2 text-right">{formatCost(g.estimated_cost_usd)}</td>
                    <td className="px-4 py-2 text-right">{g.total_requests}</td>
                    <td className="px-4 py-2 text-right text-green-600">{g.succeeded}</td>
                    <td className="px-4 py-2 text-right text-red-600">{g.failed}</td>
                    <td className="px-4 py-2 text-right">{formatCost(g.avg_cost_per_request)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ================================================================
          User limits management
          ================================================================ */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold">用户配额管理</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          调整指定用户的每日请求次数上限和成本上限，或恢复被熔断的用户。
        </p>

        <form onSubmit={handleUpdateLimits} className="mt-4 max-w-lg space-y-3 rounded-lg border p-4">
          <div>
            <label className="block text-sm font-medium">用户 ID</label>
            <input
              type="text"
              value={limitsForm.userId}
              onChange={(e) => setLimitsForm((s) => ({ ...s, userId: e.target.value }))}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm font-mono"
              required
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium">每日请求上限</label>
              <input
                type="number"
                min={1}
                max={10000}
                value={limitsForm.dailyRequestLimit}
                onChange={(e) => setLimitsForm((s) => ({ ...s, dailyRequestLimit: e.target.value }))}
                placeholder="默认 10"
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium">每日成本上限 (USD)</label>
              <input
                type="number"
                min={0.01}
                max={10000}
                step={0.01}
                value={limitsForm.dailyCostLimitUsd}
                onChange={(e) => setLimitsForm((s) => ({ ...s, dailyCostLimitUsd: e.target.value }))}
                placeholder="默认 $10.00"
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
          </div>

          {limitsForm.error && (
            <p className="text-sm text-destructive">{limitsForm.error}</p>
          )}
          {limitsForm.result && (
            <p className="text-sm text-green-600">{limitsForm.result}</p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={limitsForm.submitting}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {limitsForm.submitting ? "提交中..." : "更新限制"}
            </button>
            <button
              type="button"
              onClick={handleRestoreUser}
              disabled={limitsForm.submitting}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-50"
            >
              恢复访问
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// Stat card sub-component
// ============================================================

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-bold">{value}</dd>
      <dd className="mt-1 text-xs text-muted-foreground">{detail}</dd>
    </div>
  );
}
