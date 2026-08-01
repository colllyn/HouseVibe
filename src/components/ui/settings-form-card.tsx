import * as React from "react";
import { CheckCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SettingsFormCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  /** Error message to display at the top of the card */
  error?: string | null;
  /** Success message to display at the top of the card */
  successMessage?: string | null;
  /** Whether the card content is in a submit-saving state */
  isSubmitting?: boolean;
}

export function SettingsFormCard({
  title,
  description,
  children,
  footer,
  className,
  error,
  successMessage,
  isSubmitting,
}: SettingsFormCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card text-card-foreground",
        isSubmitting ? "pointer-events-none opacity-60" : "",
        className
      )}
    >
      {/* Status banners */}
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-t-lg border-b border-destructive/20 bg-destructive/5 px-5 py-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>{error}</p>
        </div>
      ) : null}

      {successMessage ? (
        <div
          role="status"
          className="flex items-start gap-3 rounded-t-lg border-b border-green-200 bg-green-50 px-5 py-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300"
        >
          <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>{successMessage}</p>
        </div>
      ) : null}

      {/* Header */}
      <div className="px-5 pt-5 pb-2">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>

      {/* Content */}
      <div className="px-5 py-3 space-y-4">{children}</div>

      {/* Footer */}
      {footer ? (
        <div className="flex items-center justify-end gap-3 rounded-b-lg border-t bg-muted/30 px-5 py-4">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
