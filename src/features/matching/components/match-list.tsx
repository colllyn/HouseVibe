"use client";

import React from "react";
import { Loader2, AlertTriangle, RefreshCw, Inbox } from "lucide-react";
import { MatchCard } from "./match-card";

export interface MatchItem {
  id: string;
  propertyId?: string;
  propertyTitle?: string;
  propertyDistrict?: string | null;
  propertyCommunity?: string | null;
  clientId?: string;
  clientName?: string;
  score: number;
  matchLevel: "excellent" | "good" | "fair" | "low";
  matchedReasons?: Array<{
    code: string;
    label: string;
    scoreContribution: number;
    detail: string;
  }>;
  unmatchedReasons?: Array<{
    code: string;
    label: string;
    detail: string;
  }>;
  needsConfirmation?: Array<{
    code: string;
    label: string;
    detail: string;
  }>;
  nextAction?: string;
  status: "active" | "dismissed" | "archived";
  createdAt?: string;
  updatedAt?: string;
}

interface MatchListProps {
  matches: MatchItem[];
  view: "client" | "property";
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  onDismiss?: (matchId: string) => void;
  onArchive?: (matchId: string) => void;
  onRecalculate?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
}

export function MatchList({
  matches,
  view,
  loading,
  error,
  onRetry,
  onDismiss,
  onArchive,
  onRecalculate,
  emptyTitle,
  emptyDescription,
}: MatchListProps) {
  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16" role="status">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
        <p className="mt-4 text-sm text-muted-foreground">加载匹配结果中…</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16" role="alert">
        <AlertTriangle className="size-10 text-destructive" />
        <p className="mt-4 text-sm font-medium">加载失败</p>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            style={{ minHeight: 44 }}
          >
            <RefreshCw className="size-4" />
            重试
          </button>
        )}
        {onRecalculate && (
          <button
            type="button"
            onClick={onRecalculate}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
            style={{ minHeight: 44 }}
          >
            <RefreshCw className="size-4" />
            重新计算
          </button>
        )}
      </div>
    );
  }

  // Empty state
  if (!matches || matches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Inbox className="size-10 text-muted-foreground" />
        <p className="mt-4 text-sm font-medium">{emptyTitle ?? "暂无匹配结果"}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {emptyDescription ?? "点击「重新计算」为该客户匹配房源"}
        </p>
        {onRecalculate && (
          <button
            type="button"
            onClick={onRecalculate}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            style={{ minHeight: 44 }}
          >
            <RefreshCw className="size-4" />
            重新计算
          </button>
        )}
      </div>
    );
  }

  // Data state: sorted matches
  const sortedMatches = [...matches].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return 0;
  });

  return (
    <div className="space-y-3">
      {onRecalculate && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onRecalculate}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            style={{ minHeight: 44 }}
          >
            <RefreshCw className="size-3.5" />
            重新计算
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {sortedMatches.map((match) => (
          <MatchCard
            key={match.id}
            match={match}
            view={view}
            onDismiss={onDismiss}
            onArchive={onArchive}
            disabled={false}
          />
        ))}
      </div>
    </div>
  );
}
