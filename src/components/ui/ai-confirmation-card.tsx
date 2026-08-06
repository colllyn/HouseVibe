"use client";

import * as React from "react";
import {
  Check,
  X,
  Pencil,
  Lock,
  AlertTriangle,
  HelpCircle,
  EyeOff,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// Types
// ============================================================

export interface ExtractionField {
  /** Field name (key in the data object) */
  key: string;
  /** Display label (Chinese) */
  label: string;
  /** Extracted value (from AI) */
  value: unknown;
  /** Whether the value is confirmed by user */
  confirmed: boolean;
  /** Whether the value was modified by user from the original AI output */
  modified: boolean;
  /** Whether the AI was uncertain about this field */
  uncertain?: boolean;
  /** Reason for uncertainty */
  uncertainReason?: string;
  /** Whether this field has a visual fact conflict */
  visualConflict?: boolean;
  /** Visual conflict description */
  visualConflictNote?: string;
  /** Whether this is a sensitive/private field */
  sensitive?: boolean;
  /** Whether this field is missing (AI couldn't extract) */
  missing?: boolean;
  /** Whether this field has a high-risk fact error */
  factError?: boolean;
  /** Fact error description */
  factErrorNote?: string;
  /** Evidence source for this field (e.g. "AI extraction", "manual") */
  source?: string;
  /** Whether this field is currently being edited */
  editing?: boolean;
}

export interface AiConfirmationCardProps {
  /** Extracted fields to display */
  fields: ExtractionField[];
  /** Callback when user confirms all fields */
  onConfirm: (confirmedValues: Record<string, unknown>) => void;
  /** Callback when user modifies a field */
  onFieldChange?: (key: string, value: unknown) => void;
  /** Callback to ignore/dismiss the AI result */
  onDismiss?: () => void;
  /** Overall extraction status message */
  statusMessage?: string;
  /** Zod validation errors (key → message) */
  validationErrors?: Record<string, string>;
  /** Whether confirmation is in progress */
  confirming?: boolean;
  /** Custom class */
  className?: string;
}

// ============================================================
// Helpers
// ============================================================

function fieldStatusBadge(field: ExtractionField) {
  if (field.factError) {
    return {
      icon: AlertTriangle,
      label: "事实存疑",
      color:
        "bg-destructive/10 text-destructive border-destructive/30",
    };
  }
  if (field.visualConflict) {
    return {
      icon: AlertTriangle,
      label: "视觉冲突",
      color:
        "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/20 dark:text-orange-300",
    };
  }
  if (field.uncertain) {
    return {
      icon: HelpCircle,
      label: "不确定",
      color:
        "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/20 dark:text-amber-300",
    };
  }
  if (field.modified) {
    return {
      icon: Pencil,
      label: "已修改",
      color:
        "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/20 dark:text-blue-300",
    };
  }
  if (field.confirmed) {
    return {
      icon: Check,
      label: "已确认",
      color:
        "bg-green-100 text-green-800 border-green-300 dark:bg-green-950/20 dark:text-green-300",
    };
  }
  return null;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (Array.isArray(value)) return value.join("、");
  return String(value);
}

// ============================================================
// Component
// ============================================================

export function AiConfirmationCard({
  fields,
  onConfirm,
  onFieldChange,
  onDismiss,
  statusMessage,
  validationErrors,
  confirming = false,
  className,
}: AiConfirmationCardProps) {
  const [editingKey, setEditingKey] = React.useState<string | null>(null);
  const [editValue, setEditValue] = React.useState("");
  const [localFields, setLocalFields] = React.useState(fields);
  const [showMissing, setShowMissing] = React.useState(false);

  // Sync external field changes
  React.useEffect(() => {
    setLocalFields(fields);
  }, [fields]);

  const confirmedCount = localFields.filter((f) => f.confirmed && !f.missing).length;
  const totalCount = localFields.filter((f) => !f.missing).length;
  const hasIssues = localFields.some(
    (f) => f.factError || f.visualConflict || f.uncertain
  );

  function startEdit(field: ExtractionField) {
    setEditingKey(field.key);
    setEditValue(formatValue(field.value));
  }

  function saveEdit() {
    if (editingKey) {
      setLocalFields((prev) =>
        prev.map((f) =>
          f.key === editingKey
            ? { ...f, value: editValue, modified: true, confirmed: true, editing: false }
            : f
        )
      );
      onFieldChange?.(editingKey, editValue);
    }
    setEditingKey(null);
  }

  function cancelEdit() {
    setEditingKey(null);
  }

  function toggleConfirm(field: ExtractionField) {
    if (field.missing) return;
    setLocalFields((prev) =>
      prev.map((f) =>
        f.key === field.key ? { ...f, confirmed: !f.confirmed } : f
      )
    );
  }

  function handleConfirm() {
    const values: Record<string, unknown> = {};
    for (const f of localFields) {
      if (!f.missing && f.confirmed) {
        values[f.key] = f.value;
      }
    }
    onConfirm(values);
  }

  const allConfirmed = localFields
    .filter((f) => !f.missing)
    .every((f) => f.confirmed);

  const visibleFields = localFields.filter((f) => !f.missing);
  const missingFields = localFields.filter((f) => f.missing);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-sm">AI 提取结果确认</h3>
        </div>
        <span className="text-xs text-muted-foreground">
          {confirmedCount}/{totalCount} 已确认
        </span>
      </div>

      {/* Status message */}
      {statusMessage && (
        <div
          className={cn(
            "rounded-md px-3 py-2 text-xs",
            hasIssues
              ? "bg-amber-50 text-amber-800 dark:bg-amber-950/20 dark:text-amber-300"
              : "bg-green-50 text-green-800 dark:bg-green-950/20 dark:text-green-300"
          )}
        >
          {statusMessage}
        </div>
      )}

      {/* Field cards */}
      <div className="space-y-2">
        {visibleFields.map((field) => {
          const badge = fieldStatusBadge(field);
          const error = validationErrors?.[field.key];

          return (
            <div
              key={field.key}
              className={cn(
                "rounded-lg border p-3 transition-colors",
                field.factError && "border-destructive/50 bg-destructive/5",
                field.visualConflict && "border-orange-300 bg-orange-50/50 dark:border-orange-800 dark:bg-orange-950/10",
                field.uncertain && "border-amber-300 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/10",
                field.confirmed && !field.uncertain && !field.visualConflict && !field.factError && "border-green-300 bg-green-50/30 dark:border-green-800 dark:bg-green-950/10"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  {/* Field label row */}
                  <div className="flex items-center gap-1.5 mb-1">
                    {field.sensitive && (
                      <Lock className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                    )}
                    <span className="text-xs font-medium text-muted-foreground">
                      {field.label}
                    </span>
                    {badge && (
                      <span
                        className={cn(
                          "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                          badge.color
                        )}
                      >
                        <badge.icon className="h-3 w-3" />
                        {badge.label}
                      </span>
                    )}
                    {field.source && (
                      <span className="text-[10px] text-muted-foreground/60">
                        · {field.source}
                      </span>
                    )}
                  </div>

                  {/* Value */}
                  {editingKey === field.key ? (
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className={cn(
                          "flex-1 rounded border bg-background px-2 py-1 text-sm min-h-[36px]",
                          "focus:outline-none focus:ring-2 focus:ring-ring",
                          "border-input"
                        )}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit();
                          if (e.key === "Escape") cancelEdit();
                        }}
                      />
                      <button
                        type="button"
                        onClick={saveEdit}
                        className="h-9 w-9 rounded-md bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="h-9 w-9 rounded-md border flex items-center justify-center hover:bg-muted"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "text-sm",
                          field.missing
                            ? "text-muted-foreground/50 italic"
                            : "text-foreground"
                        )}
                      >
                        {formatValue(field.value) || (
                          <span className="text-muted-foreground/40 italic">
                            未填写
                          </span>
                        )}
                      </span>
                      {!field.sensitive && (
                        <button
                          type="button"
                          onClick={() => startEdit(field)}
                          className="h-6 w-6 rounded hover:bg-muted flex items-center justify-center flex-shrink-0"
                          aria-label={`编辑 ${field.label}`}
                        >
                          <Pencil className="h-3 w-3 text-muted-foreground" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Context notes */}
                  {field.uncertainReason && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      💡 {field.uncertainReason}
                    </p>
                  )}
                  {field.visualConflictNote && (
                    <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                      ⚠ {field.visualConflictNote}
                    </p>
                  )}
                  {field.factErrorNote && (
                    <p className="text-xs text-destructive mt-1">
                      🚫 {field.factErrorNote}
                    </p>
                  )}

                  {/* Validation error */}
                  {error && (
                    <p className="text-xs text-destructive mt-1">{error}</p>
                  )}
                </div>

                {/* Confirm/ignore toggle */}
                {!field.missing && (
                  <button
                    type="button"
                    onClick={() => toggleConfirm(field)}
                    className={cn(
                      "flex-shrink-0 h-8 w-8 rounded-full border-2 flex items-center justify-center transition-colors",
                      field.confirmed
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-muted-foreground/30 hover:border-primary/50"
                    )}
                    aria-label={
                      field.confirmed ? `取消确认 ${field.label}` : `确认 ${field.label}`
                    }
                  >
                    {field.confirmed ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Missing fields section */}
      {missingFields.length > 0 && (
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => setShowMissing(!showMissing)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground min-h-[44px]"
          >
            {showMissing ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            <EyeOff className="h-3.5 w-3.5" />
            未识别字段（{missingFields.length}）
          </button>
          {showMissing && (
            <div className="space-y-1 pl-6">
              {missingFields.map((field) => (
                <div
                  key={field.key}
                  className="flex items-center gap-2 text-xs text-muted-foreground/60 py-1"
                >
                  <EyeOff className="h-3 w-3 flex-shrink-0" />
                  <span>{field.label}</span>
                  {field.missing && (
                    <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                      未提取到
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className={cn(
              "flex-1 rounded-md border px-4 py-2.5 text-sm font-medium",
              "min-h-[44px] hover:bg-muted transition-colors"
            )}
          >
            忽略，手动填写
          </button>
        )}
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!allConfirmed || confirming}
          className={cn(
            "flex-[2] rounded-md px-4 py-2.5 text-sm font-medium",
            "min-h-[44px] transition-colors",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {confirming ? "提交中..." : `确认并填充（${confirmedCount}/${totalCount}）`}
        </button>
      </div>
    </div>
  );
}
