"use client";

import React from "react";
import { TrendingUp, Star, ThumbsUp, Minus, ThumbsDown, Loader2 } from "lucide-react";

interface MatchStatsProps {
  totalProperties: number;
  matchedCount: number;
  excellentCount: number;
  goodCount: number;
  fairCount: number;
  lowCount: number;
  loading?: boolean;
}

export function MatchStats({
  totalProperties,
  matchedCount,
  excellentCount,
  goodCount,
  fairCount,
  lowCount,
  loading,
}: MatchStatsProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" />
        <span className="text-sm">统计加载中…</span>
      </div>
    );
  }

  const levelStats = [
    { label: "极佳", count: excellentCount, icon: Star, color: "text-green-600 bg-green-50" },
    { label: "良好", count: goodCount, icon: ThumbsUp, color: "text-blue-600 bg-blue-50" },
    { label: "一般", count: fairCount, icon: Minus, color: "text-amber-600 bg-amber-50" },
    { label: "较低", count: lowCount, icon: ThumbsDown, color: "text-gray-500 bg-gray-100" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-3 py-3" role="region" aria-label="匹配统计">
      {/* Total */}
      <div className="flex items-center gap-1.5 rounded-lg border px-3 py-2">
        <TrendingUp className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">
          {matchedCount}/{totalProperties}
        </span>
        <span className="text-xs text-muted-foreground">匹配</span>
      </div>

      {/* Level breakdown */}
      {levelStats.map((ls) => (
        <div
          key={ls.label}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 ${ls.color}`}
        >
          <ls.icon className={`size-4 ${ls.color.split(" ")[0]}`} />
          <span className="text-sm font-medium">{ls.count}</span>
          <span className="text-xs">{ls.label}</span>
        </div>
      ))}
    </div>
  );
}
