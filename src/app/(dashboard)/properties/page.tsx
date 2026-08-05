"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Building2, MapPin, ArrowUpRight, Plus, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SearchInput } from "@/features/properties/components/search-input";
import type { SearchInputHandle } from "@/features/properties/components/search-input";
import { SearchChips } from "@/features/properties/components/search-chips";
import { useSemanticSearch } from "@/features/properties/hooks/use-semantic-search";
import { useFeatureEntitlement } from "@/features/properties/hooks/use-feature-entitlement";

// Types
interface PropertyCard {
  id: string; title: string; city: string; district?: string;
  community_name?: string; rental_type: string; monthly_rent?: number;
  bedrooms?: number; living_rooms?: number; area_sqm?: number;
  status: string; tags?: string[];
}

interface ListData {
  properties: PropertyCard[];
  total: number;
  page: number;
  limit: number;
}

const SL: Record<string, string> = { draft: "草稿", available: "在租", reserved: "已定", rented: "已租", offline: "下架", expired: "过期", deleted: "已删除" };
const SC: Record<string, string> = { draft: "bg-gray-100 text-gray-700", available: "bg-green-100 text-green-700", reserved: "bg-yellow-100 text-yellow-700", rented: "bg-blue-100 text-blue-700", offline: "bg-gray-100 text-gray-500", expired: "bg-red-100 text-red-700", deleted: "bg-red-100 text-red-500" };

// Human-readable labels for URL filter chips (contract §6.1: chips must have understandable labels)
const URL_CHIP_LABELS: Record<string, string> = {
  status: "状态", district: "区域", city: "城市", businessArea: "商圈",
  community: "小区", communityName: "小区", rentalType: "租赁方式", bedrooms: "户型",
  minRent: "最低租金", maxRent: "最高租金", minArea: "最小面积", maxArea: "最大面积",
  petsAllowed: "可养宠物", cookingAllowed: "可做饭", hasElevator: "有电梯",
  availableBefore: "入住前", availableAfter: "入住后", isShared: "共享",
  feature: "特色", subwayText: "地铁", search: "搜索",
};
function formatUrlChipValue(key: string, value: string): string {
  if (key === "petsAllowed" || key === "cookingAllowed" || key === "hasElevator") return value === "true" ? "是" : "否";
  if (key === "rentalType") return value === "whole_unit" ? "整租" : value === "shared" ? "合租" : value;
  if (key === "isShared") return value === "true" ? "是" : "否";
  if (key === "bedrooms") return `${value}室`;
  if (key === "status") return SL[value] ?? value;
  return value;
}

function Badge({ s }: { s: string }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", SC[s] ?? "bg-gray-100 text-gray-700")}>{SL[s] ?? s}</span>;
}

function Card({ p }: { p: PropertyCard }) {
  return (
    <Link href={`/properties/${p.id}`} className="group block rounded-lg border bg-card hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
      <div className="aspect-[4/3] bg-muted rounded-t-lg flex items-center justify-center overflow-hidden">
        <Building2 className="h-12 w-12 text-muted-foreground/40" />
      </div>
      <div className="p-4 space-y-2">
        <h3 className="font-semibold text-sm line-clamp-1 group-hover:text-primary transition-colors">{p.title}</h3>
        {(p.community_name || p.district) ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 flex-shrink-0" />
            <span className="line-clamp-1">{[p.district, p.community_name].filter(Boolean).join(" · ")}</span>
          </p>
        ) : null}
        <div className="flex items-center justify-between">
          {p.monthly_rent ? (
            <span className="text-base font-bold text-primary tabular-nums">¥{p.monthly_rent.toLocaleString()}<span className="text-xs font-normal text-muted-foreground">/月</span></span>
          ) : <span className="text-sm text-muted-foreground">价格面议</span>}
          <ArrowUpRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {p.bedrooms != null && <span className="text-xs text-muted-foreground">{p.bedrooms}室{p.living_rooms ?? 0}厅</span>}
          {p.area_sqm != null && <span className="text-xs text-muted-foreground">{p.area_sqm}㎡</span>}
          <Badge s={p.status} />
        </div>
        {Array.isArray(p.tags) && p.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">{(p.tags as string[]).slice(0, 3).map((t: string) => <span key={t} className="inline-block rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">{t}</span>)}</div>
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
          <div className="h-32 bg-muted rounded-md" />
          <div className="h-5 bg-muted rounded w-3/4" />
          <div className="h-4 bg-muted rounded w-1/2" />
          <div className="flex gap-2"><div className="h-6 bg-muted rounded w-16" /><div className="h-6 bg-muted rounded w-16" /></div>
        </div>
      ))}
    </div>
  );
}

