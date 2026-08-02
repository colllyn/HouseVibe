# P2-CLIENT-001 Handoff: Client Management Pages

**From:** mobile-ui-engineer  
**To:** property-crm-engineer  
**Status:** Ready for placement  
**Date:** 2026-08-02

## Summary

Stage badge component created at `src/components/ui/stage-badge.tsx`.
All client page files below must be placed in `src/app/(dashboard)/clients/**`.

## Files to Create

### 1. `src/app/(dashboard)/clients/page.tsx`

Client list page with card layout, stage filter tabs, search, empty/loading/error states.

```tsx
"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search, Plus, SlidersHorizontal, X, Users, MapPin, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { StageBadge, STAGE_LABELS } from "@/components/ui/stage-badge";

interface ClientCard {
  id: string;
  name: string;
  stage: string;
  budget_min?: number;
  budget_max?: number;
  preferred_districts?: string[];
  preferred_communities?: string[];
  bedrooms?: number;
  rental_type?: string;
  available_from?: string;
  next_follow_up_at?: string;
  last_interaction_at?: string;
  created_at: string;
}

interface ListData {
  clients: ClientCard[];
  total: number;
}

const STAGE_FILTERS = [
  { value: "", label: "全部" },
  { value: "new", label: "新客户" },
  { value: "qualified", label: "已确认" },
  { value: "properties_sent", label: "已推荐" },
  { value: "viewing_scheduled", label: "已约看" },
  { value: "viewed", label: "已看房" },
  { value: "considering", label: "考虑中" },
  { value: "closed_won", label: "已成交" },
  { value: "paused", label: "暂停" },
  { value: "lost", label: "已流失" },
];

function budgetText(c: ClientCard): string | null {
  if (c.budget_min && c.budget_max) return `¥${c.budget_min.toLocaleString()} - ¥${c.budget_max.toLocaleString()}/月`;
  if (c.budget_min) return `¥${c.budget_min.toLocaleString()}+/月`;
  if (c.budget_max) return `≤ ¥${c.budget_max.toLocaleString()}/月`;
  return null;
}

function districtsText(c: ClientCard): string | null {
  const all = [...(c.preferred_districts ?? []), ...(c.preferred_communities ?? [])];
  if (all.length === 0) return null;
  return all.slice(0, 3).join(" · ");
}

function followUpText(date?: string): string | null {
  if (!date) return null;
  const d = new Date(date);
  const now = new Date();
  const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `已逾期 ${Math.abs(diffDays)} 天`;
  if (diffDays === 0) return "今天";
  if (diffDays === 1) return "明天";
  if (diffDays <= 3) return `${diffDays} 天后`;
  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

function followUpUrgencyClass(date?: string): string {
  if (!date) return "text-muted-foreground";
  const d = new Date(date);
  const now = new Date();
  const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "text-destructive";
  if (diffDays <= 1) return "text-orange-600";
  return "text-muted-foreground";
}

function Card({ c }: { c: ClientCard }) {
  const budget = budgetText(c);
  const districts = districtsText(c);
  const followUp = followUpText(c.next_follow_up_at);
  const followUpUrgency = followUpUrgencyClass(c.next_follow_up_at);

  return (
    <Link
      href={`/clients/${c.id}`}
      className="group block rounded-lg border bg-card p-4 hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
    >
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm line-clamp-1 group-hover:text-primary transition-colors">
            {c.name}
          </h3>
          <StageBadge stage={c.stage} />
        </div>

        {budget && (
          <p className="text-sm font-medium tabular-nums">{budget}</p>
        )}

        {districts && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 flex-shrink-0" />
            <span className="line-clamp-1">{districts}</span>
          </p>
        )}

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {c.bedrooms != null && <span>{c.bedrooms}室</span>}
          {c.rental_type && (
            <span>{c.rental_type === "whole_unit" ? "整租" : c.rental_type === "shared" ? "合租" : c.rental_type}</span>
          )}
        </div>

        {followUp && (
          <div className={cn("flex items-center gap-1 text-xs", followUpUrgency)}>
            <CalendarClock className="h-3 w-3 flex-shrink-0" />
            <span>下次跟进: {followUp}</span>
          </div>
        )}
      </div>
    </Link>
  );
}

function Skeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-card p-4 animate-pulse space-y-3">
          <div className="flex items-center justify-between">
            <div className="h-5 bg-muted rounded w-1/3" />
            <div className="h-5 bg-muted rounded w-16" />
          </div>
          <div className="h-5 bg-muted rounded w-1/2" />
          <div className="h-4 bg-muted rounded w-3/4" />
          <div className="h-4 bg-muted rounded w-1/4" />
        </div>
      ))}
    </div>
  );
}

function Empty() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Users className="h-8 w-8 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold mb-1">暂无客户</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs">开始添加第一位客户，管理您的客户关系</p>
      <Link
        href="/clients/new"
        className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 min-h-[44px] transition-colors"
      >
        <Plus className="h-4 w-4" />新增客户
      </Link>
    </div>
  );
}

function NoResults() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <SlidersHorizontal className="h-8 w-8 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold mb-1">暂无符合条件的客户</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs">试试放宽筛选条件或清除全部筛选</p>
      <Link
        href="/clients"
        className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium border border-input bg-background hover:bg-muted min-h-[44px] transition-colors"
      >
        <X className="h-4 w-4" />清除筛选
      </Link>
    </div>
  );
}

function ErrorState({ m, onRetry }: { m: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <h2 className="text-lg font-semibold mb-1">加载失败</h2>
      <p className="text-sm text-muted-foreground mb-6">{m}</p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium border border-input bg-background hover:bg-muted min-h-[44px] transition-colors"
      >
        重试
      </button>
    </div>
  );
}

function ClientsContent() {
  const searchParams = useSearchParams();
  const [data, setData] = React.useState<ListData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [searchInput, setSearchInput] = React.useState(searchParams.get("search") ?? "");

  const fetchClients = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = searchParams.toString();
      const resp = await fetch(`/api/clients${qs ? `?${qs}` : ""}`);
      const json = await resp.json();
      if (!resp.ok) {
        setError(json.error?.message ?? "加载失败");
        setData(null);
      } else {
        setData(json.data as ListData);
      }
    } catch {
      setError("加载失败，请检查网络后重试");
      setData(null);
    }
    setLoading(false);
  }, [searchParams]);

  React.useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  React.useEffect(() => {
    setSearchInput(searchParams.get("search") ?? "");
  }, [searchParams]);

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.set("page", "1");
    window.history.pushState(null, "", `/clients?${params.toString()}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilter("search", searchInput.trim());
  };

  const activeFilters = React.useMemo(() => {
    const filters: { key: string; label: string; value: string }[] = [];
    for (const [k, v] of searchParams.entries()) {
      if (["page", "limit"].includes(k)) continue;
      if (k === "stage") {
        filters.push({ key: k, label: "阶段", value: STAGE_LABELS[v] ?? v });
      } else if (k === "search") {
        filters.push({ key: k, label: "搜索", value: v });
      } else {
        filters.push({ key: k, label: k, value: v });
      }
    }
    return filters;
  }, [searchParams]);

  const clearAllFilters = () => {
    window.location.href = "/clients";
  };

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">客户</h1>
          <p className="text-sm text-muted-foreground mt-1">管理您的客户关系</p>
        </div>
        <Link
          href="/clients/new"
          className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 min-h-[44px] transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">新增客户</span>
        </Link>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="搜索客户姓名..."
            className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
          />
        </div>
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-2.5 text-sm hover:bg-muted min-h-[44px] transition-colors"
        >
          搜索
        </button>
      </form>

      {/* Stage filter tabs */}
      <div className="flex items-center gap-1.5 mb-4 overflow-x-auto pb-1 -mx-4 px-4 sm:-mx-0 sm:px-0">
        {STAGE_FILTERS.map((f) => {
          const currentStage = searchParams.get("stage") ?? "";
          const isActive = currentStage === f.value || (!currentStage && f.value === "");
          return (
            <button
              key={f.value}
              onClick={() => updateFilter("stage", f.value)}
              className={cn(
                "inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap min-h-[36px] transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              )}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Active filter chips */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {activeFilters.map((f) => (
            <button
              key={f.key}
              onClick={() => updateFilter(f.key, "")}
              className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium min-h-[36px] hover:bg-secondary/80 transition-colors"
            >
              {f.label}: {f.value} <X className="h-3 w-3" />
            </button>
          ))}
          {activeFilters.length > 0 && (
            <button
              onClick={clearAllFilters}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground min-h-[36px] px-2 transition-colors"
            >
              清除全部
            </button>
          )}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <Skeleton />
      ) : error ? (
        <ErrorState m={error} onRetry={fetchClients} />
      ) : !data || data.clients.length === 0 ? (
        activeFilters.length > 0 ? <NoResults /> : <Empty />
      ) : (
        <>
          <div className="text-xs text-muted-foreground mb-3">共 {data.total} 位客户</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.clients.map((c) => (
              <Card key={c.id} c={c} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ClientsFallback() {
  return <Skeleton />;
}

export default function ClientsPage() {
  return (
    <React.Suspense fallback={<ClientsFallback />}>
      <ClientsContent />
    </React.Suspense>
  );
}
```

### 2. `src/app/(dashboard)/clients/new/page.tsx`

Create client form. Required field: name. POST to /api/clients, redirect to /clients/[id] on success.

```tsx
"use client";

import * as React from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { STAGE_LABELS } from "@/components/ui/stage-badge";

const inputCls = (e?: boolean) => cn(
  "w-full rounded-md border bg-background px-3 py-2.5 text-sm min-h-[44px]",
  "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
  "disabled:cursor-not-allowed disabled:opacity-50",
  e ? "border-destructive" : "border-input"
);

const STAGE_OPTIONS = [
  { value: "new", label: "新客户" },
  { value: "qualified", label: "已确认" },
  { value: "properties_sent", label: "已推荐" },
  { value: "viewing_scheduled", label: "已约看" },
  { value: "viewed", label: "已看房" },
  { value: "considering", label: "考虑中" },
  { value: "closed_won", label: "已成交" },
  { value: "paused", label: "暂停" },
  { value: "lost", label: "已流失" },
];

export default function NewClientPage() {
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [formErrors, setFormErrors] = React.useState<Record<string, string>>({});

  const validate = (fd: FormData): boolean => {
    const errs: Record<string, string> = {};
    const name = fd.get("name") as string;
    if (!name || !name.trim()) errs.name = "请输入客户姓名";

    const budgetMin = fd.get("budget_min") as string;
    const budgetMax = fd.get("budget_max") as string;
    if (budgetMin && budgetMax && Number(budgetMin) > Number(budgetMax)) {
      errs.budget_max = "最高预算不能低于最低预算";
    }

    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (!validate(fd)) return;

    setLoading(true);
    setError(null);

    const data: Record<string, unknown> = {};
    fd.forEach((v, k) => { if (v !== "") data[k] = v; });

    // Convert numeric fields
    for (const nk of ["budget_min", "budget_max", "bedrooms", "minimum_lease_months"]) {
      if (data[nk] !== undefined) data[nk] = Number(data[nk]);
    }

    // Convert boolean fields
    for (const bk of ["pets_required", "cooking_required"]) {
      data[bk] = fd.has(bk);
    }

    // Parse array fields
    for (const ak of ["preferred_districts", "preferred_communities", "hard_requirements", "soft_preferences", "deal_breakers"]) {
      const val = data[ak] as string | undefined;
      if (val && typeof val === "string") {
        data[ak] = val.split(",").map((s: string) => s.trim()).filter(Boolean);
      }
    }

    try {
      const resp = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await resp.json();
      if (!resp.ok) {
        setError(typeof result.error === "string" ? result.error : (result.error?.message ?? "创建失败"));
        setLoading(false);
        return;
      }
      window.location.href = `/clients/${result.data?.id ?? result.id}`;
    } catch {
      setError("创建失败，请检查网络后重试");
      setLoading(false);
    }
  };

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/clients" className="inline-flex items-center justify-center rounded-md h-10 w-10 hover:bg-muted transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div><h1 className="text-xl font-bold">新增客户</h1></div>
      </div>

      <form onSubmit={handleCreate} className="space-y-6" noValidate>
        {/* Basic Info */}
        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="font-semibold text-sm">基本信息</h2>
          <div className="space-y-1.5">
            <label className="flex items-center gap-1 text-sm font-medium">
              客户姓名 <span className="text-destructive">*</span>
            </label>
            <input name="name" required className={inputCls(!!formErrors.name)} placeholder="例如：张三" />
            {formErrors.name && <p className="text-xs text-destructive">{formErrors.name}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">手机号</label>
              <input name="phone" type="tel" className={inputCls()} placeholder="13800138000" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">微信</label>
              <input name="wechat" className={inputCls()} placeholder="WeChat ID" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">来源渠道</label>
            <input name="source_platform" className={inputCls()} placeholder="例如：贝壳、安居客、朋友介绍" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">客户阶段</label>
            <select name="stage" defaultValue="new" className={inputCls()}>
              {STAGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </section>

        {/* Budget & Requirements */}
        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="font-semibold text-sm">预算与需求</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">最低预算 (¥/月)</label>
              <input name="budget_min" type="number" className={inputCls()} placeholder="2000" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">最高预算 (¥/月)</label>
              <input name="budget_max" type="number" className={inputCls(!!formErrors.budget_max)} placeholder="5000" />
              {formErrors.budget_max && <p className="text-xs text-destructive">{formErrors.budget_max}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">意向区域</label>
              <input name="preferred_districts" className={inputCls()} placeholder="朝阳区, 海淀区（逗号分隔）" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">意向小区</label>
              <input name="preferred_communities" className={inputCls()} placeholder="阳光花园, 翠微南里（逗号分隔）" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">卧室数</label>
              <input name="bedrooms" type="number" className={inputCls()} placeholder="2" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">租赁方式</label>
              <select name="rental_type" defaultValue="" className={inputCls()}>
                <option value="">不限</option>
                <option value="whole_unit">整租</option>
                <option value="shared">合租</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">最短租期 (月)</label>
              <input name="minimum_lease_months" type="number" className={inputCls()} placeholder="12" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">可入住时间</label>
              <input name="available_from" type="date" className={inputCls()} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">通勤目的地</label>
            <input name="commute_destination" className={inputCls()} placeholder="例如：国贸、中关村" />
          </div>
        </section>

        {/* Preferences */}
        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="font-semibold text-sm">偏好与特殊要求</h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 min-h-[44px] cursor-pointer">
              <input type="checkbox" name="pets_required" className="h-4 w-4 rounded border-input text-primary focus:ring-ring" />
              <span className="text-sm">需要养宠物</span>
            </label>
            <label className="flex items-center gap-2 min-h-[44px] cursor-pointer">
              <input type="checkbox" name="cooking_required" className="h-4 w-4 rounded border-input text-primary focus:ring-ring" />
              <span className="text-sm">需要做饭</span>
            </label>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">硬性要求</label>
            <textarea name="hard_requirements" className={cn(inputCls(), "min-h-[80px] resize-y")} rows={3} placeholder="逗号分隔多项，例如：必须有电梯, 朝南" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">软性偏好</label>
            <textarea name="soft_preferences" className={cn(inputCls(), "min-h-[80px] resize-y")} rows={3} placeholder="逗号分隔多项，例如：最好有阳台, 希望安静" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">绝对不能接受的</label>
            <textarea name="deal_breakers" className={cn(inputCls(), "min-h-[80px] resize-y")} rows={3} placeholder="逗号分隔多项，例如：顶楼, 无电梯" />
          </div>
        </section>

        {error && <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

        <button
          type="submit"
          disabled={loading}
          className="w-full inline-flex items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 min-h-[48px] disabled:opacity-50 transition-colors"
        >
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" />创建中...</> : "创建客户"}
        </button>
      </form>
    </div>
  );
}
```

### 3. `src/app/(dashboard)/clients/[clientId]/page.tsx`

Client detail page. Displays all fields, stage selector, edit/delete buttons.

```tsx
"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MapPin, Lock, Pencil, Trash2, Loader2, Phone, MessageCircle, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { StageBadge, STAGE_LABELS } from "@/components/ui/stage-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface ClientDetail {
  id: string;
  name: string;
  stage: string;
  phone?: string;
  wechat?: string;
  source_platform?: string;
  budget_min?: number;
  budget_max?: number;
  preferred_districts?: string[];
  preferred_communities?: string[];
  bedrooms?: number;
  rental_type?: string;
  available_from?: string;
  minimum_lease_months?: number;
  pets_required?: boolean;
  cooking_required?: boolean;
  commute_destination?: string;
  hard_requirements?: string[];
  soft_preferences?: string[];
  deal_breakers?: string[];
  next_follow_up_at?: string;
  last_interaction_at?: string;
  created_at: string;
  updated_at: string;
}

const STAGE_OPTIONS = [
  { value: "new", label: "新客户" },
  { value: "qualified", label: "已确认" },
  { value: "properties_sent", label: "已推荐" },
  { value: "viewing_scheduled", label: "已约看" },
  { value: "viewed", label: "已看房" },
  { value: "considering", label: "考虑中" },
  { value: "closed_won", label: "已成交" },
  { value: "paused", label: "暂停" },
  { value: "lost", label: "已流失" },
];

function DetailSkeleton() {
  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 max-w-3xl mx-auto animate-pulse space-y-6">
      <div className="h-6 bg-muted rounded w-32" />
      <div className="h-8 bg-muted rounded w-3/4" />
      <div className="flex gap-2"><div className="h-10 bg-muted rounded w-20" /><div className="h-10 bg-muted rounded w-20" /></div>
      <div className="h-40 bg-muted rounded" />
      <div className="h-40 bg-muted rounded" />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex items-start justify-between py-2 border-b border-muted last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right max-w-[60%]">{String(value)}</span>
    </div>
  );
}

function ArrayRow({ label, value }: { label: string; value: string[] | null | undefined }) {
  if (!value || value.length === 0) return null;
  return (
    <div className="py-2 border-b border-muted last:border-b-0">
      <span className="text-sm text-muted-foreground block mb-1.5">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {value.map((item, i) => (
          <span key={i} className="inline-block rounded bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{item}</span>
        ))}
      </div>
    </div>
  );
}

export default function ClientDetailPage() {
  const params = useParams();
  const clientId = params.clientId as string;

  const [client, setClient] = React.useState<ClientDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [changingStage, setChangingStage] = React.useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const fetchClient = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/clients/${clientId}`);
      const json = await resp.json();
      if (!resp.ok) {
        setError(json.error?.message ?? "加载失败");
        setClient(null);
      } else {
        setClient(json.data as ClientDetail);
      }
    } catch {
      setError("加载失败，请检查网络后重试");
      setClient(null);
    }
    setLoading(false);
  }, [clientId]);

  React.useEffect(() => { fetchClient(); }, [fetchClient]);

  const handleStageChange = async (newStage: string) => {
    if (!client || client.stage === newStage) return;
    setChangingStage(true);
    try {
      const resp = await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: newStage }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        setError(typeof json.error === "string" ? json.error : (json.error?.message ?? "阶段更新失败"));
      } else {
        setClient({ ...client, stage: newStage });
      }
    } catch {
      setError("阶段更新失败，请重试");
    }
    setChangingStage(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const resp = await fetch(`/api/clients/${clientId}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!resp.ok) {
        const json = await resp.json().catch(() => ({ error: "删除失败" }));
        setError(typeof json.error === "string" ? json.error : (json.error?.message ?? "删除失败"));
        setDeleting(false);
        setShowDeleteConfirm(false);
        return;
      }
      window.location.href = "/clients";
    } catch {
      setError("删除失败，请重试");
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (loading) return <DetailSkeleton />;
  if (error && !client) {
    return (
      <div className="px-4 py-20 text-center max-w-3xl mx-auto">
        <h2 className="text-lg font-semibold mb-1">加载失败</h2>
        <p className="text-sm text-muted-foreground mb-4">{error}</p>
        <div className="flex items-center justify-center gap-2">
          <button onClick={fetchClient} className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 min-h-[44px] transition-colors">重试</button>
          <Link href="/clients" className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium border border-input hover:bg-muted min-h-[44px] transition-colors">返回列表</Link>
        </div>
      </div>
    );
  }
  if (!client) {
    return (
      <div className="px-4 py-20 text-center max-w-3xl mx-auto">
        <h2 className="text-lg font-semibold mb-1">客户不存在</h2>
        <p className="text-sm text-muted-foreground mb-4">该客户可能已被删除或您没有权限查看</p>
        <Link href="/clients" className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium border border-input hover:bg-muted min-h-[44px] transition-colors">返回列表</Link>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/clients" className="inline-flex items-center justify-center rounded-md h-10 w-10 hover:bg-muted transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold">{client.name}</h1>
            <StageBadge stage={client.stage} />
          </div>
          {client.source_platform && <p className="text-sm text-muted-foreground mt-1">来源: {client.source_platform}</p>}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mb-6">
        <Link
          href={`/clients/${clientId}/edit`}
          className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium border border-input hover:bg-muted min-h-[44px] transition-colors"
        >
          <Pencil className="h-4 w-4" />编辑
        </Link>
        <button
          type="button"
          onClick={() => setShowDeleteConfirm(true)}
          className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium border border-input text-destructive hover:bg-destructive/10 min-h-[44px] transition-colors"
        >
          <Trash2 className="h-4 w-4" />删除
        </button>
      </div>

      {error && <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive mb-4">{error}</div>}

      {/* Stage Selector */}
      <section className="rounded-lg border mb-6">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="text-sm font-medium">客户阶段</span>
          <select
            value={client.stage}
            disabled={changingStage}
            onChange={(e) => handleStageChange(e.target.value)}
            className="min-h-[44px] rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          >
            {STAGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {changingStage && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
      </section>

      {/* Contact Info (sensitive) */}
      <section className="rounded-lg border mb-6">
        <h2 className="font-semibold text-sm px-4 py-3 border-b flex items-center gap-2">
          <Lock className="h-4 w-4 text-amber-500" />联系方式（仅本门店可见）
        </h2>
        <div className="px-4 py-2">
          {client.phone ? (
            <div className="flex items-center gap-2 py-2 border-b border-muted">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{client.phone}</span>
            </div>
          ) : null}
          {client.wechat ? (
            <div className="flex items-center gap-2 py-2 border-b border-muted">
              <MessageCircle className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{client.wechat}</span>
            </div>
          ) : null}
          {!client.phone && !client.wechat && (
            <div className="py-4 text-sm text-muted-foreground text-center">暂无联系方式</div>
          )}
        </div>
      </section>

      {/* Budget & Requirements */}
      <section className="rounded-lg border mb-6">
        <h2 className="font-semibold text-sm px-4 py-3 border-b">预算与需求</h2>
        <div className="px-4 py-2">
          <DetailRow label="预算" value={
            client.budget_min && client.budget_max
              ? `¥${client.budget_min.toLocaleString()} - ¥${client.budget_max.toLocaleString()}/月`
              : client.budget_min
                ? `¥${client.budget_min.toLocaleString()}+/月`
                : client.budget_max
                  ? `≤ ¥${client.budget_max.toLocaleString()}/月`
                  : undefined
          } />
          <DetailRow label="卧室数" value={client.bedrooms} />
          <DetailRow label="租赁方式" value={client.rental_type === "whole_unit" ? "整租" : client.rental_type === "shared" ? "合租" : client.rental_type} />
          <DetailRow label="最短租期" value={client.minimum_lease_months ? `${client.minimum_lease_months}个月` : undefined} />
          <DetailRow label="可入住时间" value={client.available_from} />
          <DetailRow label="通勤目的地" value={client.commute_destination} />
          <DetailRow label="需要养宠物" value={client.pets_required ? "是" : "否"} />
          <DetailRow label="需要做饭" value={client.cooking_required ? "是" : "否"} />
          <ArrayRow label="意向区域" value={client.preferred_districts} />
          <ArrayRow label="意向小区" value={client.preferred_communities} />
        </div>
      </section>

      {/* Preferences */}
      <section className="rounded-lg border mb-6">
        <h2 className="font-semibold text-sm px-4 py-3 border-b">偏好与特殊要求</h2>
        <div className="px-4 py-2">
          <ArrayRow label="硬性要求" value={client.hard_requirements} />
          <ArrayRow label="软性偏好" value={client.soft_preferences} />
          <ArrayRow label="绝对不能接受的" value={client.deal_breakers} />
        </div>
      </section>

      {/* Timelines */}
      <section className="rounded-lg border mb-6">
        <h2 className="font-semibold text-sm px-4 py-3 border-b">跟进记录</h2>
        <div className="px-4 py-2">
          <DetailRow label="下次跟进" value={client.next_follow_up_at ? new Date(client.next_follow_up_at).toLocaleString("zh-CN") : undefined} />
          <DetailRow label="最近互动" value={client.last_interaction_at ? new Date(client.last_interaction_at).toLocaleString("zh-CN") : undefined} />
          <DetailRow label="创建时间" value={new Date(client.created_at).toLocaleString("zh-CN")} />
          <DetailRow label="更新时间" value={new Date(client.updated_at).toLocaleString("zh-CN")} />
        </div>
      </section>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={(open) => { if (!open) { setShowDeleteConfirm(false); setError(null); } }}
        title="删除客户"
        description={`确定要删除客户「${client.name}」吗？此操作为软删除，删除后可在需要时恢复。删除后该客户将不再出现在客户列表中。`}
        confirmLabel="确认删除"
        variant="destructive"
        isLoading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
```

### 4. `src/app/(dashboard)/clients/[clientId]/edit/page.tsx`

Edit client form. Pre-fills from GET, submits PATCH.

```tsx
"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { STAGE_LABELS } from "@/components/ui/stage-badge";

const inputCls = (e?: boolean) => cn(
  "w-full rounded-md border bg-background px-3 py-2.5 text-sm min-h-[44px]",
  "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
  "disabled:cursor-not-allowed disabled:opacity-50",
  e ? "border-destructive" : "border-input"
);

const STAGE_OPTIONS = [
  { value: "new", label: "新客户" },
  { value: "qualified", label: "已确认" },
  { value: "properties_sent", label: "已推荐" },
  { value: "viewing_scheduled", label: "已约看" },
  { value: "viewed", label: "已看房" },
  { value: "considering", label: "考虑中" },
  { value: "closed_won", label: "已成交" },
  { value: "paused", label: "暂停" },
  { value: "lost", label: "已流失" },
];

interface ClientEditData {
  id: string;
  name: string;
  stage: string;
  phone?: string;
  wechat?: string;
  source_platform?: string;
  budget_min?: number;
  budget_max?: number;
  preferred_districts?: string[];
  preferred_communities?: string[];
  bedrooms?: number;
  rental_type?: string;
  available_from?: string;
  minimum_lease_months?: number;
  pets_required?: boolean;
  cooking_required?: boolean;
  commute_destination?: string;
  hard_requirements?: string[];
  soft_preferences?: string[];
  deal_breakers?: string[];
  next_follow_up_at?: string;
}

function arrToStr(arr: string[] | null | undefined): string {
  if (!arr || arr.length === 0) return "";
  return arr.join(", ");
}

export default function EditClientPage() {
  const params = useParams();
  const clientId = params.clientId as string;

  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [formErrors, setFormErrors] = React.useState<Record<string, string>>({});

  // Pre-filled form values
  const [values, setValues] = React.useState<Record<string, string>>({
    name: "",
    phone: "",
    wechat: "",
    source_platform: "",
    budget_min: "",
    budget_max: "",
    preferred_districts: "",
    preferred_communities: "",
    bedrooms: "",
    rental_type: "",
    available_from: "",
    minimum_lease_months: "",
    pets_required: "0",
    cooking_required: "0",
    commute_destination: "",
    hard_requirements: "",
    soft_preferences: "",
    deal_breakers: "",
    stage: "new",
  });

  // Load existing data
  React.useEffect(() => {
    fetch(`/api/clients/${clientId}`)
      .then((r) => { if (!r.ok) throw new Error("加载失败"); return r.json(); })
      .then((data) => {
        setValues({
          name: data.name ?? "",
          phone: data.phone ?? "",
          wechat: data.wechat ?? "",
          source_platform: data.source_platform ?? "",
          budget_min: data.budget_min != null ? String(data.budget_min) : "",
          budget_max: data.budget_max != null ? String(data.budget_max) : "",
          preferred_districts: arrToStr(data.preferred_districts),
          preferred_communities: arrToStr(data.preferred_communities),
          bedrooms: data.bedrooms != null ? String(data.bedrooms) : "",
          rental_type: data.rental_type ?? "",
          available_from: data.available_from ?? "",
          minimum_lease_months: data.minimum_lease_months != null ? String(data.minimum_lease_months) : "",
          pets_required: data.pets_required ? "1" : "0",
          cooking_required: data.cooking_required ? "1" : "0",
          commute_destination: data.commute_destination ?? "",
          hard_requirements: arrToStr(data.hard_requirements),
          soft_preferences: arrToStr(data.soft_preferences),
          deal_breakers: arrToStr(data.deal_breakers),
          stage: data.stage ?? "new",
        });
        setIsLoading(false);
      })
      .catch((e) => { setLoadError(e.message); setIsLoading(false); });
  }, [clientId]);

  const setVal = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (formErrors[key]) setFormErrors((prev) => { const next = { ...prev }; delete next[key]; return next; });
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!values.name.trim()) errs.name = "请输入客户姓名";
    const min = Number(values.budget_min);
    const max = Number(values.budget_max);
    if (values.budget_min && values.budget_max && min > max) {
      errs.budget_max = "最高预算不能低于最低预算";
    }
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setSubmitError(null);

    const data: Record<string, unknown> = {};

    // String fields
    for (const sk of ["name", "phone", "wechat", "source_platform", "rental_type", "available_from", "commute_destination", "stage"]) {
      if (values[sk]) data[sk] = values[sk];
    }

    // Numeric fields
    for (const nk of ["budget_min", "budget_max", "bedrooms", "minimum_lease_months"]) {
      if (values[nk]) data[nk] = Number(values[nk]);
    }

    // Boolean fields
    data.pets_required = values.pets_required === "1";
    data.cooking_required = values.cooking_required === "1";

    // Array fields
    for (const ak of ["preferred_districts", "preferred_communities", "hard_requirements", "soft_preferences", "deal_breakers"]) {
      if (values[ak]) {
        data[ak] = values[ak].split(",").map((s: string) => s.trim()).filter(Boolean);
      } else {
        data[ak] = [];
      }
    }

    try {
      const resp = await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await resp.json();
      if (!resp.ok) {
        setSubmitError(typeof result.error === "string" ? result.error : (result.error?.message ?? "保存失败"));
        setIsSubmitting(false);
        return;
      }
      window.location.href = `/clients/${clientId}`;
    } catch {
      setSubmitError("保存失败，请重试");
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <div className="px-4 py-20 text-center text-muted-foreground">加载中...</div>;
  }
  if (loadError) {
    return (
      <div className="px-4 py-20 text-center">
        <p className="text-destructive">{loadError}</p>
        <Link href={`/clients/${clientId}`} className="text-sm text-primary mt-2 inline-block">返回详情</Link>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href={`/clients/${clientId}`} className="inline-flex items-center justify-center rounded-md h-10 w-10 hover:bg-muted transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold">编辑客户</h1>
          <p className="text-sm text-muted-foreground">修改客户信息</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {/* Basic Info */}
        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="font-semibold text-sm">基本信息</h2>
          <div className="space-y-1.5">
            <label className="flex items-center gap-1 text-sm font-medium">
              客户姓名 <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={values.name}
              onChange={(e) => setVal("name", e.target.value)}
              className={inputCls(!!formErrors.name)}
              placeholder="例如：张三"
            />
            {formErrors.name && <p className="text-xs text-destructive">{formErrors.name}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">手机号</label>
              <input type="tel" value={values.phone} onChange={(e) => setVal("phone", e.target.value)} className={inputCls()} placeholder="13800138000" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">微信</label>
              <input type="text" value={values.wechat} onChange={(e) => setVal("wechat", e.target.value)} className={inputCls()} placeholder="WeChat ID" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">来源渠道</label>
            <input type="text" value={values.source_platform} onChange={(e) => setVal("source_platform", e.target.value)} className={inputCls()} placeholder="例如：贝壳、安居客、朋友介绍" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">客户阶段</label>
            <select value={values.stage} onChange={(e) => setVal("stage", e.target.value)} className={inputCls()}>
              {STAGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </section>

        {/* Budget & Requirements */}
        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="font-semibold text-sm">预算与需求</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">最低预算 (¥/月)</label>
              <input type="number" value={values.budget_min} onChange={(e) => setVal("budget_min", e.target.value)} className={inputCls()} placeholder="2000" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">最高预算 (¥/月)</label>
              <input type="number" value={values.budget_max} onChange={(e) => setVal("budget_max", e.target.value)} className={inputCls(!!formErrors.budget_max)} placeholder="5000" />
              {formErrors.budget_max && <p className="text-xs text-destructive">{formErrors.budget_max}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">意向区域</label>
              <input type="text" value={values.preferred_districts} onChange={(e) => setVal("preferred_districts", e.target.value)} className={inputCls()} placeholder="朝阳区, 海淀区（逗号分隔）" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">意向小区</label>
              <input type="text" value={values.preferred_communities} onChange={(e) => setVal("preferred_communities", e.target.value)} className={inputCls()} placeholder="阳光花园, 翠微南里（逗号分隔）" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">卧室数</label>
              <input type="number" value={values.bedrooms} onChange={(e) => setVal("bedrooms", e.target.value)} className={inputCls()} placeholder="2" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">租赁方式</label>
              <select value={values.rental_type} onChange={(e) => setVal("rental_type", e.target.value)} className={inputCls()}>
                <option value="">不限</option>
                <option value="whole_unit">整租</option>
                <option value="shared">合租</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">最短租期 (月)</label>
              <input type="number" value={values.minimum_lease_months} onChange={(e) => setVal("minimum_lease_months", e.target.value)} className={inputCls()} placeholder="12" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">可入住时间</label>
              <input type="date" value={values.available_from} onChange={(e) => setVal("available_from", e.target.value)} className={inputCls()} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">通勤目的地</label>
            <input type="text" value={values.commute_destination} onChange={(e) => setVal("commute_destination", e.target.value)} className={inputCls()} placeholder="例如：国贸、中关村" />
          </div>
        </section>

        {/* Preferences */}
        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="font-semibold text-sm">偏好与特殊要求</h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 min-h-[44px] cursor-pointer">
              <input type="checkbox" checked={values.pets_required === "1"} onChange={(e) => setVal("pets_required", e.target.checked ? "1" : "0")} className="h-4 w-4 rounded border-input text-primary focus:ring-ring" />
              <span className="text-sm">需要养宠物</span>
            </label>
            <label className="flex items-center gap-2 min-h-[44px] cursor-pointer">
              <input type="checkbox" checked={values.cooking_required === "1"} onChange={(e) => setVal("cooking_required", e.target.checked ? "1" : "0")} className="h-4 w-4 rounded border-input text-primary focus:ring-ring" />
              <span className="text-sm">需要做饭</span>
            </label>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">硬性要求</label>
            <textarea value={values.hard_requirements} onChange={(e) => setVal("hard_requirements", e.target.value)} className={cn(inputCls(), "min-h-[80px] resize-y")} rows={3} placeholder="逗号分隔多项" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">软性偏好</label>
            <textarea value={values.soft_preferences} onChange={(e) => setVal("soft_preferences", e.target.value)} className={cn(inputCls(), "min-h-[80px] resize-y")} rows={3} placeholder="逗号分隔多项" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">绝对不能接受的</label>
            <textarea value={values.deal_breakers} onChange={(e) => setVal("deal_breakers", e.target.value)} className={cn(inputCls(), "min-h-[80px] resize-y")} rows={3} placeholder="逗号分隔多项" />
          </div>
        </section>

        {submitError && <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{submitError}</div>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full inline-flex items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 min-h-[48px] disabled:opacity-50 transition-colors"
        >
          {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" />保存中...</> : "保存修改"}
        </button>
      </form>
    </div>
  );
}
```

## Design Notes

### API Contract Used
- `GET /api/clients` returns `{ data: { clients: ClientCard[], total: number } }` -- no phone/wechat
- `POST /api/clients` returns `{ data: { id: string }, error: null }` (201)
- `GET /api/clients/[id]` returns `{ data: { ...ClientDetail } }` -- includes phone/wechat
- `PATCH /api/clients/[id]` returns `{ data: { ... }, error: null }`
- `DELETE /api/clients/[id]` returns `{ data: { deleted: true }, error: null }`

### Error handling
All API errors are resolved via `json.error` which may be a string or `{ message: string }`.

### Ownership
The stage badge (`src/components/ui/stage-badge.tsx`) has been created by mobile-ui-engineer. The page files must be placed by property-crm-engineer in `src/app/(dashboard)/clients/**`.

### Dependencies
- `@/components/ui/stage-badge` -- created in this task
- `@/components/ui/confirm-dialog` -- existing, used for delete confirmation
- `@/lib/utils` (cn) -- existing
- `lucide-react` -- existing
