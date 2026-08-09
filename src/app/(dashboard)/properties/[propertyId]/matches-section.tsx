"use client";

import React from "react";
import { MatchList } from "@/features/matching/components";
import type { MatchItem } from "@/features/matching/components/match-list";
import { MatchListResponseSchema } from "@/features/matching/schemas";

export function PropertyMatchSection({ propertyId }: { propertyId: string }) {
  const [matches, setMatches] = React.useState<MatchItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchMatches = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/properties/${propertyId}/matches`);
      const json = await resp.json();
      if (!resp.ok) {
        const errCode = json.error?.code;
        if (errCode === "UNAUTHENTICATED") {
          setError("登录已失效，请重新登录");
        } else if (errCode === "WORKSPACE_ACCESS_DENIED" || errCode === "FEATURE_NOT_ALLOWED") {
          setError("无权访问匹配功能");
        } else {
          setError(json.error?.message ?? "加载失败");
        }
        setMatches([]);
      } else {
        // API contract: GET /api/properties/[id]/matches returns { data: <MatchItem[]>, error: null }
        const parsed = MatchListResponseSchema.safeParse(json);
        if (parsed.success) {
          setMatches(parsed.data.data);
        } else {
          const data = json.data;
          if (Array.isArray(data)) {
            setMatches(data as MatchItem[]);
          } else {
            setError("匹配数据格式异常");
            setMatches([]);
          }
        }
      }
    } catch {
      setError("加载失败");
      setMatches([]);
    }
    setLoading(false);
  }, [propertyId]);

  React.useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  return (
    <section className="rounded-lg border mb-6">
      <h2 className="font-semibold text-sm px-4 py-3 border-b">匹配客户</h2>
      <div className="px-4 py-3">
        <MatchList
          matches={matches}
          view="property"
          loading={loading}
          error={error}
          onRetry={fetchMatches}
          emptyTitle="暂无匹配客户"
          emptyDescription="该房源暂未匹配到任何客户"
        />
      </div>
    </section>
  );
}
