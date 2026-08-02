import { Suspense } from "react";
import { getPropertyById } from "@/features/properties/actions";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2, MapPin, Lock, Pencil } from "lucide-react";
import { DeletePropertyButton } from "./delete-button";

function DetailSkeleton() {
  return <div className="px-4 py-4 sm:px-6 sm:py-6 max-w-3xl mx-auto animate-pulse space-y-6"><div className="h-6 bg-muted rounded w-32" /><div className="h-8 bg-muted rounded w-3/4" /><div className="h-4 bg-muted rounded w-1/2" /><div className="h-20 bg-muted rounded" /><div className="h-20 bg-muted rounded" /></div>;
}

const STATUS_LABELS: Record<string, string> = { draft: "草稿", available: "在租", reserved: "已定", rented: "已租", offline: "下架", expired: "过期", deleted: "已删除" };

function StatusBadge({ status }: { status: string }) {
  return <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-100 text-green-700">{STATUS_LABELS[status] ?? status}</span>;
}

function DetailRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === "") return null;
  return <div className="flex items-start justify-between py-2 border-b border-muted last:border-b-0"><span className="text-sm text-muted-foreground">{label}</span><span className="text-sm font-medium text-right max-w-[60%]">{String(value)}</span></div>;
}

async function PropertyDetailContent({ propertyId }: { propertyId: string }) {
  const property = await getPropertyById(propertyId);
  if (!property) notFound();

  const pd = property.private_details;

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/properties" className="inline-flex items-center justify-center rounded-md h-10 w-10 hover:bg-muted transition-colors"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="flex-1">
          <div className="flex items-center gap-2"><h1 className="text-xl font-bold">{property.title}</h1><StatusBadge status={property.status} /></div>
          {property.community_name || property.district ? <p className="flex items-center gap-1 text-sm text-muted-foreground mt-1"><MapPin className="h-3.5 w-3.5" />{[property.city, property.district, property.community_name].filter(Boolean).join(" · ")}</p> : null}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mb-6">
        <Link href={`/properties/${property.id}/edit`} className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium border border-input hover:bg-muted min-h-[44px] transition-colors"><Pencil className="h-4 w-4" />编辑</Link>
        <DeletePropertyButton propertyId={property.id} />
      </div>

      {/* Cover */}
      <div className="aspect-video bg-muted rounded-lg flex items-center justify-center mb-6"><Building2 className="h-16 w-16 text-muted-foreground/30" /></div>

      {/* Basic Info */}
      <section className="rounded-lg border mb-6"><h2 className="font-semibold text-sm px-4 py-3 border-b">基本信息</h2>
        <div className="px-4 py-2">
          <DetailRow label="月租" value={property.monthly_rent ? `¥${property.monthly_rent.toLocaleString()}/月` : undefined} />
          <DetailRow label="押金" value={property.deposit_terms} />
          <DetailRow label="户型" value={property.bedrooms != null ? `${property.bedrooms}室${property.living_rooms ?? 0}厅${property.bathrooms ?? 0}卫` : undefined} />
          <DetailRow label="面积" value={property.area_sqm ? `${property.area_sqm}㎡` : undefined} />
          <DetailRow label="楼层" value={property.floor != null ? `${property.floor}/${property.total_floors ?? "?"}层` : undefined} />
          <DetailRow label="最短租期" value={property.minimum_lease_months ? `${property.minimum_lease_months}个月` : undefined} />
          <DetailRow label="朝向" value={property.orientation} />
          <DetailRow label="装修" value={property.decoration} />
          <DetailRow label="租赁方式" value={property.rental_type === "whole_unit" ? "整租" : property.rental_type === "shared" ? "合租" : property.rental_type} />
          <DetailRow label="可入住时间" value={property.available_from} />
          <DetailRow label="地址" value={property.address_text} />
          <DetailRow label="描述" value={property.description} />
        </div>
      </section>

      {/* Features */}
      <section className="rounded-lg border mb-6"><h2 className="font-semibold text-sm px-4 py-3 border-b">配套设施</h2>
        <div className="px-4 py-3 space-y-2">
          <DetailRow label="电梯" value={property.has_elevator ? "有" : "无"} />
          <DetailRow label="可养宠物" value={property.pets_allowed ? "是" : "否"} />
          <DetailRow label="可做饭" value={property.cooking_allowed ? "是" : "否"} />
          <DetailRow label="地铁信息" value={property.subway_text} />
        </div>
      </section>

      {/* Tags */}
      {property.tags && property.tags.length > 0 && (<section className="rounded-lg border mb-6"><h2 className="font-semibold text-sm px-4 py-3 border-b">标签</h2><div className="px-4 py-3 flex flex-wrap gap-2">{property.tags.map((tag: string) => <span key={tag} className="inline-block rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground">{tag}</span>)}</div></section>)}

      {/* Sensitive Info */}
      <section className="rounded-lg border mb-6"><h2 className="font-semibold text-sm px-4 py-3 border-b flex items-center gap-2"><Lock className="h-4 w-4 text-amber-500" />敏感信息（仅本门店可见）</h2>
        <div className="px-4 py-2">
          {pd ? (<>
            <DetailRow label="房东姓名" value={pd.owner_name} />
            <DetailRow label="房东电话" value={pd.owner_phone} />
            <DetailRow label="房东微信" value={pd.owner_wechat} />
            <DetailRow label="精确地址" value={pd.exact_address} />
            <DetailRow label="钥匙位置" value={pd.key_location} />
            <DetailRow label="内部备注" value={pd.internal_notes} />
          </>) : <div className="py-4 text-sm text-muted-foreground text-center">暂无敏感信息</div>}
        </div>
      </section>

      {/* Sharing */}
      <section className="rounded-lg border mb-6"><h2 className="font-semibold text-sm px-4 py-3 border-b">共享与营销</h2>
        <div className="px-4 py-2">
          <DetailRow label="共享库" value={property.is_shared ? "已上架" : "未上架"} />
          <DetailRow label="营销复用授权" value={property.allow_marketing_reuse ? "已授权" : "未授权"} />
          <DetailRow label="共享有效期" value={property.shared_expires_at} />
        </div>
      </section>
    </div>
  );
}

export default async function PropertyDetailPage({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;
  return <Suspense fallback={<DetailSkeleton />}><PropertyDetailContent propertyId={propertyId} /></Suspense>;
}