function Empty() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="rounded-full bg-muted p-4 mb-4"><Building2 className="h-8 w-8 text-muted-foreground" /></div>
      <h2 className="text-lg font-semibold mb-1">暂无房源</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs">去录入第一套房源，开始管理您的房产信息</p>
      <Link href="/properties/new" className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 min-h-[44px] transition-colors"><Plus className="h-4 w-4" />录入房源</Link>
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
  { key: "status", label: "状态", options: [
    { value: "", label: "全部" }, { value: "available", label: "在租" }, { value: "draft", label: "草稿" }, { value: "reserved", label: "已定" }, { value: "rented", label: "已租" },
  ]},
  { key: "rentalType", label: "租赁方式", options: [
    { value: "", label: "全部" }, { value: "whole_unit", label: "整租" }, { value: "shared", label: "合租" },
  ]},
  { key: "bedrooms", label: "户型", options: [
    { value: "", label: "全部" }, { value: "1", label: "1室" }, { value: "2", label: "2室" }, { value: "3", label: "3室" },
  ]},
];

const SORT_OPTIONS = [
  { value: "updated_at:desc", label: "最近更新" },
  { value: "monthly_rent_asc:asc", label: "租金升序" },
  { value: "monthly_rent_desc:desc", label: "租金降序" },
  { value: "available_from:asc", label: "可入住时间" },
];

