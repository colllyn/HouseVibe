"use client";

import React, { useState } from "react";
import {
  Star,
  ThumbsUp,
  Minus,
  ThumbsDown,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Building2,
  User,
  Loader2,
} from "lucide-react";
// Use inline badge styling per mobile-ui conventions

interface MatchReason {
  code: string;
  label: string;
  scoreContribution: number;
  detail: string;
}

interface UnmatchedReason {
  code: string;
  label: string;
  detail: string;
}

interface NeedsConfirmationItem {
  code: string;
  label: string;
  detail: string;
}

interface MatchCardProps {
  match: {
    id: string;
    propertyId?: string;
    propertyTitle?: string;
    propertyDistrict?: string | null;
    propertyCommunity?: string | null;
    clientId?: string;
    clientName?: string;
    score: number;
    matchLevel: "excellent" | "good" | "fair" | "low";
    matchedReasons?: MatchReason[];
    unmatchedReasons?: UnmatchedReason[];
    needsConfirmation?: NeedsConfirmationItem[];
    nextAction?: string;
    status: "active" | "dismissed" | "archived";
    createdAt?: string;
    updatedAt?: string;
  };
  view: "client" | "property";
  onDismiss?: (matchId: string) => void;
  onArchive?: (matchId: string) => void;
  onRecalculate?: () => void;
  disabled?: boolean;
}

const LEVEL_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; color: string; iconColor: string }> = {
  excellent: { icon: Star, label: "极佳", color: "bg-green-100 text-green-800 border-green-200", iconColor: "text-green-600" },
  good: { icon: ThumbsUp, label: "良好", color: "bg-blue-100 text-blue-800 border-blue-200", iconColor: "text-blue-600" },
  fair: { icon: Minus, label: "一般", color: "bg-amber-100 text-amber-800 border-amber-200", iconColor: "text-amber-600" },
  low: { icon: ThumbsDown, label: "较低", color: "bg-gray-100 text-gray-600 border-gray-200", iconColor: "text-gray-500" },
};

const LEVEL_FALLBACK = { icon: Minus, label: "未知", color: "bg-gray-100 text-gray-500 border-gray-200", iconColor: "text-gray-400" };

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active: { label: "有效", color: "bg-green-100 text-green-700" },
  dismissed: { label: "已关闭", color: "bg-yellow-100 text-yellow-700" },
  archived: { label: "已归档", color: "bg-gray-100 text-gray-500" },
};

const STATUS_FALLBACK = { label: "未知", color: "bg-gray-100 text-gray-500" };

