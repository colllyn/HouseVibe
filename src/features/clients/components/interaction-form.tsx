"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { ResponsiveOverlay } from "@/components/ui/responsive-overlay";
import { cn } from "@/lib/utils";

// --- Type Config (shared labels) ---

const INTERACTION_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "phone_call", label: "电话" },
  { value: "wechat_message", label: "微信" },
  { value: "in_person_meeting", label: "见面" },
  { value: "property_viewing", label: "带看" },
  { value: "follow_up", label: "跟进" },
  { value: "negotiation", label: "谈判" },
  { value: "contract_signing", label: "签约" },
  { value: "complaint", label: "投诉" },
  { value: "other", label: "其他" },
];

// --- Form Data ---

export interface InteractionFormData {
  interaction_type: string;
  occurred_at: string;
  summary: string;
  raw_text: string;
  next_action: string;
  property_id: string;
}

// --- Props ---

interface InteractionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  initialData: (InteractionFormData & { id: string }) | null;
  onSuccess: () => void;
}

const EMPTY_FORM: InteractionFormData = {
  interaction_type: "phone_call",
  occurred_at: new Date().toISOString().slice(0, 16),
  summary: "",
  raw_text: "",
  next_action: "",
  property_id: "",
};

export function InteractionForm({
  open,
  onOpenChange,
  clientId,
  initialData,
  onSuccess,
}: InteractionFormProps) {
  const isEditing = initialData !== null;
  const [form, setForm] = React.useState<InteractionFormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [dirty, setDirty] = React.useState(false);

  // Reset form when opening
  React.useEffect(() => {
    if (open) {
      if (initialData) {
        setForm({
          interaction_type: initialData.interaction_type,
          occurred_at: initialData.occurred_at,
          summary: initialData.summary,
          raw_text: initialData.raw_text,
          next_action: initialData.next_action,
          property_id: initialData.property_id,
        });
      } else {
        setForm({
          ...EMPTY_FORM,
          occurred_at: new Date().toISOString().slice(0, 16),
        });
      }
      setServerError(null);
      setFieldErrors({});
      setDirty(false);
      setSubmitting(false);
    }
  }, [open, initialData]);

  // --- warn before closing with unsaved changes ---
  const handleOpenChange = (next: boolean) => {
    if (!next && dirty && !submitting) {
      const confirmed = window.confirm("你有未保存的内容，确定放弃吗？");
      if (!confirmed) return;
    }
    onOpenChange(next);
  };

  // --- field update ---
  const updateField = (field: keyof InteractionFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setDirty(true);
    // Clear field error on change
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const { [field]: _removed, ...next } = prev;
        return next;
      });
    }
  };

  // --- validate ---
  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!form.interaction_type) {
      errors.interaction_type = "请选择沟通方式";
    }
    if (!form.occurred_at.trim()) {
      errors.occurred_at = "请选择发生时间";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // --- submit ---
  const handleSubmit = async () => {
    if (!validate()) return;

    setSubmitting(true);
    setServerError(null);

    try {
      const body: Record<string, unknown> = {
        interaction_type: form.interaction_type,
        occurred_at: form.occurred_at
          ? new Date(form.occurred_at).toISOString()
          : new Date().toISOString(),
      };

      // Include optional fields if not empty
      if (form.summary.trim()) body.summary = form.summary.trim();
      if (form.raw_text.trim()) body.raw_text = form.raw_text.trim();
      if (form.next_action.trim()) body.next_action = form.next_action.trim();
      if (form.property_id.trim()) body.property_id = form.property_id.trim();

      if (isEditing && initialData) {
        const resp = await fetch(
          `/api/clients/${clientId}/interactions/${initialData.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        );
        const json = await resp.json();
        if (!resp.ok || json.error) {
          throw new Error(json.error?.message ?? "更新失败");
        }
      } else {
        // POST — property_id should be null (not undefined) if empty per Zod schema
        if (!body.property_id) body.property_id = null;

        const resp = await fetch(`/api/clients/${clientId}/interactions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await resp.json();
        if (!resp.ok || json.error) {
          throw new Error(json.error?.message ?? "创建失败");
        }
      }

      onSuccess();
    } catch (e) {
      setServerError((e as Error).message);
    }
    setSubmitting(false);
  };

  // --- render ---

  const footer = (
    <div className="flex items-center gap-3 w-full">
      <button
        type="button"
        onClick={() => handleOpenChange(false)}
        disabled={submitting}
        className={cn(
          "flex-1 inline-flex items-center justify-center rounded-md px-4 py-2.5",
          "text-sm font-medium transition-colors",
          "min-h-[44px]",
          "border bg-background hover:bg-secondary",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        取消
      </button>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className={cn(
          "flex-1 inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5",
          "text-sm font-medium transition-colors",
          "min-h-[44px]",
          "bg-primary text-primary-foreground hover:bg-primary/90",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {isEditing ? "保存中..." : "创建中..."}
          </>
        ) : isEditing ? (
          "保存"
        ) : (
          "创建"
        )}
      </button>
    </div>
  );

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={handleOpenChange}
      title={isEditing ? "编辑沟通记录" : "新增沟通记录"}
      footer={footer}
    >
      <div className="space-y-4">
        {/* Server error */}
        {serverError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
            {serverError}
          </div>
        )}

        {/* Interaction Type — Select */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            沟通方式 <span className="text-destructive">*</span>
          </label>
          <select
            value={form.interaction_type}
            onChange={(e) => updateField("interaction_type", e.target.value)}
            className={cn(
              "w-full rounded-md border bg-background px-3 py-2.5 text-sm min-h-[44px]",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
              fieldErrors.interaction_type ? "border-destructive" : "border-input"
            )}
          >
            {INTERACTION_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {fieldErrors.interaction_type && (
            <p className="text-xs text-destructive mt-1">{fieldErrors.interaction_type}</p>
          )}
        </div>

        {/* Occurred At — datetime-local */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            发生时间 <span className="text-destructive">*</span>
          </label>
          <input
            type="datetime-local"
            value={form.occurred_at}
            onChange={(e) => updateField("occurred_at", e.target.value)}
            className={cn(
              "w-full rounded-md border bg-background px-3 py-2.5 text-sm min-h-[44px]",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
              fieldErrors.occurred_at ? "border-destructive" : "border-input"
            )}
          />
          {fieldErrors.occurred_at && (
            <p className="text-xs text-destructive mt-1">{fieldErrors.occurred_at}</p>
          )}
        </div>

        {/* Summary */}
        <div>
          <label className="block text-sm font-medium mb-1.5">摘要</label>
          <input
            type="text"
            value={form.summary}
            onChange={(e) => updateField("summary", e.target.value)}
            placeholder="简要描述沟通内容"
            maxLength={500}
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
          />
        </div>

        {/* Raw Text */}
        <div>
          <label className="block text-sm font-medium mb-1.5">详细记录</label>
          <textarea
            value={form.raw_text}
            onChange={(e) => updateField("raw_text", e.target.value)}
            placeholder="详细沟通内容..."
            rows={4}
            maxLength={10000}
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm resize-y min-h-[88px] focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
          />
        </div>

        {/* Next Action */}
        <div>
          <label className="block text-sm font-medium mb-1.5">后续行动</label>
          <input
            type="text"
            value={form.next_action}
            onChange={(e) => updateField("next_action", e.target.value)}
            placeholder="计划下一步做什么"
            maxLength={500}
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
          />
        </div>

        {/* Property ID */}
        <div>
          <label className="block text-sm font-medium mb-1.5">关联房源（可选）</label>
          <input
            type="text"
            value={form.property_id}
            onChange={(e) => updateField("property_id", e.target.value)}
            placeholder="房源 ID"
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
          />
        </div>
      </div>
    </ResponsiveOverlay>
  );
}
