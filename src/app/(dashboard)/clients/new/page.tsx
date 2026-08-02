"use client";

import * as React from "react";
import { ArrowLeft, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { STAGE_LABELS } from "@/features/clients/components/stage-badge";

const inputCls = (e?: boolean) => cn(
  "w-full rounded-md border bg-background px-3 py-2.5 text-sm min-h-[44px]",
  "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
  "disabled:cursor-not-allowed disabled:opacity-50",
  e ? "border-destructive" : "border-input"
);

const sectionCls = "space-y-4 rounded-lg border p-4";
const sectionTitleCls = "font-semibold text-sm";

export default function NewClientPage() {
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [showBudget, setShowBudget] = React.useState(false);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const data: Record<string, unknown> = {};
    fd.forEach((v, k) => { if (v !== "") data[k] = v; });

    for (const bk of ["pets_required", "cooking_required"]) {
      data[bk] = fd.has(bk);
    }

    try {
      const resp = await fetch("/api/clients", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await resp.json();
      if (!resp.ok) { setError(result.error ?? "创建失败"); setLoading(false); return; }
      window.location.href = `/clients/${result.id}`;
    } catch { setError("创建失败，请检查网络后重试"); setLoading(false); }
  };

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/clients" className="inline-flex items-center justify-center rounded-md h-10 w-10 hover:bg-muted"><ArrowLeft className="h-5 w-5" /></Link>
        <div><h1 className="text-xl font-bold">新增客户</h1></div>
      </div>

      <form onSubmit={handleCreate} className="space-y-6">
        {/* Basic Info */}
        <section className={sectionCls}>
          <h2 className={sectionTitleCls}>基本信息</h2>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">姓名 *</label>
            <input name="name" required className={inputCls()} placeholder="例如：张先生" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">手机号</label>
              <input name="phone" type="tel" className={inputCls()} placeholder="13800138000" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">微信</label>
              <input name="wechat" className={inputCls()} placeholder="微信号" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">来源平台</label>
            <input name="source_platform" className={inputCls()} placeholder="例如：小红书、贝壳、朋友介绍" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">当前阶段</label>
            <select name="stage" defaultValue="new" className={inputCls()}>
              {Object.entries(STAGE_LABELS).filter(([k]) => k !== "deleted").map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </section>

        {/* Preferences */}
        <section className={sectionCls}>
          <h2 className={sectionTitleCls}>找房偏好</h2>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">意向区域</label>
            <input name="preferred_districts" className={inputCls()} placeholder="逗号分隔，例如：朝阳区, 海淀区" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">意向小区</label>
            <input name="preferred_communities" className={inputCls()} placeholder="逗号分隔" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">户型需求</label>
              <input name="bedrooms" type="number" className={inputCls()} placeholder="例如：2" />
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
              <label className="text-sm font-medium">最早入住</label>
              <input name="available_from" type="date" className={inputCls()} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">最短租期(月)</label>
              <input name="minimum_lease_months" type="number" className={inputCls()} placeholder="例如：12" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">通勤目的地</label>
            <input name="commute_destination" className={inputCls()} placeholder="例如：国贸大厦" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 min-h-[44px] cursor-pointer">
              <input type="checkbox" name="pets_required" className="h-4 w-4" />
              <span className="text-sm">需要养宠物</span>
            </label>
            <label className="flex items-center gap-2 min-h-[44px] cursor-pointer">
              <input type="checkbox" name="cooking_required" className="h-4 w-4" />
              <span className="text-sm">需要做饭</span>
            </label>
          </div>
        </section>

        {/* Budget (collapsible) */}
        <section className="rounded-lg border">
          <button type="button" onClick={() => setShowBudget(!showBudget)}
            className={cn("flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 min-h-[44px]", showBudget ? "rounded-t-lg" : "rounded-lg")}>
            <span>预算与阶段信息</span>
            {showBudget ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showBudget && (
            <div className="px-4 pb-4 space-y-4 border-t pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">预算下限 (¥)</label>
                  <input name="budget_min" type="number" className={inputCls()} placeholder="例如：3000" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">预算上限 (¥)</label>
                  <input name="budget_max" type="number" className={inputCls()} placeholder="例如：5000" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">硬性要求</label>
                <textarea name="hard_requirements" className={cn(inputCls(), "min-h-[60px] resize-y")} rows={2} placeholder='JSON格式，例如：[{"key":"floor","value":"3楼以上"}]' />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">软性偏好</label>
                <textarea name="soft_preferences" className={cn(inputCls(), "min-h-[60px] resize-y")} rows={2} placeholder='JSON格式，例如：[{"key":"balcony","value":"最好有阳台"}]' />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">拒绝条件</label>
                <input name="deal_breakers" className={inputCls()} placeholder="逗号分隔，例如：无电梯, 朝北" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">下次跟进日期</label>
                <input name="next_follow_up_at" type="date" className={inputCls()} />
              </div>
            </div>
          )}
        </section>

        {error && <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

        <button type="submit" disabled={loading} data-testid="client-create-submit" className="w-full inline-flex items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 min-h-[48px] disabled:opacity-50 transition-colors">
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" />创建中...</> : "创建客户"}
        </button>
      </form>
    </div>
  );
}
