"use client";

import * as React from "react";
import {
  ArrowLeft,
  Loader2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { STAGE_LABELS } from "@/features/clients/components/stage-badge";
import {
  AiConfirmationCard,
  type ExtractionField,
} from "@/components/ui/ai-confirmation-card";
import {
  mapExtractionToFormValues,
  detectMissingRequiredFields,
  getRequiredFieldMessage,
  getAiMissingFieldMessage,
  coerceEditValue,
  CLIENT_EXTRACTION_FIELD_DEFS,
} from "@/features/clients/ai-extraction-mapper";

const inputCls = (e?: boolean) =>
  cn(
    "w-full rounded-md border bg-background px-3 py-2.5 text-sm min-h-[44px]",
    "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
    "disabled:cursor-not-allowed disabled:opacity-50",
    e ? "border-destructive" : "border-input"
  );

const sectionCls = "space-y-4 rounded-lg border p-4";
const sectionTitleCls = "font-semibold text-sm";

// ============================================================
// Error code → user-friendly message (never expose raw errors)
// ============================================================

function mapAiError(status: number, code?: string): string {
  if (status === 401) return "登录状态失效，请重新登录";
  if (status === 403) return "当前账号没有 AI 智能录入权限";
  if (status === 429) return "AI 使用额度已达到限制，请稍后再试";
  switch (code) {
    case "AI_NOT_CONFIGURED":
      return "AI 服务尚未配置";
    case "AI_TIMEOUT":
      return "AI 识别超时，请重试";
    case "AI_RATE_LIMITED":
      return "AI 服务繁忙，请稍后重试";
    case "AI_UPSTREAM_ERROR":
      return "AI 服务暂时不可用";
    case "AI_INVALID_RESPONSE":
      return "AI 返回内容无法解析";
    default:
      return "AI 识别失败，请稍后重试";
  }
}

// ============================================================
// Sensitive keys that must never appear in confirmation card
// ============================================================

const SENSITIVE_KEYS = new Set<string>(["phone", "wechat"]);

export default function NewClientPage() {
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [showBudget, setShowBudget] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>(
    {}
  );

  // AI text input
  const [aiText, setAiText] = React.useState("");
  const [aiExtracting, setAiExtracting] = React.useState(false);
  const [aiSuccess, setAiSuccess] = React.useState(false);
  const [aiHadName, setAiHadName] = React.useState(false);

  // AI confirmation
  const [confirmFields, setConfirmFields] = React.useState<
    ExtractionField[] | null
  >(null);
  const [confirming, setConfirming] = React.useState(false);
  const [extractionMeta, setExtractionMeta] = React.useState<{
    missingFields: string[];
    uncertainFields: Array<{ field: string; reason: string }>;
  } | null>(null);

  // Pending form values ref — used when budget section needs to expand first
  const pendingFormValuesRef = React.useRef<Record<string, unknown> | null>(
    null
  );

  // Guard against concurrent AI extraction — synchronous check that
  // prevents race conditions even before React re-renders the disabled prop
  const extractingRef = React.useRef(false);

  // Apply pending form values after budget section expands
  React.useEffect(() => {
    if (showBudget && pendingFormValuesRef.current) {
      applyValuesToForm(pendingFormValuesRef.current);
      pendingFormValuesRef.current = null;
    }
  }, [showBudget]);

  // ==========================================================
  // AI Extract
  // ==========================================================

  const handleAiExtract = async () => {
    // Synchronous guard — prevents concurrent calls even if
    // the disabled prop hasn't re-rendered yet
    if (extractingRef.current) return;

    const trimmed = aiText.trim();
    if (!trimmed) {
      setError("请输入客户描述文字");
      return;
    }
    if (trimmed.length > 5000) {
      setError("输入文字不能超过 5000 个字符");
      return;
    }

    extractingRef.current = true;
    setAiExtracting(true);
    setError(null);
    setAiSuccess(false);

    try {
      const resp = await fetch("/api/ai/extract-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed, sourcePlatform: "text" }),
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

        // Auto-expand budget section if AI returned budget fields,
        // then apply values after re-render (via useEffect)
        if (
          formValues["budget_min"] != null ||
          formValues["budget_max"] != null
        ) {
          pendingFormValuesRef.current = formValues;
          setShowBudget(true);
        } else {
          applyValuesToForm(formValues);
        }

        // Track if AI provided name (for later error messages)
        const hadName =
          typeof factsObj["name"] === "string" &&
          factsObj["name"].trim().length > 0;
        setAiHadName(hadName);

        // --- 2. Build confirmation fields for review ---
        const fields: ExtractionField[] = CLIENT_EXTRACTION_FIELD_DEFS.map(
          (def) => {
            const extractionVal = factsObj[def.extractionKey];
            const formVal = formValues[def.key];
            const val = extractionVal ?? formVal ?? "";
            const isMissing =
              missingKeys.has(def.extractionKey) ||
              (val === null || val === undefined || val === "");

            return {
              key: def.key,
              label: def.label,
              value: val,
              confirmed: !isMissing,
              modified: false,
              uncertain: uncertainKeys.has(def.extractionKey),
              uncertainReason: (
                uncertainFields as Array<{ field: string; reason: string }>
              )?.find((u) => u.field === def.extractionKey)?.reason,
              missing: isMissing,
              source: "AI 提取",
              sensitive: SENSITIVE_KEYS.has(def.key),
            };
          }
        );

        setConfirmFields(fields);
        setExtractionMeta({
          missingFields: missingFields ?? [],
          uncertainFields: uncertainFields ?? [],
        });
        setAiSuccess(true);
        // Clear any prior field errors
        setFieldErrors({});
      } else {
        // API returned 200 but no extraction data
        setError(
          "AI 未能识别到客户信息，请尝试更详细的描述或手动填写"
        );
      }
    } catch {
      setError("AI 识别失败，请检查网络后重试");
    } finally {
      extractingRef.current = false;
      setAiExtracting(false);
    }
  };

  // Handle Enter key in textarea: Ctrl/Cmd+Enter to submit
  const handleTextareaKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (!aiExtracting) handleAiExtract();
    }
  };

  // ==========================================================
  // Apply user modifications back to form
  // ==========================================================

  const handleApplyModifications = (
    _modifiedValues: Record<string, unknown>
  ) => {
    // In autoFilled mode, onFieldChange already syncs every edit to the
    // real form immediately during typing — no re-application needed here.
    // Just dismiss the card to confirm review is complete.
    setConfirming(true);
    // Brief delay so the user sees "应用中..." feedback
    setTimeout(() => {
      handleDismissExtraction();
      setConfirming(false);
    }, 300);
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
    const form = document.querySelector(
      'form[data-form="client-create"]'
    ) as HTMLFormElement | null;
    if (!form) return;

    for (const [formName, value] of Object.entries(values)) {
      if (typeof value === "boolean") {
        const el = form.elements.namedItem(
          formName
        ) as HTMLInputElement | null;
        if (el) el.checked = value;
      } else if (typeof value === "number") {
        const el = form.elements.namedItem(
          formName
        ) as HTMLInputElement | null;
        if (el) {
          el.value = String(value);
          // For number inputs, also set valueAsNumber if available
          if (el.type === "number") {
            (el as HTMLInputElement & { valueAsNumber: number }).valueAsNumber =
              value;
          }
        }
      } else if (value !== null && value !== undefined && value !== "") {
        const el = form.elements.namedItem(
          formName
        ) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
        if (el) el.value = String(value);
      }
    }
  };

  // ==========================================================
  // Create client (with pre-submit validation)
  // ==========================================================

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;

    // --- Collect form values ---
    const fd = new FormData(form);
    const data: Record<string, unknown> = {};
    fd.forEach((v, k) => {
      if (v !== "") data[k] = v;
    });
    for (const bk of ["pets_required", "cooking_required"]) {
      data[bk] = fd.has(bk);
    }

    // --- Validate required fields ---
    const missing = detectMissingRequiredFields(data);
    if (missing.length > 0) {
      const errors: Record<string, string> = {};
      for (const key of missing) {
        if (key === "name" && !aiHadName) {
          errors[key] =
            getAiMissingFieldMessage(key, false) ?? "客户姓名不能为空";
        } else {
          errors[key] = getRequiredFieldMessage(key) ?? `${key}不能为空`;
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
      const resp = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await resp.json();
      if (!resp.ok) {
        setError(result.error?.message ?? "创建失败");
        setLoading(false);
        return;
      }
      window.location.href = `/clients/${result.data?.id ?? result.id}`;
    } catch {
      setError("创建失败，请检查网络后重试");
      setLoading(false);
    }
  };

  // ==========================================================
  // Render
  // ==========================================================

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/clients"
          className="inline-flex items-center justify-center rounded-md h-11 w-11 hover:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold">新增客户</h1>
        </div>
      </div>

      <form
        onSubmit={handleCreate}
        data-form="client-create"
        noValidate
        className="space-y-6"
      >
        {/* Persist AI raw input text when user used AI extraction */}
        {aiSuccess && (
          <input type="hidden" name="raw_input_text" value={aiText} />
        )}

        {/* AI Smart Input Section */}
        <section className="space-y-3 rounded-lg border p-4">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI 智能录入
          </h2>
          <p className="text-xs text-muted-foreground">
            直接描述客户信息和找房需求，AI 会自动帮你填写表单
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
              placeholder="例如：张先生，想在南山科技园或后海租两房，预算8000以内，下个月入住，希望近地铁、有电梯……"
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
              <span
                className={cn(
                  "text-xs",
                  aiText.length > 4500
                    ? "text-destructive"
                    : "text-muted-foreground"
                )}
              >
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
                data-testid="client-ai-extract-btn"
                className="w-full inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 min-h-[44px] disabled:opacity-50 transition-colors"
              >
                {aiExtracting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    识别中…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    AI 智能识别
                  </>
                )}
              </button>
            </div>
          )}

          {/* Confirmation Card (review/inspect after auto-fill) */}
          {confirmFields && (
            <AiConfirmationCard
              fields={confirmFields}
              onConfirm={handleApplyModifications}
              onDismiss={handleDismissExtraction}
              onFieldChange={(key, value) => {
                // Immediately sync field edit to real form with type preservation
                const originalField = confirmFields.find(
                  (f) => f.key === key
                );
                const coercedValue = originalField
                  ? coerceEditValue(originalField.value, String(value))
                  : value;

                const fieldDef = CLIENT_EXTRACTION_FIELD_DEFS.find(
                  (d) => d.key === key
                );
                if (!fieldDef) return; // Unknown field — skip

                const formValues = mapExtractionToFormValues({
                  [fieldDef.extractionKey]: coercedValue,
                });
                applyValuesToForm(formValues);

                // Keep parent confirmFields in sync with card edits
                // to prevent stale data on re-render
                setConfirmFields((prev) =>
                  prev?.map((f) =>
                    f.key === key
                      ? { ...f, value: coercedValue, modified: true, confirmed: true }
                      : f
                  ) ?? null
                );
              }}
              confirming={confirming}
              autoFilled={true}
              statusMessage={
                extractionMeta?.uncertainFields.length
                  ? `AI 识别完成，${extractionMeta.uncertainFields.length} 个字段需关注，其余已自动填入表单`
                  : "AI 识别完成，结果已自动填入表单，请检查"
              }
            />
          )}

          {/* AI-specific error (shown near the AI section for visibility) */}
          {error && (
            <div
              role="alert"
              className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-start gap-2"
            >
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Success indicator (shown when card is dismissed but form is filled) */}
          {aiSuccess && !aiExtracting && !confirmFields && !error && (
            <p className="text-xs text-ai-confirmed-foreground flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              识别完成，结果已自动填入表单
            </p>
          )}
        </section>

        {/* Basic Info */}
        <section className={sectionCls}>
          <h2 className={sectionTitleCls}>基本信息</h2>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">姓名 *</label>
            <input
              name="name"
              required
              data-required="true"
              className={inputCls(!!fieldErrors["name"])}
              placeholder="例如：张先生"
            />
            {fieldErrors["name"] && (
              <p className="text-xs text-destructive">{fieldErrors["name"]}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">手机号</label>
              <input
                name="phone"
                type="tel"
                className={inputCls()}
                placeholder="13800138000"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">微信</label>
              <input
                name="wechat"
                className={inputCls()}
                placeholder="微信号"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">来源平台</label>
            <input
              name="source_platform"
              className={inputCls()}
              placeholder="例如：小红书、贝壳、朋友介绍"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">当前阶段</label>
            <select
              name="stage"
              defaultValue="new"
              className={inputCls()}
            >
              {Object.entries(STAGE_LABELS)
                .filter(([k]) => k !== "deleted")
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
            </select>
          </div>
        </section>

        {/* Preferences */}
        <section className={sectionCls}>
          <h2 className={sectionTitleCls}>找房偏好</h2>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">意向区域</label>
            <input
              name="preferred_districts"
              className={inputCls()}
              placeholder="逗号分隔，例如：朝阳区, 海淀区"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">意向小区</label>
            <input
              name="preferred_communities"
              className={inputCls()}
              placeholder="逗号分隔"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">户型需求</label>
              <input
                name="bedrooms"
                type="number"
                className={inputCls()}
                placeholder="例如：2"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">租赁方式</label>
              <select
                name="rental_type"
                defaultValue=""
                className={inputCls()}
              >
                <option value="">不限</option>
                <option value="whole_unit">整租</option>
                <option value="shared">合租</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">最早入住</label>
              <input
                name="available_from"
                type="date"
                className={inputCls()}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">最短租期(月)</label>
              <input
                name="minimum_lease_months"
                type="number"
                className={inputCls()}
                placeholder="例如：12"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">通勤目的地</label>
            <input
              name="commute_destination"
              className={inputCls()}
              placeholder="例如：国贸大厦"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 min-h-[44px] cursor-pointer">
              <input
                type="checkbox"
                name="pets_required"
                className="h-4 w-4"
              />
              <span className="text-sm">需要养宠物</span>
            </label>
            <label className="flex items-center gap-2 min-h-[44px] cursor-pointer">
              <input
                type="checkbox"
                name="cooking_required"
                className="h-4 w-4"
              />
              <span className="text-sm">需要做饭</span>
            </label>
          </div>
        </section>

        {/* Budget (collapsible) */}
        <section className="rounded-lg border">
          <button
            type="button"
            onClick={() => setShowBudget(!showBudget)}
            className={cn(
              "flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 min-h-[44px]",
              showBudget ? "rounded-t-lg" : "rounded-lg"
            )}
          >
            <span>预算与阶段信息</span>
            {showBudget ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          {showBudget && (
            <div className="px-4 pb-4 space-y-4 border-t pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">预算下限 (¥)</label>
                  <input
                    name="budget_min"
                    type="number"
                    className={inputCls()}
                    placeholder="例如：3000"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">预算上限 (¥)</label>
                  <input
                    name="budget_max"
                    type="number"
                    className={inputCls()}
                    placeholder="例如：5000"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">硬性要求</label>
                <textarea
                  name="hard_requirements"
                  className={cn(inputCls(), "min-h-[60px] resize-y")}
                  rows={2}
                  placeholder='JSON格式，例如：[{"key":"floor","value":"3楼以上"}]'
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">软性偏好</label>
                <textarea
                  name="soft_preferences"
                  className={cn(inputCls(), "min-h-[60px] resize-y")}
                  rows={2}
                  placeholder='JSON格式，例如：[{"key":"balcony","value":"最好有阳台"}]'
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">拒绝条件</label>
                <input
                  name="deal_breakers"
                  className={inputCls()}
                  placeholder="逗号分隔，例如：无电梯, 朝北"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">下次跟进日期</label>
                <input
                  name="next_follow_up_at"
                  type="date"
                  className={inputCls()}
                />
              </div>
            </div>
          )}
        </section>

        <button
          type="submit"
          disabled={loading}
          data-testid="client-create-submit"
          className="w-full inline-flex items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 min-h-[48px] disabled:opacity-50 transition-colors"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              创建中...
            </>
          ) : (
            "创建客户"
          )}
        </button>
      </form>
    </div>
  );
}
