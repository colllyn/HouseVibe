"use client";

import * as React from "react";
import { ArrowLeft, Lock, Loader2, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { VoiceRecorder } from "@/components/ui/voice-recorder";
import {
  AiConfirmationCard,
  type ExtractionField,
} from "@/components/ui/ai-confirmation-card";

const inputCls = (e?: boolean) => cn(
  "w-full rounded-md border bg-background px-3 py-2.5 text-sm min-h-[44px]",
  "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
  "disabled:cursor-not-allowed disabled:opacity-50",
  e ? "border-destructive" : "border-input"
);

export default function NewPropertyPage() {
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [showPrivate, setShowPrivate] = React.useState(false);
  const [voiceText, setVoiceText] = React.useState<string | null>(null);
  const [aiExtracting, setAiExtracting] = React.useState(false);
  const [confirmFields, setConfirmFields] = React.useState<ExtractionField[] | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const [extractionMeta, setExtractionMeta] = React.useState<{
    missingFields: string[];
    uncertainFields: Array<{ field: string; reason: string }>;
  } | null>(null);

  const handleVoiceTranscription = (text: string) => {
    setVoiceText(text);
  };

  const handleAiExtract = async () => {
    if (!voiceText) return;
    setAiExtracting(true);
    setError(null);
    try {
      const resp = await fetch("/api/ai/extract-property", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: voiceText, sourceType: "speech" }),
      });
      const result = await resp.json();
      if (!resp.ok) {
        setError(result.error?.message ?? "AI 提取失败");
        setAiExtracting(false);
        return;
      }
      const extraction = result.data?.extraction;
      if (extraction) {
        const { data: facts, missingFields, uncertainFields } = extraction;
        const uncertainKeys = new Set(
          (uncertainFields as Array<{ field: string; reason: string }>)?.map(
            (u) => u.field
          ) ?? []
        );
        const missingKeys = new Set(missingFields ?? []);

        // Build confirmation fields from extraction result
        const fieldDefs: Array<{ key: string; label: string; mapKey?: string }> = [
          { key: "title", label: "房源标题" },
          { key: "city", label: "城市" },
          { key: "district", label: "区域" },
          { key: "businessArea", label: "商圈" },
          { key: "communityName", label: "小区名称" },
          { key: "addressText", label: "大致地址" },
          { key: "rentalType", label: "租赁方式" },
          { key: "monthlyRent", label: "月租" },
          { key: "depositTerms", label: "押金方式" },
          { key: "bedrooms", label: "卧室数" },
          { key: "livingRooms", label: "客厅数" },
          { key: "bathrooms", label: "卫生间数" },
          { key: "areaSqm", label: "面积" },
          { key: "floor", label: "楼层" },
          { key: "availableFrom", label: "可入住时间" },
          { key: "hasElevator", label: "有电梯" },
          { key: "petsAllowed", label: "可养宠物" },
          { key: "cookingAllowed", label: "可做饭" },
          { key: "orientation", label: "朝向" },
          { key: "decoration", label: "装修" },
          { key: "subwayText", label: "地铁" },
        ];

        const fields: ExtractionField[] = fieldDefs.map((def) => {
          const val =
            (facts as Record<string, unknown>)[def.key];
          const isMissing = missingKeys.has(def.key) || (val === null || val === undefined || val === "");
          const isUncertain = uncertainKeys.has(def.key);

          return {
            key: def.key,
            label: def.label,
            value: val ?? "",
            confirmed: !isMissing && !isUncertain,
            modified: false,
            uncertain: isUncertain,
            uncertainReason: (uncertainFields as Array<{ field: string; reason: string }>)?.find(
              (u) => u.field === def.key
            )?.reason,
            missing: isMissing,
            source: "AI 提取",
            sensitive: false,
          };
        });

        // Mark known sensitive fields
        const sensitiveKeys = new Set([
          "ownerName", "ownerPhone", "exactAddress", "keyLocation",
        ]);
        for (const f of fields) {
          if (sensitiveKeys.has(f.key)) f.sensitive = true;
        }

        setConfirmFields(fields);
        setExtractionMeta({ missingFields: missingFields ?? [], uncertainFields: uncertainFields ?? [] });
      }
    } catch {
      setError("AI 提取失败，请检查网络后重试");
    } finally {
      setAiExtracting(false);
    }
  };

  const handleConfirmFields = (confirmedValues: Record<string, unknown>) => {
    setConfirming(true);
    const form = document.querySelector("form");
    if (!form) { setConfirming(false); return; }

    const keyToFormName: Record<string, string> = {
      title: "title", city: "city", district: "district",
      businessArea: "business_area", communityName: "community_name",
      addressText: "address_text", rentalType: "rental_type",
      monthlyRent: "monthly_rent", depositTerms: "deposit_terms",
      bedrooms: "bedrooms", livingRooms: "living_rooms",
      bathrooms: "bathrooms", areaSqm: "area_sqm",
      floor: "floor", availableFrom: "available_from",
      hasElevator: "has_elevator", petsAllowed: "pets_allowed",
      cookingAllowed: "cooking_allowed",
    };

    for (const [key, value] of Object.entries(confirmedValues)) {
      const formName = keyToFormName[key];
      if (!formName) continue;
      if (typeof value === "boolean") {
        const el = form.elements.namedItem(formName) as HTMLInputElement | null;
        if (el) el.checked = value;
      } else if (value !== null && value !== undefined && value !== "") {
        const el = form.elements.namedItem(formName) as HTMLInputElement | HTMLSelectElement | null;
        if (el) el.value = String(value);
      }
    }
    setConfirmFields(null);
    setVoiceText(null);
    setExtractionMeta(null);
    setConfirming(false);
  };

  const handleDismissExtraction = () => {
    setConfirmFields(null);
    setVoiceText(null);
    setExtractionMeta(null);
  };

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const data: Record<string, unknown> = {};
    fd.forEach((v, k) => { if (v !== "") data[k] = v; });
    for (const bk of ["has_elevator", "pets_allowed", "cooking_allowed"]) {
      data[bk] = fd.has(bk);
    }
    if (!data.rental_type) data.rental_type = "whole_unit";

    try {
      const resp = await fetch("/api/properties", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await resp.json();
      if (!resp.ok) { setError(result.error ?? "创建失败"); setLoading(false); return; }
      window.location.href = `/properties/${result.id}`;
    } catch { setError("创建失败，请检查网络后重试"); setLoading(false); }
  };

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/properties" className="inline-flex items-center justify-center rounded-md h-10 w-10 hover:bg-muted"><ArrowLeft className="h-5 w-5" /></Link>
        <div><h1 className="text-xl font-bold">录入房源</h1></div>
      </div>
      <form onSubmit={handleCreate} className="space-y-6">
        {/* Voice Input Section */}
        <section className="space-y-3 rounded-lg border p-4">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            语音录入（AI 智能提取）
          </h2>
          <p className="text-xs text-muted-foreground">
            口述房源信息，AI 将自动提取并填充到下方表单
          </p>
          <VoiceRecorder
            onTranscription={handleVoiceTranscription}
            purpose="property"
          />
          {confirmFields ? (
            <AiConfirmationCard
              fields={confirmFields}
              onConfirm={handleConfirmFields}
              onDismiss={handleDismissExtraction}
              confirming={confirming}
              statusMessage={
                extractionMeta?.uncertainFields.length
                  ? `AI 提取完成，${extractionMeta.uncertainFields.length} 个字段需确认`
                  : "AI 提取完成，请确认后填充表单"
              }
            />
          ) : voiceText ? (
            <div className="space-y-2">
              <div className="p-3 rounded bg-muted/50 text-sm whitespace-pre-wrap max-h-32 overflow-y-auto">
                {voiceText}
              </div>
              <button
                type="button"
                onClick={handleAiExtract}
                disabled={aiExtracting}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 min-h-[44px] disabled:opacity-50 transition-colors"
              >
                {aiExtracting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />AI 提取中...</>
                ) : (
                  <><Sparkles className="h-4 w-4" />AI 提取并填充表单</>
                )}
              </button>
            </div>
          ) : null}
        </section>

        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="font-semibold text-sm">基本信息</h2>
          <div className="space-y-1.5"><label className="text-sm font-medium">房源标题 *</label><input name="title" required className={inputCls()} placeholder="例如：阳光花园精装两居室" /></div>
          <div className="space-y-1.5"><label className="text-sm font-medium">城市 *</label><input name="city" required className={inputCls()} placeholder="例如：北京" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><label className="text-sm font-medium">区域</label><input name="district" className={inputCls()} placeholder="朝阳区" /></div>
            <div className="space-y-1.5"><label className="text-sm font-medium">商圈</label><input name="business_area" className={inputCls()} placeholder="三里屯" /></div>
          </div>
          <div className="space-y-1.5"><label className="text-sm font-medium">小区</label><input name="community_name" className={inputCls()} placeholder="阳光花园" /></div>
          <div className="space-y-1.5"><label className="text-sm font-medium">地址</label><input name="address_text" className={inputCls()} placeholder="大致地址" /></div>
          <div className="space-y-1.5"><label className="text-sm font-medium">租赁方式 *</label><select name="rental_type" defaultValue="whole_unit" className={inputCls()}><option value="whole_unit">整租</option><option value="shared">合租</option></select></div>
        </section>
        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="font-semibold text-sm">租金与规格</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><label className="text-sm font-medium">月租 (¥)</label><input name="monthly_rent" type="number" className={inputCls()} placeholder="3000" /></div>
            <div className="space-y-1.5"><label className="text-sm font-medium">押金方式</label><input name="deposit_terms" className={inputCls()} placeholder="押一付三" /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><label className="text-sm font-medium">卧室</label><input name="bedrooms" type="number" className={inputCls()} placeholder="2" /></div>
            <div className="space-y-1.5"><label className="text-sm font-medium">客厅</label><input name="living_rooms" type="number" className={inputCls()} placeholder="1" /></div>
            <div className="space-y-1.5"><label className="text-sm font-medium">卫浴</label><input name="bathrooms" type="number" className={inputCls()} placeholder="1" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><label className="text-sm font-medium">面积 (㎡)</label><input name="area_sqm" type="number" step="0.01" className={inputCls()} placeholder="80" /></div>
            <div className="space-y-1.5"><label className="text-sm font-medium">楼层</label><input name="floor" type="number" className={inputCls()} placeholder="5" /></div>
          </div>
          <div className="space-y-1.5"><label className="text-sm font-medium">可入住时间</label><input name="available_from" type="date" className={inputCls()} /></div>
        </section>
        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="font-semibold text-sm">设施</h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 min-h-[44px] cursor-pointer"><input type="checkbox" name="has_elevator" className="h-4 w-4" /><span className="text-sm">有电梯</span></label>
            <label className="flex items-center gap-2 min-h-[44px] cursor-pointer"><input type="checkbox" name="pets_allowed" className="h-4 w-4" /><span className="text-sm">可养宠物</span></label>
            <label className="flex items-center gap-2 min-h-[44px] cursor-pointer"><input type="checkbox" name="cooking_allowed" className="h-4 w-4" /><span className="text-sm">可做饭</span></label>
          </div>
        </section>
        <section className="rounded-lg border">
          <button type="button" onClick={() => setShowPrivate(!showPrivate)} className={cn("flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 min-h-[44px]", showPrivate ? "rounded-t-lg" : "rounded-lg")}>
            <span className="flex items-center gap-2"><Lock className="h-4 w-4 text-amber-500" />敏感信息（仅本门店可见）</span>
            {showPrivate ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showPrivate && (
            <div className="px-4 pb-4 space-y-4 border-t pt-4">
              <div className="space-y-1.5"><label className="text-sm font-medium">房东姓名</label><input name="owner_name" className={inputCls()} /></div>
              <div className="space-y-1.5"><label className="text-sm font-medium">房东电话</label><input name="owner_phone" type="tel" className={inputCls()} /></div>
              <div className="space-y-1.5"><label className="text-sm font-medium">精确地址</label><input name="exact_address" className={inputCls()} /></div>
              <div className="space-y-1.5"><label className="text-sm font-medium">钥匙位置</label><input name="key_location" className={inputCls()} /></div>
            </div>
          )}
        </section>
        {error && <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
        <button type="submit" disabled={loading} data-testid="property-create-submit" className="w-full inline-flex items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 min-h-[48px] disabled:opacity-50 transition-colors">
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" />创建中...</> : "创建房源"}
        </button>
      </form>
    </div>
  );
}
