import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SubmittingStateProps {
  message?: string;
  className?: string;
}

export function SubmittingState({
  message = "提交中...",
  className,
}: SubmittingStateProps) {
  return (
    <div
      role="status"
      aria-label={message}
      className={cn(
        "flex items-center justify-center gap-2 py-3",
        className
      )}
    >
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      <span className="text-sm text-muted-foreground">{message}</span>
    </div>
  );
}
