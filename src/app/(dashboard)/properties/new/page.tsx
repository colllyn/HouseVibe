"use client";

import * as React from "react";
import { ArrowLeft, Lock, Loader2, ChevronDown, ChevronUp, Sparkles, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  AiConfirmationCard,
  type ExtractionField,
} from "@/components/ui/ai-confirmation-card";
import {
  mapExtractionToFormValues,
  generateTitle,
  detectMissingRequiredFields,
  getRequiredFieldMessage,
  getAiMissingFieldMessage,
} from "@/features/properties/ai-extraction-mapper";

const inputCls = (e?: boolean) => cn(
  "w-full rounded-md border bg-background px-3 py-2.5 text-sm min-h-[44px]",
  "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
  "disabled:cursor-not-allowed disabled:opacity-50",
  e ? "border-destructive" : "border-input"
);

// ============================================================
// Error code → user-friendly message (never expose raw errors)
// ============================================================

function mapAiError(status: number, code?: string): string {
  if (status === 401) return "登录状态失效，请重新登录";
  if (status === 403) return "当前账号没有 AI 智能录入权限";
  if (status === 429) return "AI 使用额度已达到限制，请稍后再试";
  switch (code) {
    case "AI_NOT_CONFIGURED": return "AI 服务尚未配置";
    case "AI_TIMEOUT": return "AI 识别超时，请重试";
    case "AI_RATE_LIMITED": return "AI 服务繁忙，请稍后重试";
    case "AI_UPSTREAM_ERROR": return "AI 服务暂时不可用";
    case "AI_INVALID_RESPONSE": return "AI 返回内容无法解析";
    default: return "AI 识别失败，请稍后重试";
  }
}

// ============================================================
// Field definitions for AI extraction → confirmation card
// ============================================================

interface FieldDef {
  key: string;
  label: string;
}

const EXTRACTION_FIELD_DEFS: FieldDef[] = [
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
];

const SENSITIVE_KEYS = new Set([
  "ownerName", "ownerPhone", "exactAddress", "keyLocation",
]);

