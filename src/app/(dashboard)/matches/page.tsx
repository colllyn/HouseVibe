"use client";

import React from "react";
import { Loader2, Users, SlidersHorizontal, Calculator } from "lucide-react";
import Link from "next/link";
import {
  MatchList,
  MatchStats,
  WeightEditor,
} from "@/features/matching/components";
import type { MatchItem } from "@/features/matching/components/match-list";
import { ClientListResponseSchema, MatchListResponseSchema } from "@/features/matching/schemas";

const DEFAULT_WEIGHTS = {
  budget: 30,
  district: 20,
  roomType: 15,
  availability: 15,
  commute: 10,
  specialRequirements: 10,
};

interface ClientOption {
  id: string;
  name: string;
}

function MatchesSkeleton() {
  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 max-w-6xl mx-auto animate-pulse space-y-6">
      <div className="h-7 bg-muted rounded w-24" />
      <div className="h-4 bg-muted rounded w-64" />
      <div className="h-10 bg-muted rounded w-full max-w-sm" />
      <div className="h-20 bg-muted rounded" />
    </div>
  );
}

function MatchesContent() {
  // Client selection
  const [clients, setClients] = React.useState<ClientOption[]>([]);
  const [clientsLoading, setClientsLoading] = React.useState(true);
  const [clientsError, setClientsError] = React.useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = React.useState("");

  // Match results
  const [matches, setMatches] = React.useState<MatchItem[]>([]);
  const [matchesLoading, setMatchesLoading] = React.useState(false);
  const [matchesError, setMatchesError] = React.useState<string | null>(null);
  const [calculating, setCalculating] = React.useState(false);

  // Stats
  const [stats, setStats] = React.useState<{
    totalProperties: number;
    matchedCount: number;
    excellentCount: number;
    goodCount: number;
    fairCount: number;
    lowCount: number;
  } | null>(null);

  // Weight editor
  const [showWeightEditor, setShowWeightEditor] = React.useState(false);
  const [weights, setWeights] = React.useState(DEFAULT_WEIGHTS);

  // Fetch clients on mount
  const fetchClients = React.useCallback(async () => {
    setClientsLoading(true);
    setClientsError(null);
    try {
      const resp = await fetch("/api/clients?limit=100");
      const json = await resp.json();
      if (!resp.ok) {
        setClientsError(json.error?.message ?? "加载客户列表失败");
        setClients([]);
      } else {
        // API contract: GET /api/clients returns { data: { clients, total, page, limit }, error: null }
        const parsed = ClientListResponseSchema.safeParse(json);
        if (parsed.success) {
          setClients(parsed.data.data.clients);
        } else {
          // Graceful fallback for unexpected response shape
          const clients = json.data?.clients;
          setClients(Array.isArray(clients) ? clients : []);
        }
      }
    } catch {
      setClientsError("加载客户列表失败");
      setClients([]);
    }
    setClientsLoading(false);
  }, []);

  React.useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  // Fetch persisted matches for selected client
  const fetchMatches = React.useCallback(async () => {
    if (!selectedClientId) return;
    setMatchesLoading(true);
    setMatchesError(null);
    try {
      const resp = await fetch(`/api/clients/${selectedClientId}/matches`);
      const json = await resp.json();
      if (!resp.ok) {
        const errCode = json.error?.code;
        if (errCode === "UNAUTHENTICATED") {
          setMatchesError("登录已失效，请重新登录");
        } else if (errCode === "WORKSPACE_ACCESS_DENIED" || errCode === "FEATURE_NOT_ALLOWED") {
          setMatchesError("无权访问匹配功能");
        } else {
          setMatchesError(json.error?.message ?? "加载匹配结果失败");
        }
        setMatches([]);
        setStats(null);
      } else {
        // API contract: GET /api/clients/[id]/matches returns { data: <MatchItem[]>, error: null }
        const parsed = MatchListResponseSchema.safeParse(json);
        if (parsed.success) {
          const data = parsed.data.data;
          setMatches(data);
          computeStats(data);
        } else {
          // Graceful fallback for unexpected response shape
          const data = json.data;
          if (Array.isArray(data)) {
            setMatches(data as MatchItem[]);
            computeStats(data as MatchItem[]);
          } else {
            setMatchesError("匹配数据格式异常");
            setMatches([]);
            setStats(null);
          }
        }
      }
    } catch {
      setMatchesError("加载匹配结果失败");
      setMatches([]);
      setStats(null);
    }
    setMatchesLoading(false);
  }, [selectedClientId]);

  // Compute stats from match array
  function computeStats(data: MatchItem[]) {
    let excellentCount = 0;
    let goodCount = 0;
    let fairCount = 0;
    let lowCount = 0;
    for (const m of data) {
      switch (m.matchLevel) {
        case "excellent":
          excellentCount++;
          break;
        case "good":
          goodCount++;
          break;
        case "fair":
          fairCount++;
          break;
        case "low":
          lowCount++;
          break;
      }
    }
    setStats({
      totalProperties: data.length,
      matchedCount: data.filter((m) => m.status === "active").length,
      excellentCount,
      goodCount,
      fairCount,
      lowCount,
    });
  }

  // Calculate matches
  const handleCalculate = async () => {
    if (!selectedClientId) return;
    setCalculating(true);
    setMatchesError(null);
    try {
      const resp = await fetch("/api/matches/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: selectedClientId,
          weightOverrides: weights,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        const errCode = json.error?.code;
        if (errCode === "UNAUTHENTICATED") {
          setMatchesError("登录已失效，请重新登录");
        } else if (errCode === "WORKSPACE_ACCESS_DENIED" || errCode === "FEATURE_NOT_ALLOWED") {
          setMatchesError("无权访问匹配功能");
        } else if (errCode === "RESOURCE_NOT_FOUND") {
          setMatchesError("客户不存在或已被删除");
        } else {
          setMatchesError(json.error?.message ?? "计算失败");
        }
        setMatches([]);
        setStats(null);
      } else {
        // Refetch from GET to get persisted match IDs
        await fetchMatches();
      }
    } catch {
      setMatchesError("计算失败");
      setMatches([]);
      setStats(null);
    }
    setCalculating(false);
  };

  // Dismiss a match
  const handleDismiss = async (matchId: string) => {
    try {
      const resp = await fetch(`/api/matches/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "dismissed" }),
      });
      if (!resp.ok) return;
      setMatches((prev) => prev.filter((m) => m.id !== matchId));
    } catch {
      // Silently fail; user can retry
    }
  };

  // Archive a match
  const handleArchive = async (matchId: string) => {
    try {
      const resp = await fetch(`/api/matches/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      });
      if (!resp.ok) return;
      setMatches((prev) => prev.filter((m) => m.id !== matchId));
    } catch {
      // Silently fail; user can retry
    }
  };

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 max-w-6xl mx-auto">
      {/* Header */}
      <h1 className="text-xl font-bold">房客匹配</h1>
      <p className="text-sm text-muted-foreground mt-1">
        选择合适的客户，智能匹配最佳房源
      </p>

      {/* Client Selector + Actions */}
      <div className="mt-6 flex flex-col sm:flex-row gap-2">
        {/* Client dropdown */}
        <div className="relative flex-1 max-w-sm">
          {clientsLoading ? (
            <div className="flex items-center gap-2 h-10 px-3 rounded-md border border-input bg-muted/50">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                加载客户列表…
              </span>
            </div>
          ) : clientsError ? (
            <div className="flex items-center gap-2">
              <p className="text-sm text-destructive">{clientsError}</p>
              <button
                type="button"
                onClick={fetchClients}
                className="text-sm text-primary underline"
              >
                重试
              </button>
            </div>
          ) : clients.length === 0 ? (
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">暂无客户</p>
              <Link
                href="/clients/new"
                className="text-sm text-primary underline"
              >
                添加客户
              </Link>
            </div>
          ) : (
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              style={{ minHeight: 44 }}
            >
              <option value="">选择客户…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <button
          type="button"
          onClick={handleCalculate}
          disabled={!selectedClientId || calculating}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          style={{ minHeight: 44 }}
        >
          {calculating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Calculator className="size-4" />
          )}
          计算匹配
        </button>

        <button
          type="button"
          onClick={() => setShowWeightEditor(!showWeightEditor)}
          className="inline-flex items-center gap-1.5 rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-muted"
          style={{ minHeight: 44 }}
        >
          <SlidersHorizontal className="size-4" />
          权重调整
        </button>
      </div>

      {/* Weight Editor (collapsible) */}
      {showWeightEditor && (
        <div className="mt-4 rounded-lg border p-4">
          <WeightEditor
            weights={weights}
            onChange={(w) =>
              setWeights(
                w as unknown as typeof DEFAULT_WEIGHTS,
              )
            }
          />
        </div>
      )}

      {/* Results Area */}
      <div className="mt-6">
        {/* No client selected */}
        {!selectedClientId && !calculating && (
          <div className="flex flex-col items-center justify-center py-16 rounded-lg border">
            <Users className="size-10 text-muted-foreground" />
            <p className="mt-4 text-sm font-medium">请先选择客户</p>
            <p className="mt-1 text-sm text-muted-foreground">
              从上方下拉菜单中选择一个客户，然后点击「计算匹配」
            </p>
          </div>
        )}

        {/* Calculating */}
        {calculating && (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">
              正在计算匹配结果…
            </p>
          </div>
        )}

        {/* Calculation error */}
        {matchesError && !calculating && (
          <div className="flex flex-col items-center justify-center py-16 rounded-lg border border-destructive/30">
            <p className="text-sm font-medium text-destructive">计算失败</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {matchesError}
            </p>
            <button
              type="button"
              onClick={handleCalculate}
              className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              style={{ minHeight: 44 }}
            >
              重试
            </button>
          </div>
        )}

        {/* Stats */}
        {stats && !calculating && !matchesError && (
          <div className="mb-4">
            <MatchStats {...stats} />
          </div>
        )}

        {/* Match list (loading from GET) */}
        {selectedClientId && !calculating && !matchesError && (
          <MatchList
            matches={matches}
            view="client"
            loading={matchesLoading}
            error={null}
            onRetry={fetchMatches}
            onDismiss={handleDismiss}
            onArchive={handleArchive}
            onRecalculate={handleCalculate}
            emptyTitle="未找到匹配房源"
            emptyDescription="该客户暂无匹配房源，点击重新计算尝试不同的权重设置"
          />
        )}
      </div>
    </div>
  );
}

export default function MatchesPage() {
  return (
    <React.Suspense fallback={<MatchesSkeleton />}>
      <MatchesContent />
    </React.Suspense>
  );
}
