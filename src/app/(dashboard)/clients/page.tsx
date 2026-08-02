"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Users, MapPin, DollarSign, ArrowUpRight, Plus, SlidersHorizontal, X } from "lucide-react";
import { StageBadge } from "@/features/clients/components/stage-badge";
import { cn } from "@/lib/utils";

// Types
interface ClientCard {
  id: string;
  name: string;
  stage: string;
  budget_min?: number;
  budget_max?: number;
  preferred_districts?: string[];
  bedrooms?: number;
  rental_type?: string;
  next_follow_up_at?: string;
  last_interaction_at?: string;
  created_at: string;
}

interface ListData {
  clients: ClientCard[];
  total: number;
  page: number;
  limit: number;
}

function Card({ c }: { c: ClientCard }) {
  const preferredLocation = Array.isArray(c.preferred_districts) && c.preferred_districts.length > 0
    ? c.preferred_districts.join(" · ")
    : null;

  const hasBudget = c.budget_min != null || c.budget_max != null;
  const budgetText = hasBudget
    ? (c.budget_min != null && c.budget_max != null
      ? `¥${c.budget_min.toLocaleString()} - ¥${c.budget_max.toLocaleString()}`
      : c.budget_min != null
        ? `¥${c.budget_min.toLocaleString()}起`
        : (c.budget_max != null ? `¥${c.budget_max.toLocaleString()}以内` : null))
    : null;

  const hasOverdue = c.next_follow_up_at && new Date(c.next_follow_up_at) < new Date();

  return (
    <Link
      href={`/clients/${c.id}`}
      className="group block rounded-lg border bg-card hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
    >
      <div className="p-4 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm line-clamp-1 group-hover:text-primary transition-colors flex-1">
            {c.name}
          </h3>
          <ArrowUpRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors flex-shrink-0 mt-0.5" />
        </div>

        {preferredLocation ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 flex-shrink-0" />
            <span className="line-clamp-1">{preferredLocation}</span>
          </p>
        ) : null}

        {budgetText ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <DollarSign className="h-3 w-3 flex-shrink-0" />
            <span>{budgetText}</span>
          </p>
        ) : null}

        <div className="flex items-center gap-2 flex-wrap">
          <StageBadge stage={c.stage} />
          {c.bedrooms != null && <span className="text-xs text-muted-foreground">{c.bedrooms}室</span>}
          {c.rental_type && <span className="text-xs text-muted-foreground">{c.rental_type === "whole_unit" ? "整租" : c.rental_type === "shared" ? "合租" : c.rental_type}</span>}
        </div>

        {c.next_follow_up_at && (
          <p className={cn("text-xs", hasOverdue ? "text-destructive font-medium" : "text-muted-foreground")}>
            {hasOverdue ? "已逾期: " : "下次跟进: "}
            {new Date(c.next_follow_up_at).toLocaleDateString("zh-CN")}
          </p>
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
          <div className="h-5 bg-muted rounded w-3/4" />
          <div className="h-4 bg-muted rounded w-1/2" />
          <div className="h-4 bg-muted rounded w-1/3" />
          <div className="flex gap-2"><div className="h-6 bg-muted rounded w-16" /></div>
        </div>
      ))}
    </div>
  );
}

function Empty() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="rounded-full bg-muted p-4 mb-4"><Users className="h-8 w-8 text-muted-foreground" /></div>
      <h2 className="text-lg font-semibold mb-1">暂无客户</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs">添加您的第一位客户，开始管理跟进</p>
      <Link href="/clients/new" className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 min-h-[44px] transition-colors"><Plus className="h-4 w-4" />新增客户</Link>
    </div>
  );
}

function NoResults() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="rounded-full bg-muted p-4 mb-4"><SlidersHorizontal className="h-8 w-8 text-muted-foreground" /></div>
      <h2 className="text-lg font-semibold mb-1">暂无符合条件的客户</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs">试试放宽筛选条件或清除全部筛选</p>
      <Link href="/clients" className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium border border-input bg-background hover:bg-muted min-h-[44px] transition-colors"><X className="h-4 w-4" />清除筛选</Link>
    </div>
  );
}