export default function NewPropertyPage() {
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [showPrivate, setShowPrivate] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  // AI text input
  const [aiText, setAiText] = React.useState("");
  const [aiExtracting, setAiExtracting] = React.useState(false);
  const [aiSuccess, setAiSuccess] = React.useState(false);
  const [aiHadCity, setAiHadCity] = React.useState(false);

  // AI confirmation
  const [confirmFields, setConfirmFields] = React.useState<ExtractionField[] | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const [extractionMeta, setExtractionMeta] = React.useState<{
    missingFields: string[];
    uncertainFields: Array<{ field: string; reason: string }>;
  } | null>(null);

  // ==========================================================
  // AI Extract
  // ==========================================================

  const handleAiExtract = async () => {
    const trimmed = aiText.trim();
    if (!trimmed) {
      setError("请输入房源描述文字");
      return;
    }
    if (trimmed.length > 5000) {
      setError("输入文字不能超过 5000 个字符");
      return;
    }

    setAiExtracting(true);
    setError(null);
    setAiSuccess(false);

    try {
      const resp = await fetch("/api/ai/extract-property", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed, sourceType: "text" }),
      });
      const result = await resp.json();

      if (!resp.ok) {
        setError(mapAiError(resp.status, result.error?.code));
        setAiExtracting(false);
        return;
      }

      const extraction = result.data?.extraction;
      if (extraction) {
        const { data: facts, missingFields, uncertainFields } = extraction;
        const factsObj = facts as Record<string, unknown>;
        const uncertainKeys = new Set(
          (uncertainFields as Array<{ field: string; reason: string }>)?.map(
            (u) => u.field
          ) ?? []
        );
        const missingKeys = new Set<string>(missingFields ?? []);

        // --- 1. Auto-fill form immediately (don't wait for confirm) ---
        const formValues = mapExtractionToFormValues(factsObj);

        // Generate deterministic title if AI didn't provide one
        if (!formValues["title"]) {
          const generatedTitle = generateTitle(factsObj);
          if (generatedTitle) {
            formValues["title"] = generatedTitle;
          }
        }

        applyValuesToForm(formValues);

        // Track if AI provided city (for later error messages)
        const hadCity = typeof factsObj["city"] === "string" && factsObj["city"].trim().length > 0;
        setAiHadCity(hadCity);

        // --- 2. Build confirmation fields for review ---
        const fields: ExtractionField[] = EXTRACTION_FIELD_DEFS.map((def) => {
          const val = factsObj[def.key];
          const isMissing = missingKeys.has(def.key) || (val === null || val === undefined || val === "");

          // For title: if we generated one, show it as modified
          const isTitleGenerated = def.key === "title" && !factsObj["title"] && formValues["title"];

          return {
            key: def.key,
            label: def.label,
            value: isTitleGenerated ? formValues["title"] : (val ?? ""),
            confirmed: !isMissing || !!isTitleGenerated,
            modified: !!isTitleGenerated,
            uncertain: uncertainKeys.has(def.key) && !isTitleGenerated,
            uncertainReason: (uncertainFields as Array<{ field: string; reason: string }>)?.find(
              (u) => u.field === def.key
            )?.reason,
            missing: isMissing && !isTitleGenerated,
            source: isTitleGenerated ? "自动生成" : "AI 提取",
            sensitive: SENSITIVE_KEYS.has(def.key),
          };
        });

        setConfirmFields(fields);
        setExtractionMeta({
          missingFields: missingFields ?? [],
          uncertainFields: uncertainFields ?? [],
        });
        setAiSuccess(true);
        // Clear any prior field errors
        setFieldErrors({});
      }
    } catch {
      setError("AI 识别失败，请检查网络后重试");
    } finally {
      setAiExtracting(false);
    }
  };

  // Handle Enter key in textarea: Ctrl/Cmd+Enter to submit
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (!aiExtracting) handleAiExtract();
    }
  };

  // ==========================================================
  // Apply user modifications back to form
  // ==========================================================

  const handleApplyModifications = (modifiedValues: Record<string, unknown>) => {
    setConfirming(true);
    // Re-map modified values through the same explicit mapper
    const formValues = mapExtractionToFormValues(modifiedValues);
    applyValuesToForm(formValues);
    setConfirming(false);
    setFieldErrors({});
  };

  const handleDismissExtraction = () => {
    setConfirmFields(null);
    setExtractionMeta(null);
    setAiSuccess(false);
  };

  // ==========================================================
  // Apply form values to DOM (shared by auto-fill and modifications)
  // ==========================================================

  const applyValuesToForm = (values: Record<string, unknown>) => {
    const form = document.querySelector('form[data-form="property-create"]') as HTMLFormElement | null;
    if (!form) return;

    for (const [formName, value] of Object.entries(values)) {
      if (typeof value === "boolean") {
        const el = form.elements.namedItem(formName) as HTMLInputElement | null;
        if (el) el.checked = value;
      } else if (value !== null && value !== undefined && value !== "") {
        const el = form.elements.namedItem(formName) as HTMLInputElement | HTMLSelectElement | null;
        if (el) el.value = String(value);
      }
    }
  };

  // ==========================================================
  // Read current form values (for validation before submit)
  // ==========================================================

  // ==========================================================
  // Create property (with pre-submit validation)
  // ==========================================================

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;

    // --- Collect form values ---
    const fd = new FormData(form);
    const data: Record<string, unknown> = {};
    fd.forEach((v, k) => { if (v !== "") data[k] = v; });
    for (const bk of ["has_elevator", "pets_allowed", "cooking_allowed"]) {
      data[bk] = fd.has(bk);
    }
    if (!data.rental_type) data.rental_type = "whole_unit";

    // --- Validate required fields ---
    const missing = detectMissingRequiredFields(data);
    if (missing.length > 0) {
      const errors: Record<string, string> = {};
      for (const key of missing) {
        // Use AI-specific message for city when AI didn't provide it
        if (key === "city" && !aiHadCity) {
          errors[key] = getAiMissingFieldMessage(key, false) ?? "请输入城市";
        } else {
          errors[key] = getRequiredFieldMessage(key) ?? `请输入${key}`;
        }
      }
      setFieldErrors(errors);
      setError(null);

      // Auto-scroll to first missing required field
      const firstKey = missing[0];
      if (firstKey) {
        const firstEl = form.elements.namedItem(firstKey) as HTMLElement | null;
        if (firstEl) {
          firstEl.scrollIntoView({ behavior: "smooth", block: "center" });
          firstEl.focus();
        }
      }
      return;
    }

    setFieldErrors({});
    setLoading(true);
    setError(null);

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

  // ==========================================================
  // Render
  // ==========================================================

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/properties" className="inline-flex items-center justify-center rounded-md h-11 w-11 hover:bg-muted"><ArrowLeft className="h-5 w-5" /></Link>
        <div><h1 className="text-xl font-bold">录入房源</h1></div>
      </div>
      <form onSubmit={handleCreate} data-form="property-create" noValidate className="space-y-6">
        {/* AI Smart Input Section */}
        <section className="space-y-3 rounded-lg border p-4">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI 智能录入
          </h2>
          <p className="text-xs text-muted-foreground">
            直接描述房源信息，AI 会自动帮你填写表单
          </p>

          {/* Textarea */}
          <div className="space-y-2">
            <textarea
              value={aiText}
              onChange={(e) => {
                setAiText(e.target.value);
                if (aiSuccess) setAiSuccess(false);
              }}
              onKeyDown={handleTextareaKeyDown}
              placeholder="例如：万科城二期，3室2厅89平，朝南，月租6500元，精装修，有电梯，随时入住……"
              rows={4}
              maxLength={5000}
              disabled={aiExtracting}
              className={cn(
                "w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm min-h-[100px] resize-y",
                "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
                "disabled:cursor-not-allowed disabled:opacity-50"
              )}
            />
            <div className="flex items-center justify-between">
              <span className={cn(
                "text-xs",
                aiText.length > 4500 ? "text-destructive" : "text-muted-foreground"
              )}>
                {aiText.length}/5000
              </span>
              <span className="text-xs text-muted-foreground">
                Ctrl+Enter 快速识别
              </span>
            </div>
          </div>

          {/* AI Extract button */}
          {!confirmFields && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleAiExtract}
                disabled={aiExtracting || aiText.trim().length === 0}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 min-h-[44px] disabled:opacity-50 transition-colors"
              >
                {aiExtracting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />识别中…</>
                ) : (
                  <><Sparkles className="h-4 w-4" />AI 智能识别</>
                )}
              </button>
              {aiSuccess && !aiExtracting && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />识别完成，结果已自动填入表单
                </p>
              )}
            </div>
          )}

          {/* Confirmation Card (review/inspect after auto-fill) */}
          {confirmFields && (
            <AiConfirmationCard
              fields={confirmFields}
              onConfirm={handleApplyModifications}
              onDismiss={handleDismissExtraction}
              onFieldChange={(key, value) => {
                // Immediately sync field edit to real form
                const formValues = mapExtractionToFormValues({ [key]: value });
                applyValuesToForm(formValues);
              }}
              confirming={confirming}
              autoFilled={true}
              statusMessage={
                extractionMeta?.uncertainFields.length
                  ? `AI 识别完成，${extractionMeta.uncertainFields.length} 个字段需关注，其余已自动填入表单`
                  : "AI 识别完成，结果已自动填入表单"
              }
            />
          )}
        </section>

        {/* Basic Info */}
        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="font-semibold text-sm">基本信息</h2>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">房源标题 *</label>
            <input name="title" required data-required="true" className={inputCls(!!fieldErrors["title"])} placeholder="例如：阳光花园精装两居室" />
            {fieldErrors["title"] && (
              <p className="text-xs text-destructive">{fieldErrors["title"]}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">城市 *</label>
            <input name="city" required data-required="true" className={inputCls(!!fieldErrors["city"])} placeholder="例如：北京" />
            {fieldErrors["city"] && (
              <p className="text-xs text-destructive">{fieldErrors["city"]}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><label className="text-sm font-medium">区域</label><input name="district" className={inputCls()} placeholder="朝阳区" /></div>
            <div className="space-y-1.5"><label className="text-sm font-medium">商圈</label><input name="business_area" className={inputCls()} placeholder="三里屯" /></div>
          </div>
          <div className="space-y-1.5"><label className="text-sm font-medium">小区</label><input name="community_name" className={inputCls()} placeholder="阳光花园" /></div>
          <div className="space-y-1.5"><label className="text-sm font-medium">地址</label><input name="address_text" className={inputCls()} placeholder="大致地址" /></div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">租赁方式 *</label>
            <select name="rental_type" defaultValue="whole_unit" data-required="true" className={inputCls(!!fieldErrors["rental_type"])}>
              <option value="whole_unit">整租</option><option value="shared">合租</option>
            </select>
            {fieldErrors["rental_type"] && (
              <p className="text-xs text-destructive">{fieldErrors["rental_type"]}</p>
            )}
          </div>
        </section>

        {/* Rent & Specs */}
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

        {/* Facilities */}
        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="font-semibold text-sm">设施</h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 min-h-[44px] cursor-pointer"><input type="checkbox" name="has_elevator" className="h-4 w-4" /><span className="text-sm">有电梯</span></label>
            <label className="flex items-center gap-2 min-h-[44px] cursor-pointer"><input type="checkbox" name="pets_allowed" className="h-4 w-4" /><span className="text-sm">可养宠物</span></label>
            <label className="flex items-center gap-2 min-h-[44px] cursor-pointer"><input type="checkbox" name="cooking_allowed" className="h-4 w-4" /><span className="text-sm">可做饭</span></label>
          </div>
        </section>

        {/* Sensitive Info */}
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

        {error && (
          <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        <button type="submit" disabled={loading} data-testid="property-create-submit" className="w-full inline-flex items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 min-h-[48px] disabled:opacity-50 transition-colors">
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" />创建中...</> : "创建房源"}
        </button>
      </form>
    </div>
  );
}
