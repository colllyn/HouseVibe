"use client";

import * as React from "react";
import {
  Search,
  Plus,
  ShieldCheck,
  Eye,
  Ban,
  CheckCircle,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { ResponsiveOverlay } from "@/components/ui/responsive-overlay";
import {
  CreateComplianceTermSchema,
  UpdateComplianceTermSchema,
  type ComplianceTermRow,
  type ComplianceCategory,
  type ComplianceSeverity,
  CATEGORY_LABELS,
  SEVERITY_LABELS,
  MATCH_TYPE_LABELS,
  COMPLIANCE_CATEGORIES,
  COMPLIANCE_SEVERITIES,
  MATCH_TYPES,
} from "@/features/compliance/schemas";

// ============================================================
// Helpers
// ============================================================

function severityBadgeCls(s: ComplianceSeverity): string {
  switch (s) {
    case "blocked":
      return "bg-destructive/10 text-destructive border-destructive/30";
    case "review":
      return "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/20 dark:text-amber-300 dark:border-amber-800";
    case "highlight":
      return "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/20 dark:text-blue-300 dark:border-blue-800";
  }
}

// ============================================================
// Page Component
// ============================================================

export default function AdminCompliancePage() {
  const [terms, setTerms] = React.useState<ComplianceTermRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("");
  const [categoryFilter, setCategoryFilter] = React.useState<string>("");

  // Overlay state
  const [overlayOpen, setOverlayOpen] = React.useState(false);
  const [editingTerm, setEditingTerm] = React.useState<ComplianceTermRow | null>(null);
  const [formErrors, setFormErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [togglingId, setTogglingId] = React.useState<string | null>(null);

  const supabaseRef = React.useRef(createClient());

  async function fetchTerms() {
    setLoading(true);
    setError(null);
    try {
      const supabase = supabaseRef.current;
      let query = supabase
        .from("compliance_terms")
        .select("*")
        .order("severity", { ascending: true })
        .order("created_at", { ascending: false });

      if (statusFilter) query = query.eq("status", statusFilter);
      if (categoryFilter) query = query.eq("category", categoryFilter);
      if (searchQuery.trim()) {
        query = query.ilike("term", `%${searchQuery.trim()}%`);
      }

      const { data, error: qError } = await query;
      if (qError) throw qError;
      setTerms((data as ComplianceTermRow[]) ?? []);
    } catch {
      setError("获取合规词库失败，请重试");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    fetchTerms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, categoryFilter]);

  // Search with debounce
  React.useEffect(() => {
    const timer = setTimeout(() => fetchTerms(), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const filteredTerms = React.useMemo(() => terms, [terms]);

  function openCreate() {
    setEditingTerm(null);
    setFormErrors({});
    setActionError(null);
    setOverlayOpen(true);
  }

  function openEdit(term: ComplianceTermRow) {
    setEditingTerm(term);
    setFormErrors({});
    setActionError(null);
    setOverlayOpen(true);
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setActionError(null);
    setFormErrors({});

    const fd = new FormData(e.currentTarget);
    const raw: Record<string, unknown> = {};
    fd.forEach((v, k) => {
      if (v !== "") raw[k] = v;
    });

    try {
      if (editingTerm) {
        // Update
        const parsed = UpdateComplianceTermSchema.safeParse(raw);
        if (!parsed.success) {
          const errs: Record<string, string> = {};
          for (const issue of parsed.error.issues) {
            errs[issue.path[0] as string] = issue.message;
          }
          setFormErrors(errs);
          setSaving(false);
          return;
        }

        const supabase = supabaseRef.current;
        const { error: upError } = await supabase
          .from("compliance_terms")
          .update({ ...parsed.data, updated_at: new Date().toISOString() })
          .eq("id", editingTerm.id);

        if (upError) throw upError;
      } else {
        // Create
        const parsed = CreateComplianceTermSchema.safeParse(raw);
        if (!parsed.success) {
          const errs: Record<string, string> = {};
          for (const issue of parsed.error.issues) {
            errs[issue.path[0] as string] = issue.message;
          }
          setFormErrors(errs);
          setSaving(false);
          return;
        }

        const supabase = supabaseRef.current;
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const { error: insError } = await supabase
          .from("compliance_terms")
          .insert({
            term: parsed.data.term,
            category: parsed.data.category,
            severity: parsed.data.severity,
            match_type: parsed.data.match_type ?? "exact",
            replacement_suggestion: parsed.data.replacement_suggestion ?? null,
            status: "active",
            version: 1,
            created_by: user?.id,
          });

        if (insError) throw insError;
      }

      setOverlayOpen(false);
      await fetchTerms();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "操作失败，请重试"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus(term: ComplianceTermRow) {
    setTogglingId(term.id);
    setActionError(null);
    try {
      const newStatus = term.status === "active" ? "disabled" : "active";
      const supabase = supabaseRef.current;
      const { error: upError } = await supabase
        .from("compliance_terms")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", term.id);

      if (upError) throw upError;
      await fetchTerms();
    } catch {
      setActionError("操作失败，请重试");
    } finally {
      setTogglingId(null);
    }
  }

  function getFormDefault(
    field: string,
    defaultValue: string = ""
  ): string {
    if (!editingTerm) return defaultValue;
    const value = (editingTerm as unknown as Record<string, unknown>)[field];
    return typeof value === "string" ? value : defaultValue;
  }

  const overlayTitle = editingTerm ? "编辑风险词" : "新增风险词";

  // --- Render ---

  if (loading) {
    return (
      <div className="p-4 md:p-8">
        <LoadingState message="加载合规词库..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 md:p-8">
        <ErrorState
          title="加载失败"
          description={error}
          onRetry={fetchTerms}
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">合规词库管理</h1>
          <p className="text-sm text-muted-foreground mt-1">
            管理内容合规风险词库，设置严重级别和匹配规则
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className={cn(
            "inline-flex items-center gap-2 rounded-md px-4 py-2.5",
            "text-sm font-medium bg-primary text-primary-foreground",
            "hover:bg-primary/90 transition-colors",
            "min-h-[44px]",
            "focus:outline-none focus:ring-2 focus:ring-ring"
          )}
        >
          <Plus className="h-4 w-4" />
          新增风险词
        </button>
      </div>

      {/* Action error banner */}
      {actionError && (
        <div
          role="alert"
          className="mb-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between"
        >
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="ml-2 underline hover:no-underline text-xs"
          >
            关闭
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索风险词..."
            className={cn(
              "w-full rounded-md border bg-background pl-10 pr-4 py-2",
              "text-sm placeholder:text-muted-foreground",
              "focus:outline-none focus:ring-2 focus:ring-ring",
              "min-h-[44px]"
            )}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={cn(
            "rounded-md border bg-background px-3 py-2 text-sm min-h-[44px]",
            "focus:outline-none focus:ring-2 focus:ring-ring"
          )}
        >
          <option value="">全部状态</option>
          <option value="active">启用</option>
          <option value="disabled">已禁用</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className={cn(
            "rounded-md border bg-background px-3 py-2 text-sm min-h-[44px]",
            "focus:outline-none focus:ring-2 focus:ring-ring"
          )}
        >
          <option value="">全部类别</option>
          {COMPLIANCE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>

      {/* Content */}
      {filteredTerms.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="h-12 w-12" />}
          title={searchQuery || statusFilter || categoryFilter ? "未找到匹配风险词" : "暂无风险词"}
          description={
            searchQuery || statusFilter || categoryFilter
              ? "尝试调整筛选条件"
              : "点击「新增风险词」添加第一条合规规则"
          }
        />
      ) : (
        <>
          {/* Mobile: Cards */}
          <div className="space-y-3 md:hidden">
            {filteredTerms.map((term) => (
              <div key={term.id} className="rounded-lg border bg-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm break-all">{term.term}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {CATEGORY_LABELS[term.category]}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium flex-shrink-0",
                      severityBadgeCls(term.severity)
                    )}
                  >
                    {SEVERITY_LABELS[term.severity]}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>匹配: {MATCH_TYPE_LABELS[term.match_type]}</span>
                  {term.status === "disabled" && (
                    <span className="text-destructive">(已禁用)</span>
                  )}
                </div>

                {term.replacement_suggestion && (
                  <p className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
                    建议替换: {term.replacement_suggestion}
                  </p>
                )}

                <div className="flex gap-2 pt-1 border-t">
                  <button
                    type="button"
                    onClick={() => openEdit(term)}
                    className={cn(
                      "flex-1 inline-flex items-center justify-center gap-1 rounded-md px-3 py-1.5",
                      "text-xs font-medium transition-colors min-h-[44px]",
                      "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                    )}
                  >
                    <Eye className="h-3 w-3" />
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleStatus(term)}
                    disabled={togglingId === term.id}
                    className={cn(
                      "flex-1 inline-flex items-center justify-center gap-1 rounded-md px-3 py-1.5",
                      "text-xs font-medium transition-colors min-h-[44px]",
                      term.status === "active"
                        ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                        : "bg-green-100 text-green-800 hover:bg-green-200",
                      "disabled:opacity-50"
                    )}
                  >
                    {togglingId === term.id ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : term.status === "active" ? (
                      <Ban className="h-3 w-3" />
                    ) : (
                      <CheckCircle className="h-3 w-3" />
                    )}
                    {term.status === "active" ? "禁用" : "启用"}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: Table */}
          <div className="hidden md:block rounded-lg border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">风险词</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">类别</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">严重级别</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">匹配方式</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">状态</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTerms.map((term) => (
                    <tr key={term.id} className="border-b last:border-b-0 hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-sm">{term.term}</p>
                          {term.replacement_suggestion && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              → {term.replacement_suggestion}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">{CATEGORY_LABELS[term.category]}</td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                            severityBadgeCls(term.severity)
                          )}
                        >
                          {SEVERITY_LABELS[term.severity]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {MATCH_TYPE_LABELS[term.match_type]}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "text-xs",
                            term.status === "active"
                              ? "text-green-600"
                              : "text-muted-foreground"
                          )}
                        >
                          {term.status === "active" ? "启用" : "已禁用"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() => openEdit(term)}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md px-3 py-1.5",
                              "text-xs font-medium transition-colors min-h-[44px]",
                              "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                            )}
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(term)}
                            disabled={togglingId === term.id}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md px-3 py-1.5",
                              "text-xs font-medium transition-colors min-h-[44px]",
                              term.status === "active"
                                ? "text-amber-700 hover:bg-amber-50"
                                : "text-green-700 hover:bg-green-50",
                              "disabled:opacity-50"
                            )}
                          >
                            {term.status === "active" ? "禁用" : "启用"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Count */}
          <p className="mt-4 text-xs text-muted-foreground">
            共 {filteredTerms.length} 条风险词
            {statusFilter && `（${statusFilter === "active" ? "启用" : "已禁用"}）`}
            {categoryFilter && `（${CATEGORY_LABELS[categoryFilter as ComplianceCategory] ?? categoryFilter}）`}
          </p>
        </>
      )}

      {/* Create/Edit Overlay */}
      <ResponsiveOverlay
        open={overlayOpen}
        onOpenChange={setOverlayOpen}
        title={overlayTitle}
        description="配置风险词的匹配规则和严重级别"
      >
        <form onSubmit={handleSave} className="space-y-4 p-1">
          {/* Term */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              风险词 <span className="text-destructive">*</span>
            </label>
            <input
              name="term"
              required
              defaultValue={getFormDefault("term")}
              className={cn(
                "w-full rounded-md border bg-background px-3 py-2.5 text-sm min-h-[44px]",
                "focus:outline-none focus:ring-2 focus:ring-ring",
                formErrors.term ? "border-destructive" : "border-input"
              )}
              placeholder="例如：第一、最好、绝对"
            />
            {formErrors.term && (
              <p className="text-xs text-destructive">{formErrors.term}</p>
            )}
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              风险类别 <span className="text-destructive">*</span>
            </label>
            <select
              name="category"
              required
              defaultValue={getFormDefault("category", "absolute_claim")}
              className={cn(
                "w-full rounded-md border bg-background px-3 py-2.5 text-sm min-h-[44px]",
                "focus:outline-none focus:ring-2 focus:ring-ring",
                formErrors.category ? "border-destructive" : "border-input"
              )}
            >
              <option value="" disabled>选择类别...</option>
              {COMPLIANCE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
            {formErrors.category && (
              <p className="text-xs text-destructive">{formErrors.category}</p>
            )}
          </div>

          {/* Severity */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              严重级别 <span className="text-destructive">*</span>
            </label>
            <select
              name="severity"
              required
              defaultValue={getFormDefault("severity", "review")}
              className={cn(
                "w-full rounded-md border bg-background px-3 py-2.5 text-sm min-h-[44px]",
                "focus:outline-none focus:ring-2 focus:ring-ring",
                formErrors.severity ? "border-destructive" : "border-input"
              )}
            >
              <option value="" disabled>选择级别...</option>
              {COMPLIANCE_SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {SEVERITY_LABELS[s]}
                </option>
              ))}
            </select>
            {formErrors.severity && (
              <p className="text-xs text-destructive">{formErrors.severity}</p>
            )}
          </div>

          {/* Match type */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">匹配方式</label>
            <select
              name="match_type"
              defaultValue={getFormDefault("match_type", "exact")}
              className={cn(
                "w-full rounded-md border bg-background px-3 py-2.5 text-sm min-h-[44px]",
                "focus:outline-none focus:ring-2 focus:ring-ring"
              )}
            >
              {MATCH_TYPES.map((m) => (
                <option key={m} value={m}>
                  {MATCH_TYPE_LABELS[m]}
                </option>
              ))}
            </select>
          </div>

          {/* Replacement suggestion */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">替换建议</label>
            <input
              name="replacement_suggestion"
              defaultValue={getFormDefault("replacement_suggestion")}
              className={cn(
                "w-full rounded-md border bg-background px-3 py-2.5 text-sm min-h-[44px]",
                "focus:outline-none focus:ring-2 focus:ring-ring",
                "border-input"
              )}
              placeholder="建议使用的合规表达方式"
            />
          </div>

          {/* Action error */}
          {actionError && (
            <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {actionError}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setOverlayOpen(false)}
              className={cn(
                "flex-1 rounded-md border px-4 py-2.5 text-sm font-medium",
                "min-h-[44px] hover:bg-muted transition-colors"
              )}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className={cn(
                "flex-1 rounded-md px-4 py-2.5 text-sm font-medium",
                "min-h-[44px] bg-primary text-primary-foreground",
                "hover:bg-primary/90 transition-colors",
                "disabled:opacity-50"
              )}
            >
              {saving ? (
                <span className="inline-flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  保存中...
                </span>
              ) : editingTerm ? (
                "保存修改"
              ) : (
                "创建风险词"
              )}
            </button>
          </div>
        </form>
      </ResponsiveOverlay>
    </div>
  );
}
