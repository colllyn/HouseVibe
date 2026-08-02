"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { UpdatePropertyInputSchema } from "@/features/properties/schemas";
// Updates via fetch() to Route Handler (per API contract)
async function updateViaApi(propertyId: string, data: Record<string, unknown>) {
  const resp = await fetch(`/api/properties/${propertyId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await resp.json();
  if (!resp.ok) return { error: result.error ?? "更新失败" };
  return { success: true as const };
}
import type { UpdatePropertyInput } from "@/features/properties/schemas";
import { ArrowLeft, Lock, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

function FieldWrapper({ label, required, error, children }: {
  label: string; required?: boolean; error?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1 text-sm font-medium">{label}{required && <span className="text-destructive">*</span>}</label>
      {children}
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
    </div>
  );
}

const inputCls = (e: boolean) => cn(
  "w-full rounded-md border bg-background px-3 py-2.5 text-sm min-h-[44px]",
  "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
  "disabled:cursor-not-allowed disabled:opacity-50",
  e ? "border-destructive" : "border-input"
);

export default function EditPropertyPage() {
  const params = useParams();
  const propertyId = params.propertyId as string;

  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [showPrivate, setShowPrivate] = React.useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<UpdatePropertyInput>({
    resolver: zodResolver(UpdatePropertyInputSchema),
  });

  // Load existing data
  React.useEffect(() => {
    fetch(`/api/properties/${propertyId}`)
      .then((r) => { if (!r.ok) throw new Error("加载失败"); return r.json(); })
      .then((data) => {
        reset({
          title: data.title ?? "",
          city: data.city ?? "",
          district: data.district ?? "",
          business_area: data.business_area ?? "",
          community_name: data.community_name ?? "",
          address_text: data.address_text ?? "",
          building_no: data.building_no ?? "",
          unit_no: data.unit_no ?? "",
          room_no: data.room_no ?? "",
          rental_type: data.rental_type ?? "whole_unit",
          monthly_rent: data.monthly_rent ?? undefined,
          deposit_terms: data.deposit_terms ?? "",
          bedrooms: data.bedrooms ?? undefined,
          living_rooms: data.living_rooms ?? undefined,
          bathrooms: data.bathrooms ?? undefined,
          area_sqm: data.area_sqm ?? undefined,
          floor: data.floor ?? undefined,
          total_floors: data.total_floors ?? undefined,
          minimum_lease_months: data.minimum_lease_months ?? undefined,
          orientation: data.orientation ?? "",
          decoration: data.decoration ?? "",
          available_from: data.available_from ?? "",
          has_elevator: data.has_elevator ?? false,
          pets_allowed: data.pets_allowed ?? false,
          cooking_allowed: data.cooking_allowed ?? false,
          subway_text: data.subway_text ?? "",
          tags: Array.isArray(data.tags) ? data.tags.join(", ") : "",
          selling_points: Array.isArray(data.selling_points) ? data.selling_points.join(", ") : "",
          drawbacks: Array.isArray(data.drawbacks) ? data.drawbacks.join(", ") : "",
          description: data.description ?? "",
          status: data.status ?? "draft",
          is_shared: data.is_shared ?? false,
          allow_marketing_reuse: data.allow_marketing_reuse ?? false,
          shared_expires_at: data.shared_expires_at ?? "",
          commission_split: data.commission_split ?? "",
          owner_name: data.private_details?.owner_name ?? "",
          owner_phone: data.private_details?.owner_phone ?? "",
          owner_wechat: data.private_details?.owner_wechat ?? "",
          exact_address: data.private_details?.exact_address ?? "",
          key_location: data.private_details?.key_location ?? "",
          internal_notes: data.private_details?.internal_notes ?? "",
        });
        setIsLoading(false);
      })
      .catch((e) => { setLoadError(e.message); setIsLoading(false); });
  }, [propertyId, reset]);

  const onSubmit = async (data: UpdatePropertyInput) => {
    setIsSubmitting(true);
    setSubmitError(null);
    const fd = new FormData();
    fd.set("propertyId", propertyId);
    Object.entries(data).forEach(([k, v]) => {
      if (v !== undefined && v !== null) {
        if (typeof v === "boolean") fd.set(k, v ? "on" : "off");
        else fd.set(k, String(v));
      }
    });
    try {
      const r = await updateViaApi(propertyId, Object.fromEntries(fd));
      if (r.error) { setSubmitError(r.error); setIsSubmitting(false); return; }
      window.location.href = `/properties/${propertyId}`;
    } catch { setSubmitError("保存失败，请重试"); setIsSubmitting(false); }
  };

  if (isLoading) return <div className="px-4 py-20 text-center text-muted-foreground">加载中...</div>;
  if (loadError) return <div className="px-4 py-20 text-center"><p className="text-destructive">{loadError}</p><Link href={`/properties/${propertyId}`} className="text-sm text-primary mt-2 inline-block">返回详情</Link></div>;

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href={`/properties/${propertyId}`} className="inline-flex items-center justify-center rounded-md h-10 w-10 hover:bg-muted transition-colors"><ArrowLeft className="h-5 w-5" /></Link>
        <div><h1 className="text-xl font-bold">编辑房源</h1><p className="text-sm text-muted-foreground">修改房源信息</p></div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>

        {/* Basic Info */}
        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="font-semibold text-sm">基本信息</h2>
          <FieldWrapper label="房源标题" required error={errors.title?.message}>
            <input type="text" {...register("title")} className={inputCls(!!errors.title)} />
          </FieldWrapper>
          <FieldWrapper label="城市" required error={errors.city?.message}>
            <input type="text" {...register("city")} className={inputCls(!!errors.city)} />
          </FieldWrapper>
          <div className="grid grid-cols-2 gap-3">
            <FieldWrapper label="区域" error={errors.district?.message}>
              <input type="text" {...register("district")} className={inputCls(!!errors.district)} />
            </FieldWrapper>
            <FieldWrapper label="商圈" error={errors.business_area?.message}>
              <input type="text" {...register("business_area")} className={inputCls(!!errors.business_area)} />
            </FieldWrapper>
          </div>
          <FieldWrapper label="小区" error={errors.community_name?.message}>
            <input type="text" {...register("community_name")} className={inputCls(!!errors.community_name)} />
          </FieldWrapper>
          <FieldWrapper label="地址" error={errors.address_text?.message}>
            <input type="text" {...register("address_text")} className={inputCls(!!errors.address_text)} />
          </FieldWrapper>
          <FieldWrapper label="租赁方式" error={errors.rental_type?.message}>
            <select {...register("rental_type")} className={inputCls(!!errors.rental_type)}>
              <option value="whole_unit">整租</option>
              <option value="shared">合租</option>
            </select>
          </FieldWrapper>
          <FieldWrapper label="状态" error={errors.status?.message}>
            <select {...register("status")} className={inputCls(!!errors.status)}>
              <option value="draft">草稿</option>
              <option value="available">在租</option>
              <option value="reserved">已定</option>
              <option value="rented">已租</option>
              <option value="offline">下架</option>
              <option value="expired">过期</option>
            </select>
          </FieldWrapper>
          <FieldWrapper label="描述" error={errors.description?.message}>
            <textarea {...register("description")} className={cn(inputCls(!!errors.description), "min-h-[100px] resize-y")} rows={4} />
          </FieldWrapper>
          <FieldWrapper label="标签" error={errors.tags?.message}>
            <input type="text" {...register("tags")} className={inputCls(!!errors.tags)} placeholder="逗号分隔" />
          </FieldWrapper>
        </section>

        {/* Rent & Specs */}
        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="font-semibold text-sm">租金与规格</h2>
          <div className="grid grid-cols-2 gap-3">
            <FieldWrapper label="月租 (¥)" error={errors.monthly_rent?.message}>
              <input type="number" {...register("monthly_rent")} className={inputCls(!!errors.monthly_rent)} />
            </FieldWrapper>
            <FieldWrapper label="押金方式" error={errors.deposit_terms?.message}>
              <input type="text" {...register("deposit_terms")} className={inputCls(!!errors.deposit_terms)} />
            </FieldWrapper>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <FieldWrapper label="卧室" error={errors.bedrooms?.message}>
              <input type="number" {...register("bedrooms")} className={inputCls(!!errors.bedrooms)} />
            </FieldWrapper>
            <FieldWrapper label="客厅" error={errors.living_rooms?.message}>
              <input type="number" {...register("living_rooms")} className={inputCls(!!errors.living_rooms)} />
            </FieldWrapper>
            <FieldWrapper label="卫浴" error={errors.bathrooms?.message}>
              <input type="number" {...register("bathrooms")} className={inputCls(!!errors.bathrooms)} />
            </FieldWrapper>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldWrapper label="面积 (㎡)" error={errors.area_sqm?.message}>
              <input type="number" step="0.01" {...register("area_sqm")} className={inputCls(!!errors.area_sqm)} />
            </FieldWrapper>
            <FieldWrapper label="最短租期(月)" error={errors.minimum_lease_months?.message}>
              <input type="number" {...register("minimum_lease_months")} className={inputCls(!!errors.minimum_lease_months)} />
            </FieldWrapper>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldWrapper label="楼层" error={errors.floor?.message}>
              <input type="number" {...register("floor")} className={inputCls(!!errors.floor)} />
            </FieldWrapper>
            <FieldWrapper label="总楼层" error={errors.total_floors?.message}>
              <input type="number" {...register("total_floors")} className={inputCls(!!errors.total_floors)} />
            </FieldWrapper>
          </div>
          <FieldWrapper label="朝向" error={errors.orientation?.message}>
            <input type="text" {...register("orientation")} className={inputCls(!!errors.orientation)} />
          </FieldWrapper>
          <FieldWrapper label="装修" error={errors.decoration?.message}>
            <input type="text" {...register("decoration")} className={inputCls(!!errors.decoration)} />
          </FieldWrapper>
          <FieldWrapper label="可入住时间" error={errors.available_from?.message}>
            <input type="date" {...register("available_from")} className={inputCls(!!errors.available_from)} />
          </FieldWrapper>
        </section>

        {/* Features */}
        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="font-semibold text-sm">设施与共享</h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 min-h-[44px] cursor-pointer"><input type="checkbox" {...register("has_elevator")} className="h-4 w-4 rounded border-input text-primary focus:ring-ring" /><span className="text-sm">有电梯</span></label>
            <label className="flex items-center gap-2 min-h-[44px] cursor-pointer"><input type="checkbox" {...register("pets_allowed")} className="h-4 w-4 rounded border-input text-primary focus:ring-ring" /><span className="text-sm">可养宠物</span></label>
            <label className="flex items-center gap-2 min-h-[44px] cursor-pointer"><input type="checkbox" {...register("cooking_allowed")} className="h-4 w-4 rounded border-input text-primary focus:ring-ring" /><span className="text-sm">可做饭</span></label>
          </div>
          <FieldWrapper label="地铁信息" error={errors.subway_text?.message}>
            <input type="text" {...register("subway_text")} className={inputCls(!!errors.subway_text)} />
          </FieldWrapper>
          <div className="border-t pt-3 mt-3">
            <label className="flex items-center gap-2 min-h-[44px] cursor-pointer"><input type="checkbox" {...register("is_shared")} className="h-4 w-4 rounded border-input text-primary focus:ring-ring" /><span className="text-sm">上架共享库</span></label>
            <label className="flex items-center gap-2 min-h-[44px] cursor-pointer"><input type="checkbox" {...register("allow_marketing_reuse")} className="h-4 w-4 rounded border-input text-primary focus:ring-ring" /><span className="text-sm">允许营销复用</span></label>
          </div>
        </section>

        {/* Sensitive Info */}
        <section className="rounded-lg border">
          <button type="button" onClick={() => setShowPrivate(!showPrivate)}
            className={cn("flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 min-h-[44px]", showPrivate ? "rounded-t-lg" : "rounded-lg")}>
            <span className="flex items-center gap-2"><Lock className="h-4 w-4 text-amber-500" />敏感信息（仅本门店可见）</span>
            {showPrivate ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showPrivate && (
            <div className="px-4 pb-4 space-y-4 border-t pt-4">
              <FieldWrapper label="房东姓名" error={errors.owner_name?.message}>
                <input type="text" {...register("owner_name")} className={inputCls(!!errors.owner_name)} />
              </FieldWrapper>
              <FieldWrapper label="房东电话" error={errors.owner_phone?.message}>
                <input type="tel" {...register("owner_phone")} className={inputCls(!!errors.owner_phone)} />
              </FieldWrapper>
              <FieldWrapper label="房东微信" error={errors.owner_wechat?.message}>
                <input type="text" {...register("owner_wechat")} className={inputCls(!!errors.owner_wechat)} />
              </FieldWrapper>
              <FieldWrapper label="精确地址" error={errors.exact_address?.message}>
                <input type="text" {...register("exact_address")} className={inputCls(!!errors.exact_address)} />
              </FieldWrapper>
              <FieldWrapper label="钥匙位置" error={errors.key_location?.message}>
                <input type="text" {...register("key_location")} className={inputCls(!!errors.key_location)} />
              </FieldWrapper>
              <FieldWrapper label="内部备注" error={errors.internal_notes?.message}>
                <textarea {...register("internal_notes")} className={cn(inputCls(!!errors.internal_notes), "min-h-[80px] resize-y")} rows={3} />
              </FieldWrapper>
            </div>
          )}
        </section>

        {submitError && <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{submitError}</div>}

        <button type="submit" disabled={isSubmitting} data-testid="property-edit-submit"
          className="w-full inline-flex items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 min-h-[48px] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" />保存中...</> : "保存修改"}
        </button>
      </form>
    </div>
  );
}