function ErrorState({ m, onRetry }: { m: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <h2 className="text-lg font-semibold mb-1">加载失败</h2>
      <p className="text-sm text-muted-foreground mb-6">{m}</p>
      <button onClick={onRetry} className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium border border-input bg-background hover:bg-muted min-h-[44px] transition-colors">重试</button>
    </div>
  );
}

// Quick filter chips
const QUICK_FILTERS = [
  {
    key: "stage", label: "状态", options: [
      { value: "", label: "全部" },
      { value: "new", label: "新客户" },
      { value: "qualified", label: "已确认意向" },
      { value: "properties_sent", label: "已推送房源" },
      { value: "viewing_scheduled", label: "已约看" },
      { value: "viewed", label: "已看房" },
      { value: "considering", label: "考虑中" },
      { value: "closed_won", label: "已成交" },
      { value: "paused", label: "暂缓" },
      { value: "lost", label: "已流失" },
    ],
  },
  {
    key: "rentalType", label: "租赁方式", options: [
      { value: "", label: "全部" },
      { value: "whole_unit", label: "整租" },
      { value: "shared", label: "合租" },
    ],
  },
  {
    key: "hasFollowUp", label: "跟进状态", options: [
      { value: "", label: "全部" },
      { value: "true", label: "有跟进计划" },
      { value: "false", label: "无跟进计划" },
    ],
  },
];

const SORT_OPTIONS = [
  { value: "updated_at:desc", label: "最近更新" },
  { value: "next_follow_up_at:asc", label: "最近需跟进" },
  { value: "budget_min:asc", label: "预算升序" },
  { value: "budget_max:desc", label: "预算降序" },
];

function ClientsContent() {
  const searchParams = useSearchParams();
  const [data, setData] = React.useState<ListData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

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

  React.useEffect(() => { fetchClients(); }, [fetchClients]);

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.set("page", "1");
    window.history.pushState(null, "", `/clients?${params.toString()}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const activeFilters = React.useMemo(() => {
    const filters: { key: string; label: string; value: string }[] = [];
    for (const [k, v] of searchParams.entries()) {
      if (["page", "limit", "sortBy", "sortOrder"].includes(k)) continue;
      filters.push({ key: k, label: k, value: v });
    }
    return filters;
  }, [searchParams]);

  const clearAllFilters = () => { window.location.href = "/clients"; };

  const sortValue = `${searchParams.get("sortBy") ?? "updated_at"}:${searchParams.get("sortOrder") ?? "desc"}`;

  const updateSort = (combined: string) => {
    const parts = combined.split(":");
    const sortBy = parts[0] ?? "updated_at";
    const sortOrder = parts[1] ?? "desc";
    const params = new URLSearchParams(searchParams.toString());
    params.set("sortBy", sortBy);
    params.set("sortOrder", sortOrder);
    window.history.pushState(null, "", `/clients?${params.toString()}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">客户</h1>
          <p className="text-sm text-muted-foreground mt-1">管理您的客户与跟进</p>
        </div>
        <Link href="/clients/new" className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 min-h-[44px] transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">新增客户</span>
        </Link>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* Quick filters */}
        {QUICK_FILTERS.map((f) => (
          <select
            key={f.key}
            value={searchParams.get(f.key) ?? ""}
            onChange={(e) => updateFilter(f.key, e.target.value)}
            className="min-h-[44px] rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {f.options.map((o) => <option key={o.value} value={o.value}>{f.label}: {o.label}</option>)}
          </select>
        ))}

        {/* Sort */}
        <select
          value={sortValue}
          onChange={(e) => updateSort(e.target.value)}
          className="min-h-[44px] rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {/* Clear all */}
        {activeFilters.length > 0 && (
          <button onClick={clearAllFilters} className="inline-flex items-center gap-1 min-h-[44px] rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X className="h-4 w-4" />清除全部 ({activeFilters.length})
          </button>
        )}
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
              {f.key}={f.value} <X className="h-3 w-3" />
            </button>
          ))}
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
            {data.clients.map((c) => <Card key={c.id} c={c} />)}
          </div>
        </>
      )}
    </div>
  );
}

function ClientsFallback() { return <Skeleton />; }
export default function ClientsPage() {
  return (
    <React.Suspense fallback={<ClientsFallback />}>
      <ClientsContent />
    </React.Suspense>
  );
}