function PropertiesContent() {
  const searchParams = useSearchParams();
  const [data, setData] = React.useState<ListData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const searchInputRef = React.useRef<SearchInputHandle>(null);

  // Entitlement gate for semantic search
  const { entitled: semanticSearchEntitled, loading: entitlementLoading } =
    useFeatureEntitlement("semantic_search");

  // URL update callback for semantic search hook
  const onUrlUpdate = React.useCallback(
    (params: URLSearchParams) => {
      // Merge with existing params (preserve any non-search filters)
      const merged = new URLSearchParams(searchParams.toString());
      // Remove old search-related params
      merged.delete("search");
      // Remove old array params before reapplying (to avoid stale values)
      merged.delete("district");
      merged.delete("community");
      merged.delete("feature");
      // Collect array values per param for append; scalar params use set
      const arrayParamNames = new Set(["district", "community", "feature"]);
      const arrayValues = new Map<string, string[]>();
      // Apply new params: append for array params, set for scalar
      for (const [k, v] of params.entries()) {
        if (!v) { merged.delete(k); continue; }
        if (arrayParamNames.has(k)) {
          if (!arrayValues.has(k)) arrayValues.set(k, []);
          const arr = arrayValues.get(k);
          if (arr) arr.push(v);
        } else {
          merged.set(k, v);
        }
      }
      // Append array values after clearing
      for (const [k, vals] of arrayValues) {
        for (const v of vals) {
          merged.append(k, v);
        }
      }
      window.history.pushState(null, "", `/properties?${merged.toString()}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    },
    [searchParams]
  );

  // Semantic search hook
  const {
    state: searchState,
    submit: submitSearch,
    clear: clearSearch,
    removeChip,
  } = useSemanticSearch(onUrlUpdate);

  const fetchProperties = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = searchParams.toString();
      const resp = await fetch(`/api/properties${qs ? `?${qs}` : ""}`);
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

  React.useEffect(() => { fetchProperties(); }, [fetchProperties]);

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.set("page", "1");
    window.history.pushState(null, "", `/properties?${params.toString()}`);
    // Trigger a re-render via URL change
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const activeFilters = React.useMemo(() => {
    const filters: { key: string; label: string; value: string }[] = [];
    // Array param types that use repeated URL params — needs unique compound keys
    const ARRAY_PARAMS = new Set(["district", "community", "feature"]);
    for (const [k, v] of searchParams.entries()) {
      if (["page", "limit", "sortBy", "sortOrder"].includes(k)) continue;
      const label = URL_CHIP_LABELS[k] ?? k;
      // For array params, use compound key (param-value) for uniqueness and removal
      const key = ARRAY_PARAMS.has(k) ? `${k}-${v}` : k;
      filters.push({ key, label, value: formatUrlChipValue(k, v) });
    }
    return filters;
  }, [searchParams]);

  const clearAllFilters = () => {
    window.history.pushState(null, "", "/properties");
    window.dispatchEvent(new PopStateEvent("popstate"));
    clearSearch();
  };

  const sortValue = `${searchParams.get("sortBy") ?? "updated_at"}:${searchParams.get("sortOrder") ?? "desc"}`;

  const updateSort = (combined: string) => {
    const parts = combined.split(":");
    const sortBy = parts[0] ?? "updated_at";
    const sortOrder = parts[1] ?? "desc";
    const params = new URLSearchParams(searchParams.toString());
    params.set("sortBy", sortBy);
    params.set("sortOrder", sortOrder);
    window.history.pushState(null, "", `/properties?${params.toString()}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 max-w-6xl mx-auto min-h-dvh">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">房源</h1>
          <p className="text-sm text-muted-foreground mt-1">管理您的房源信息</p>
        </div>
        <Link href="/properties/new" className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 min-h-[44px] transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">录入房源</span>
        </Link>
      </div>

      {/* Semantic search input (gated on entitlement) */}
      {!entitlementLoading && (
        <SearchInput
          ref={searchInputRef}
          phase={searchState.phase}
          message={searchState.message}
          parserAvailable={searchState.parserAvailable}
          onSubmit={submitSearch}
          onClear={clearSearch}
          entitled={semanticSearchEntitled}
          className="mb-4"
        />
      )}

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

      {/* Combined chips: URL filters + semantic search chips */}
      <SearchChips
        urlChips={activeFilters.map((f) => ({ key: f.key, label: f.label, value: f.value }))}
        aiChips={searchState.chips}
        fallbackChips={
          searchState.phase === "fallback_text" || searchState.phase === "fallback_error"
            ? searchState.chips
            : []
        }
        onRemoveUrlChip={(key) => {
          // Multi-value array params: key is "param-value", e.g. "district-天河区"
          const ARRAY_PARAM_PREFIXES = ["district", "community", "feature"];
          const matched = ARRAY_PARAM_PREFIXES.find((p) => key.startsWith(`${p}-`));
          if (matched) {
            const valueToRemove = key.slice(`${matched}-`.length);
            const params = new URLSearchParams(searchParams.toString());
            const allValues = params.getAll(matched);
            params.delete(matched);
            for (const v of allValues) {
              if (v !== valueToRemove) params.append(matched, v);
            }
            params.set("page", "1");
            window.history.pushState(null, "", `/properties?${params.toString()}`);
            window.dispatchEvent(new PopStateEvent("popstate"));
          } else {
            updateFilter(key, "");
          }
          removeChip(key);
          searchInputRef.current?.focus();
        }}
        onRemoveFallbackChip={(_key) => {
          updateFilter("search", "");
          clearSearch();
          searchInputRef.current?.focus();
        }}
        onClearAll={clearAllFilters}
        className="mb-4"
      />

      {/* Content */}
      {loading ? (
        <Skeleton />
      ) : error ? (
        <ErrorState m={error} onRetry={fetchProperties} />
      ) : !data || data.properties.length === 0 ? (
        (activeFilters.length > 0 || searchState.chips.length > 0) ? (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
            <div className="rounded-full bg-muted p-4 mb-4"><SlidersHorizontal className="h-8 w-8 text-muted-foreground" /></div>
            <h2 className="text-lg font-semibold mb-1">暂无符合条件的房源</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-xs">
              {searchState.phase === "structured"
                ? "未找到匹配房源 · 尝试删除筛选条件或修改搜索词"
                : "试试放宽筛选条件或清除全部筛选"}
            </p>
            <Link href="/properties" className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium border border-input bg-background hover:bg-muted min-h-[44px] transition-colors"><X className="h-4 w-4" />清除筛选</Link>
          </div>
        ) : <Empty />
      ) : (
        <>
          <div className="text-xs text-muted-foreground mb-3">共 {data.total} 套房源</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.properties.map((p) => <Card key={p.id} p={p} />)}
          </div>
        </>
      )}
    </div>
  );
}

function PropertiesFallback() { return <Skeleton />; }
export default function PropertiesPage() {
  return (
    <React.Suspense fallback={<PropertiesFallback />}>
      <PropertiesContent />
    </React.Suspense>
  );
}
