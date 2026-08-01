"use client";

import * as React from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { ResponsiveOverlay } from "@/components/ui/responsive-overlay";
import { cn } from "@/lib/utils";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  isLoading?: boolean;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "确认",
  cancelLabel = "取消",
  variant = "default",
  isLoading = false,
  onConfirm,
}: ConfirmDialogProps) {
  const isDestructive = variant === "destructive";

  const footer = (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onOpenChange(false)}
        disabled={isLoading}
        className={cn(
          "inline-flex items-center justify-center rounded-md px-4 py-2.5",
          "text-sm font-medium transition-colors",
          "min-h-[44px] min-w-[44px]",
          "border bg-background hover:bg-secondary",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        {cancelLabel}
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={isLoading}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5",
          "text-sm font-medium transition-colors",
          "min-h-[44px] min-w-[44px]",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          isDestructive
            ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
            : "bg-primary text-primary-foreground hover:bg-primary/90"
        )}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isDestructive ? (
          <AlertTriangle className="h-4 w-4" />
        ) : null}
        {confirmLabel}
      </button>
    </div>
  );

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={footer}
    >
      {/* Extra padding for visual balance in destructive mode */}
      {isDestructive ? (
        <div className="flex items-center gap-3 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <p>此操作不可撤销，请谨慎操作。</p>
        </div>
      ) : null}
    </ResponsiveOverlay>
  );
}
