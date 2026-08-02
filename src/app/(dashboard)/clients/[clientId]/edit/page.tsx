"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { STAGE_LABELS } from "@/features/clients/components/stage-badge";

const inputCls = (e: boolean) => cn(
  "w-full rounded-md border bg-background px-3 py-2.5 text-sm min-h-[44px]",
  "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
  "disabled:cursor-not-allowed disabled:opacity-50",
  e ? "border-destructive" : "border-input"
);

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

export default function EditClientPage() {
  const params = useParams();
  const clientId = params.clientId as string;

  const [formData, setFormData] = React.useState<Record<string, string | boolean | null>>({});
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  // Load existing data
  React.useEffect(() => {
    fetch(`/api/clients/${clientId}`)
      .then((r) => { if (!r.ok) throw new Error("加载失败"); return r.json(); })
      .then((data) => {
        setFormData({
          name: data.name ?? "",
          phone: data.phone ?? "",
          wechat: data.wechat ?? "",
          source_platform: data.source_platform ?? "",
          budget_min: data.budget_min ?? "",
          budget_max: data.budget_max ?? "",
          preferred_districts: Array.isArray(data.preferred_districts) ? data.preferred_districts.join(", ") : "",
          preferred_communities: Array.isArray(data.preferred_communities) ? data.preferred_communities.join(", ") : "",
          bedrooms: data.bedrooms ?? "",
          rental_type: data.rental_type ?? "",
          available_from: data.available_from ?? "",
          minimum_lease_months: data.minimum_lease_months ?? "",
          pets_required: data.pets_required ?? false,
          cooking_required: data.cooking_required ?? false,
          commute_destination: data.commute_destination ?? "",
          hard_requirements: data.hard_requirements ? (typeof data.hard_requirements === "string" ? data.hard_requirements : JSON.stringify(data.hard_requirements)) : "",
          soft_preferences: data.soft_preferences ? (typeof data.soft_preferences === "string" ? data.soft_preferences : JSON.stringify(data.soft_preferences)) : "",
          deal_breakers: Array.isArray(data.deal_breakers) ? data.deal_breakers.join(", ") : "",
          stage: data.stage ?? "new",
          raw_input_text: data.raw_input_text ?? "",
          next_follow_up_at: data.next_follow_up_at ?? "",
        });
        setIsLoading(false);
      })
      .catch((e) => { setLoadError(e.message); setIsLoading(false); });
  }, [clientId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === "checkbox") {
      setFormData((prev) => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const resp = await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const result = await resp.json();
      if (!resp.ok) { setSubmitError(result.error ?? "保存失败"); setIsSubmitting(false); return; }
      window.location.href = `/clients/${clientId}`;
    } catch { setSubmitError("保存失败，请重试"); setIsSubmitting(false); }
  };

  if (isLoading) return <div className="px-4 py-20 text-center text-muted-foreground">加载中...</div>;
  if (loadError) return <div className="px-4 py-20 text-center"><p className="text-destructive">{loadError}</p><Link href={`/clients/${clientId}`} className="text-sm text-primary mt-2 inline-block">返回详情</Link></div>;

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href={`/clients/${clientId}`} className="inline-flex items-center justify-center rounded-md h-10 w-10 hover:bg-muted transition-colors"><ArrowLeft className="h-5 w-5" /></Link>
        <div><h1 className="text-xl font-bold">编辑客户</h1><p className="text-sm text-muted-foreground">修改客户信息</p></div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {/* Basic Info */}
        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="font-semibold text-sm">基本信息</h2>
          <FieldWrapper label="姓名" required>
            <input type="text" name="name" required value={formData.name as string ?? ""} onChange={handleChange} className={inputCls(false)} />
          </FieldWrapper>
          <div className="grid grid-cols-2 gap-3">
            <FieldWrapper label="手机号">
              <input type="tel" name="phone" value={formData.phone as string ?? ""} onChange={handleChange} className={inputCls(false)} />
            </FieldWrapper>
            <FieldWrapper label="微信">
              <input type="text" name="wechat" value={formData.wechat as string ?? ""} onChange={handleChange} className={inputCls(false)} />
            </FieldWrapper>
          </div>
          <FieldWrapper label="来源平台">
            <input type="text" name="source_platform" value={formData.source_platform as string ?? ""} onChange={handleChange} className={inputCls(false)} />
          </FieldWrapper>
          <FieldWrapper label="当前阶段">
            <select name="stage" value={formData.stage as string ?? "new"} onChange={handleChange} className={inputCls(false)}>
              {Object.entries(STAGE_LABELS).filter(([k]) => k !== "deleted").map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </FieldWrapper>
        </section>

        {/* Preferences */}
        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="font-semibold text-sm">找房偏好</h2>
          <FieldWrapper label="意向区域">
            <input type="text" name="preferred_districts" value={formData.preferred_districts as string ?? ""} onChange={handleChange} className={inputCls(false)} placeholder="逗号分隔" />
          </FieldWrapper>
          <FieldWrapper label="意向小区">
            <input type="text" name="preferred_communities" value={formData.preferred_communities as string ?? ""} onChange={handleChange} className={inputCls(false)} placeholder="逗号分隔" />
          </FieldWrapper>
          <div className="grid grid-cols-2 gap-3">
            <FieldWrapper label="户型需求">
              <input type="number" name="bedrooms" value={formData.bedrooms as string ?? ""} onChange={handleChange} className={inputCls(false)} />
            </FieldWrapper>
            <FieldWrapper label="租赁方式">
              <select name="rental_type" value={formData.rental_type as string ?? ""} onChange={handleChange} className={inputCls(false)}>
                <option value="">不限</option>
                <option value="whole_unit">整租</option>
                <option value="shared">合租</option>
              </select>
            </FieldWrapper>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldWrapper label="最早入住">
              <input type="date" name="available_from" value={formData.available_from as string ?? ""} onChange={handleChange} className={inputCls(false)} />
            </FieldWrapper>
            <FieldWrapper label="最短租期(月)">
              <input type="number" name="minimum_lease_months" value={formData.minimum_lease_months as string ?? ""} onChange={handleChange} className={inputCls(false)} />
            </FieldWrapper>
          </div>
          <FieldWrapper label="通勤目的地">
            <input type="text" name="commute_destination" value={formData.commute_destination as string ?? ""} onChange={handleChange} className={inputCls(false)} />
          </FieldWrapper>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 min-h-[44px] cursor-pointer">
              <input type="checkbox" name="pets_required" checked={!!formData.pets_required} onChange={handleChange} className="h-4 w-4 rounded border-input text-primary focus:ring-ring" />
              <span className="text-sm">需要养宠物</span>
            </label>
            <label className="flex items-center gap-2 min-h-[44px] cursor-pointer">
              <input type="checkbox" name="cooking_required" checked={!!formData.cooking_required} onChange={handleChange} className="h-4 w-4 rounded border-input text-primary focus:ring-ring" />
              <span className="text-sm">需要做饭</span>
            </label>
          </div>
        </section>

        {/* Budget & Requirements */}
        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="font-semibold text-sm">预算与要求</h2>
          <div className="grid grid-cols-2 gap-3">
            <FieldWrapper label="预算下限 (¥)">
              <input type="number" name="budget_min" value={formData.budget_min as string ?? ""} onChange={handleChange} className={inputCls(false)} />
            </FieldWrapper>
            <FieldWrapper label="预算上限 (¥)">
              <input type="number" name="budget_max" value={formData.budget_max as string ?? ""} onChange={handleChange} className={inputCls(false)} />
            </FieldWrapper>
          </div>
          <FieldWrapper label="硬性要求">
            <textarea name="hard_requirements" value={formData.hard_requirements as string ?? ""} onChange={handleChange} className={cn(inputCls(false), "min-h-[60px] resize-y")} rows={2} placeholder='JSON格式' />
          </FieldWrapper>
          <FieldWrapper label="软性偏好">
            <textarea name="soft_preferences" value={formData.soft_preferences as string ?? ""} onChange={handleChange} className={cn(inputCls(false), "min-h-[60px] resize-y")} rows={2} placeholder='JSON格式' />
          </FieldWrapper>
          <FieldWrapper label="拒绝条件">
            <input type="text" name="deal_breakers" value={formData.deal_breakers as string ?? ""} onChange={handleChange} className={inputCls(false)} placeholder="逗号分隔" />
          </FieldWrapper>
          <FieldWrapper label="下次跟进日期">
            <input type="date" name="next_follow_up_at" value={formData.next_follow_up_at as string ?? ""} onChange={handleChange} className={inputCls(false)} />
          </FieldWrapper>
        </section>

        {/* Raw input */}
        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="font-semibold text-sm">原始录入</h2>
          <FieldWrapper label="原始文本">
            <textarea name="raw_input_text" value={formData.raw_input_text as string ?? ""} onChange={handleChange} className={cn(inputCls(false), "min-h-[80px] resize-y")} rows={3} placeholder="客户原始需求描述" />
          </FieldWrapper>
        </section>

        {submitError && <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{submitError}</div>}

        <button type="submit" disabled={isSubmitting} data-testid="client-edit-submit"
          className="w-full inline-flex items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 min-h-[48px] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" />保存中...</> : "保存修改"}
        </button>
      </form>
    </div>
  );
}
