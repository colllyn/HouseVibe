import * as React from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export interface RetryStateProps {
  onRetry: () => void;
  message?: string;
  className?: string;
}

export function RetryState({
  onRetry,
  message = "操作失败，请重试",
  className,
}: RetryStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-4 py-12 px-4 text-center",
        className
      )}
    >
      <p className="text-sm text-muted-foreground">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className={cn(
          "inline-flex items-center gap-2 rounded-md px-4 py-2",
          "text-sm font-medium",
          "bg-primary text-primary-foreground",
          "hover:bg-primary/90 transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          "min-h-[44px] min-w-[44px]"
        )}
      >
        <RefreshCw className="h-4 w-4" />
        重试
      </button>
    </div>
  );
}
