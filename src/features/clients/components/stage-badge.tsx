import * as React from "react";
import { cn } from "@/lib/utils";

const STAGE_LABELS: Record<string, string> = {
  new: "新客户",
  qualified: "已确认意向",
  properties_sent: "已推送房源",
  viewing_scheduled: "已约看",
  viewed: "已看房",
  considering: "考虑中",
  closed_won: "已成交",
  paused: "暂缓",
  lost: "已流失",
  deleted: "已删除",
};

const STAGE_COLORS: Record<string, string> = {
  new: "bg-blue-100 text-blue-700",
  qualified: "bg-indigo-100 text-indigo-700",
  properties_sent: "bg-purple-100 text-purple-700",
  viewing_scheduled: "bg-orange-100 text-orange-700",
  viewed: "bg-amber-100 text-amber-700",
  considering: "bg-teal-100 text-teal-700",
  closed_won: "bg-green-100 text-green-700",
  paused: "bg-gray-100 text-gray-500",
  lost: "bg-red-100 text-red-700",
  deleted: "bg-red-100 text-red-500",
};

interface StageBadgeProps {
  stage: string;
  as?: "span" | "option";
}

export function StageBadge({ stage }: StageBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        STAGE_COLORS[stage] ?? "bg-gray-100 text-gray-700"
      )}
    >
      {STAGE_LABELS[stage] ?? stage}
    </span>
  );
}

export { STAGE_LABELS, STAGE_COLORS };
