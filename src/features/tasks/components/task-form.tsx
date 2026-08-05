"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { ResponsiveOverlay } from "@/components/ui/responsive-overlay";
import { cn } from "@/lib/utils";
import { TASK_TYPE_LABELS } from "@/features/tasks/schemas";

// --- Type Config ---

const TASK_TYPE_OPTIONS = Object.entries(TASK_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

// --- Form Data ---

export interface TaskFormData {
  taskType: string;
  title: string;
  description: string;
  propertyId: string;
  clientId: string;
  dueAt: string;
}

// --- Props ---

interface TaskFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: (TaskFormData & { id: string }) | null;
  onSuccess: () => void;
}

const EMPTY_FORM: TaskFormData = {
  taskType: "contact_client",
  title: "",
  description: "",
  propertyId: "",
  clientId: "",
  dueAt: "",
};

export function TaskForm({
  open,
  onOpenChange,
  initialData,
  onSuccess,
}: TaskFormProps) {
  const isEditing = (initialData && initialData.id != null) ?? false;
  const [form, setForm] = React.useState<TaskFormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [dirty, setDirty] = React.useState(false);

  // Reset form when opening
  React.useEffect(() => {
    if (open) {
      if (initialData) {
        setForm({
          taskType: initialData.taskType,
          title: initialData.title,
          description: initialData.description,
          propertyId: initialData.propertyId,
          clientId: initialData.clientId,
          dueAt: initialData.dueAt,
        });
      } else {
        setForm(EMPTY_FORM);
      }
      setServerError(null);
      setFieldErrors({});
      setDirty(false);
      setSubmitting(false);
    }
  }, [open, initialData]);

  // warn before closing with unsaved changes
  const handleOpenChange = (next: boolean) => {
    if (!next && dirty && !submitting) {
      const confirmed = window.confirm("你有未保存的内容，确定放弃吗？");
      if (!confirmed) return;
    }
    onOpenChange(next);
  };

  // field update
  const updateField = (field: keyof TaskFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setDirty(true);
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const { [field]: _removed, ...next } = prev;
        return next;
      });
    }
  };

  // validate
  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!form.taskType) {
      errors.taskType = "请选择任务类型";
    }
    if (!form.title.trim()) {
      errors.title = "任务标题不能为空";
    }
    if (form.title.trim().length > 200) {
      errors.title = "标题最多 200 字";
    }
    if (form.description.length > 500) {
      errors.description = "描述最多 500 字";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // submit
  const handleSubmit = async () => {
    if (!validate()) return;

    setSubmitting(true);
    setServerError(null);

    try {
      const body: Record<string, unknown> = {
        taskType: form.taskType,
        title: form.title.trim(),
      };

      if (form.description.trim()) body.description = form.description.trim();
      if (form.propertyId.trim()) body.propertyId = form.propertyId.trim();
      if (form.clientId.trim()) body.clientId = form.clientId.trim();
      if (form.dueAt.trim()) body.dueAt = new Date(form.dueAt).toISOString();

      if (isEditing && initialData) {
        const resp = await fetch(`/api/tasks/${initialData.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await resp.json();
        if (!resp.ok || json.error) {
          throw new Error(json.error?.message ?? "更新失败");
        }
      } else {
        const resp = await fetch("/api/tasks", {
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

  // render

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
      title={isEditing ? "编辑任务" : "新增任务"}
      footer={footer}
    >
      <div className="space-y-4">
        {/* Server error */}
        {serverError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
            {serverError}
          </div>
        )}

        {/* Task Type — Select */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            任务类型 <span className="text-destructive">*</span>
          </label>
          <select
            value={form.taskType}
            onChange={(e) => updateField("taskType", e.target.value)}
            className={cn(
              "w-full rounded-md border bg-background px-3 py-2.5 text-sm min-h-[44px]",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
              fieldErrors.taskType ? "border-destructive" : "border-input"
            )}
          >
            {TASK_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {fieldErrors.taskType && (
            <p className="text-xs text-destructive mt-1">{fieldErrors.taskType}</p>
          )}
        </div>

        {/* Title */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            任务标题 <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => updateField("title", e.target.value)}
            placeholder="输入任务标题"
            maxLength={200}
            className={cn(
              "w-full rounded-md border bg-background px-3 py-2.5 text-sm min-h-[44px]",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
              fieldErrors.title ? "border-destructive" : "border-input"
            )}
          />
          {fieldErrors.title && (
            <p className="text-xs text-destructive mt-1">{fieldErrors.title}</p>
          )}
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium mb-1.5">描述（可选）</label>
          <textarea
            value={form.description}
            onChange={(e) => updateField("description", e.target.value)}
            placeholder="简要描述任务详情..."
            rows={3}
            maxLength={500}
            className={cn(
              "w-full rounded-md border bg-background px-3 py-2.5 text-sm resize-y min-h-[80px]",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
              fieldErrors.description ? "border-destructive" : "border-input"
            )}
          />
          {fieldErrors.description && (
            <p className="text-xs text-destructive mt-1">{fieldErrors.description}</p>
          )}
        </div>

        {/* Due Date */}
        <div>
          <label className="block text-sm font-medium mb-1.5">截止时间（可选）</label>
          <input
            type="datetime-local"
            value={form.dueAt}
            onChange={(e) => updateField("dueAt", e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
          />
        </div>

        {/* Property ID */}
        <div>
          <label className="block text-sm font-medium mb-1.5">关联房源（可选）</label>
          <input
            type="text"
            value={form.propertyId}
            onChange={(e) => updateField("propertyId", e.target.value)}
            placeholder="房源 ID"
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
          />
        </div>

        {/* Client ID */}
        <div>
          <label className="block text-sm font-medium mb-1.5">关联客户（可选）</label>
          <input
            type="text"
            value={form.clientId}
            onChange={(e) => updateField("clientId", e.target.value)}
            placeholder="客户 ID"
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
          />
        </div>
      </div>
    </ResponsiveOverlay>
  );
}
