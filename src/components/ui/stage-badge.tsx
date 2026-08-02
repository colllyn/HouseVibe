import * as React from "react";
import { cn } from "@/lib/utils";

export const STAGE_LABELS: Record<string, string> = {
  new: "新客户",
  qualified: "已确认",
  properties_sent: "已推荐",
  viewing_scheduled: "已约看",
  viewed: "已看房",
  considering: "考虑中",
  closed_won: "已成交",
  paused: "暂停",
  lost: "已流失",
  deleted: "已删除",
};

export const STAGE_COLORS: Record<string, string> = {
  new: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  qualified: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  properties_sent: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  viewing_scheduled: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  viewed: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  considering: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  closed_won: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  paused: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
  lost: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  deleted: "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400",
};

export interface StageBadgeProps {
  stage: string;
  className?: string;
}

export function StageBadge({ stage, className }: StageBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        STAGE_COLORS[stage] ?? "bg-gray-100 text-gray-700",
        className
      )}
    >
      {STAGE_LABELS[stage] ?? stage}
    </span>
  );
}