export function MatchCard({
  match,
  view,
  onDismiss,
  onArchive,
  disabled,
}: MatchCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const levelConfig = LEVEL_CONFIG[match.matchLevel] ?? LEVEL_FALLBACK;
  const LevelIcon = levelConfig.icon;
  const statusConfig = STATUS_CONFIG[match.status] ?? STATUS_FALLBACK;

  const handleAction = async (action: "dismiss" | "archive") => {
    setActionLoading(action);
    try {
      if (action === "dismiss") onDismiss?.(match.id);
      if (action === "archive") onArchive?.(match.id);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div
      className="rounded-lg border bg-card p-4 shadow-sm"
      role="article"
      aria-label={`匹配 - ${levelConfig.label}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {/* Entity name */}
          {view === "client" && (
            <div className="flex items-center gap-1.5">
              <Building2 className="size-4 shrink-0 text-muted-foreground" />
              <span className="font-medium truncate">{match.propertyTitle ?? "未知房源"}</span>
            </div>
          )}
          {view === "property" && (
            <div className="flex items-center gap-1.5">
              <User className="size-4 shrink-0 text-muted-foreground" />
              <span className="font-medium truncate">{match.clientName ?? "未知客户"}</span>
            </div>
          )}

          {/* Sub info */}
          {view === "client" && (match.propertyDistrict || match.propertyCommunity) && (
            <p className="mt-0.5 text-xs text-muted-foreground truncate">
              {[match.propertyDistrict, match.propertyCommunity].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>

        {/* Score */}
        <div className="flex shrink-0 items-center gap-2">
          {match.status !== "active" && (
            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${statusConfig.color}`}>
              {statusConfig.label}
            </span>
          )}
          <div className="text-right">
            <span className="text-2xl font-bold tabular-nums">{match.score}</span>
            <span className="text-xs text-muted-foreground">分</span>
          </div>
        </div>
      </div>

      {/* Level badge */}
      <div className="mt-2 flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${levelConfig.color}`}
        >
          <LevelIcon className={`size-3 ${levelConfig.iconColor}`} />
          {levelConfig.label}
        </span>
        {match.nextAction && (
          <span className="text-xs text-muted-foreground truncate">{match.nextAction}</span>
        )}
      </div>

      {/* Needs confirmation warnings */}
      {match.needsConfirmation && match.needsConfirmation.length > 0 && (
        <div className="mt-2 rounded-md bg-amber-50 p-2 text-xs" role="alert">
          <div className="flex items-start gap-1.5">
            <AlertTriangle className="size-3 shrink-0 text-amber-600 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-medium text-amber-800">待确认信息</span>
              {match.needsConfirmation.map((item) => (
                <p key={item.code} className="text-amber-700">{item.detail}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Expand/Collapse for reasons */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="mt-2 flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted"
        style={{ minHeight: 44 }}
        aria-expanded={expanded}
      >
        <span>{expanded ? "收起详情" : "查看详情"}</span>
        {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
      </button>

      {expanded && (
        <div className="mt-2 space-y-3 border-t pt-3">
          {/* Matched reasons */}
          {match.matchedReasons && match.matchedReasons.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-xs font-medium">匹配原因</span>
              {match.matchedReasons.map((reason) => (
                <div
                  key={reason.code}
                  className="flex items-center justify-between rounded bg-muted px-2.5 py-1.5 text-xs"
                >
                  <span className="text-muted-foreground">{reason.label}</span>
                  <span className="ml-2 font-mono tabular-nums">+{reason.scoreContribution}</span>
                </div>
              ))}
            </div>
          )}

          {/* Unmatched reasons */}
          {match.unmatchedReasons && match.unmatchedReasons.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-destructive">不匹配原因</span>
              {match.unmatchedReasons.map((reason) => (
                <div
                  key={reason.code}
                  className="flex items-start gap-1.5 rounded bg-red-50 px-2.5 py-1.5 text-xs text-red-700"
                >
                  <XCircle className="size-3 shrink-0 mt-0.5" />
                  <span>{reason.detail}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {match.status === "active" && (
        <div className="mt-3 flex gap-2 border-t pt-3">
          <button
            type="button"
            onClick={() => handleAction("dismiss")}
            disabled={disabled || actionLoading !== null}
            className="flex-1 rounded-md border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
            style={{ minHeight: 44 }}
            aria-label="关闭匹配"
          >
            {actionLoading === "dismiss" ? (
              <Loader2 className="mx-auto size-3 animate-spin" />
            ) : (
              "关闭"
            )}
          </button>
          <button
            type="button"
            onClick={() => handleAction("archive")}
            disabled={disabled || actionLoading !== null}
            className="flex-1 rounded-md border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
            style={{ minHeight: 44 }}
            aria-label="归档匹配"
          >
            {actionLoading === "archive" ? (
              <Loader2 className="mx-auto size-3 animate-spin" />
            ) : (
              "归档"
            )}
          </button>
        </div>
      )}

      {/* Timestamp */}
      {match.updatedAt && (
        <p className="mt-2 text-right text-xs text-muted-foreground">
          {new Date(match.updatedAt).toLocaleDateString("zh-CN")}
        </p>
      )}
    </div>
  );
}
