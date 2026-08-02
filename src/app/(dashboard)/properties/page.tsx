import { Suspense } from "react";
import { getProperties } from "@/features/properties/actions";
import Link from "next/link";
import { Building2, MapPin, ArrowUpRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

function Skeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-card p-4 animate-pulse space-y-3">
          <div className="h-32 bg-muted rounded-md" />
          <div className="h-5 bg-muted rounded w-3/4" />
          <div className="h-4 bg-muted rounded w-1/2" />
          <div className="flex gap-2">
            <div className="h-6 bg-muted rounded w-16" />
            <div className="h-6 bg-muted rounded w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

const SL: Record<string, string> = { draft: "草稿", available: "在租", reserved: "已定", rented: "已租", offline: "下架", expired: "过期", deleted: "已删除" };
const SC: Record<string, string> = { draft: "bg-gray-100 text-gray-700", available: "bg-green-100 text-green-700", reserved: "bg-yellow-100 text-yellow-700", rented: "bg-blue-100 text-blue-700", offline: "bg-gray-100 text-gray-500", expired: "bg-red-100 text-red-700", deleted: "bg-red-100 text-red-500" };

function Badge({ s }: { s: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", SC[s] ?? "bg-gray-100 text-gray-700")}>
      {SL[s] ?? s}
    </span>
  );
}

function Empty() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Building2 className="h-8 w-8 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold mb-1">暂无房源</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs">去录入第一套房源，开始管理您的房产信息</p>
      <Link href="/properties/new" className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 min-h-[44px] transition-colors">
        <Plus className="h-4 w-4" />录入房源
      </Link>
    </div>
  );
}

function ErrorState({ m }: { m: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <h2 className="text-lg font-semibold mb-1">加载失败</h2>
      <p className="text-sm text-muted-foreground mb-6">{m}</p>
      <Link href="/properties" className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium border border-input bg-background hover:bg-muted min-h-[44px] transition-colors">重试</Link>
    </div>
  );
}

function Card({ p }: { p: Record<string, unknown> }) {
  return (
    <Link href={`/properties/${p.id}`} className="group block rounded-lg border bg-card hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
      <div className="aspect-[4/3] bg-muted rounded-t-lg flex items-center justify-center overflow-hidden">
        <Building2 className="h-12 w-12 text-muted-foreground/40" />
      </div>
      <div className="p-4 space-y-2">
        <h3 className="font-semibold text-sm line-clamp-1 group-hover:text-primary transition-colors">{p.title as string}</h3>
        {(p.community_name || p.district) ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 flex-shrink-0" />
            <span className="line-clamp-1">{[p.district, p.community_name].filter(Boolean).join(" · ")}</span>
          </p>
        ) : null}
        <div className="flex items-center justify-between">
          {p.monthly_rent ? (
            <span className="text-base font-bold text-primary tabular-nums">
              ¥{Number(p.monthly_rent).toLocaleString()}
              <span className="text-xs font-normal text-muted-foreground">/月</span>
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">价格面议</span>
          )}
          <ArrowUpRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {p.bedrooms != null && <span className="text-xs text-muted-foreground">{p.bedrooms as number}室{p.living_rooms as number ?? 0}厅</span>}
          {p.area_sqm != null && <span className="text-xs text-muted-foreground">{p.area_sqm as number}㎡</span>}
          <Badge s={p.status as string} />
        </div>
        {Array.isArray(p.tags) && p.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {(p.tags as string[]).slice(0, 3).map((t: string) => (
              <span key={t} className="inline-block rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">{t}</span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

async function Content() {
  let properties: Awaited<ReturnType<typeof getProperties>>;
  let error: string | null = null;
  try {
    properties = await getProperties();
  } catch (e) {
    properties = [];
    error = e instanceof Error ? e.message : "加载房源失败";
  }
  if (error) return <ErrorState m={error} />;
  if (properties.length === 0) return <Empty />;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {properties.map((p) => (
        <Card key={p.id} p={p as Record<string, unknown>} />
      ))}
    </div>
  );
}

export default function PropertiesPage() {
  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">房源</h1>
          <p className="text-sm text-muted-foreground mt-1">管理您的房源信息</p>
        </div>
        <Link href="/properties/new" className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 min-h-[44px] transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">录入房源</span>
        </Link>
      </div>
      <Suspense fallback={<Skeleton />}>
        <Content />
      </Suspense>
    </div>
  );
}
