"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Building2, SlidersHorizontal, X } from "lucide-react";
import { SharedPropertyCard } from "@/features/collaboration/components/shared-property-card";

interface SharedProperty {
  id: string;
  title: string;
  city: string;
  district: string | null;
  community_name: string | null;
  rental_type: string;
  monthly_rent: number | null;
  bedrooms: number | null;
  living_rooms: number | null;
  bathrooms: number | null;
  area_sqm: number | null;
  status: string;
  tags: string[] | null;
  shared_at: string | null;
  shared_expires_at: string | null;
  commission_split: string | null;
  workspace_id: string;
}

interface ListData {
  properties: SharedProperty[];
  total: number;
  page: number;
  limit: number;
}

const QUICK_FILTERS = [
  { key: "rentalType", label: "租赁方式", options: [
    { value: "", label: "全部" }, { value: "whole_unit", label: "整租" }, { value: "shared", label: "合租" },
  ]},
  { key: "bedrooms", label: "户型", options: [
    { value: "", label: "全部" }, { value: "1", label: "1室" }, { value: "2", label: "2室" }, { value: "3", label: "3室" },
  ]},
];

const URL_CHIP_LABELS: Record<string, string> = {
  district: "区域", city: "城市", businessArea: "商圈",
  communityName: "小区", rentalType: "租赁方式", bedrooms: "户型",
  minRent: "最低租金", maxRent: "最高租金", minArea: "最小面积", maxArea: "最大面积",
  petsAllowed: "可养宠物", cookingAllowed: "可做饭", hasElevator: "有电梯",
  availableBefore: "入住前", availableAfter: "入住后", subwayText: "地铁", search: "搜索",
};

const SORT_OPTIONS = [
  { value: "updated_at:desc", label: "最近更新" },
  { value: "monthly_rent_asc:asc", label: "租金升序" },
  { value: "monthly_rent_desc:desc", label: "租金降序" },
  { value: "available_from:asc", label: "可入住时间" },
];

function formatUrlChipValue(key: string, value: string): string {
  if (key === "petsAllowed" || key === "cookingAllowed" || key === "hasElevator") return value === "true" ? "是" : "否";
  if (key === "rentalType") return value === "whole_unit" ? "整租" : value === "shared" ? "合租" : value;
  if (key === "bedrooms") return `${value}室`;
  return value;
}

function SkeletonCard() {
  return (
    <div className="rounded-lg border bg-card animate-pulse">
      <div className="aspect-[4/3] bg-muted rounded-t-lg" />
      <div className="p-4 space-y-3">
        <div className="h-5 bg-muted rounded w-3/4" />
        <div className="h-4 bg-muted rounded w-1/2" />
        <div className="h-6 bg-muted rounded w-1/3" />
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Building2 className="h-8 w-8 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold mb-1">暂无共享房源</h2>
      <p className="text-sm text-muted-foreground max-w-xs">
        目前共享房源池中没有可浏览的房源。您可以将自己的房源上架到共享库，与其他门店协作。
      </p>
    </div>
  );
}

function EmptyFilterState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <SlidersHorizontal className="h-8 w-8 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold mb-1">暂无符合条件的共享房源</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs">试试放宽筛选条件或清除全部筛选</p>
      <button onClick={onClear} className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium border border-input bg-background hover:bg-muted min-h-[44px] transition-colors">
        <X className="h-4 w-4" />清除筛选
      </button>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <h2 className="text-lg font-semibold mb-1">加载失败</h2>
      <p className="text-sm text-muted-foreground mb-6">{message}</p>
      <button onClick={onRetry} className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium border border-input bg-background hover:bg-muted min-h-[44px] transition-colors">重试</button>
    </div>
  );
}

function SharedPropertiesContent() {
  const searchParams = useSearchParams();
  const [data, setData] = React.useState<ListData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchProperties = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = searchParams.toString();
      const resp = await fetch(`/api/shared-properties${qs ? `?${qs}` : ""}`);
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
    window.history.pushState(null, "", `/properties/shared?${params.toString()}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const clearAllFilters = () => {
    window.history.pushState(null, "", "/properties/shared");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const activeFilters = React.useMemo(() => {
    const filters: { key: string; label: string; value: string }[] = [];
    for (const [k, v] of searchParams.entries()) {
      if (["page", "limit", "sortBy", "sortOrder"].includes(k)) continue;
      filters.push({ key: k, label: URL_CHIP_LABELS[k] ?? k, value: formatUrlChipValue(k, v) });
    }
    return filters;
  }, [searchParams]);

  const sortValue = `${searchParams.get("sortBy") ?? "updated_at"}:${searchParams.get("sortOrder") ?? "desc"}`;

  const updateSort = (combined: string) => {
    const parts = combined.split(":");
    const sortBy = parts[0] ?? "updated_at";
    const sortOrder = parts[1] ?? "desc";
    const params = new URLSearchParams(searchParams.toString());
    params.set("sortBy", sortBy);
    params.set("sortOrder", sortOrder);
    window.history.pushState(null, "", `/properties/shared?${params.toString()}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 max-w-6xl mx-auto min-h-dvh">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-xl font-bold">共享房源池</h1>
        <p className="text-sm text-muted-foreground mt-1">浏览其他门店上架的共享房源，发起协作请求</p>
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
            <span
              key={`${f.key}-${f.value}`}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs text-primary"
            >
              {f.label}: {f.value}
              <button
                onClick={() => updateFilter(f.key, "")}
                className="ml-1 hover:text-primary/70"
                aria-label={`移除筛选 ${f.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <Skeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchProperties} />
      ) : !data || data.properties.length === 0 ? (
        activeFilters.length > 0 ? <EmptyFilterState onClear={clearAllFilters} /> : <EmptyState />
      ) : (
        <>
          <div className="text-xs text-muted-foreground mb-3">共 {data.total} 套共享房源</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.properties.map((p) => (
              <SharedPropertyCard key={p.id} property={p} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SharedPropertiesFallback() {
  return <Skeleton />;
}

export default function SharedPropertiesPage() {
  return (
    <React.Suspense fallback={<SharedPropertiesFallback />}>
      <SharedPropertiesContent />
    </React.Suspense>
  );
}
