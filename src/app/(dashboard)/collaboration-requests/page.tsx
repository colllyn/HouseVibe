"use client";

import * as React from "react";
import { Inbox, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { CollaborationRequestCard } from "@/features/collaboration/components/collaboration-request-card";

interface CollaborationRequest {
  id: string;
  requester_workspace_id: string;
  owner_workspace_id: string;
  property_id: string;
  message: string | null;
  status: string;
  requested_at: string;
  responded_at: string | null;
  property: {
    id: string;
    title: string;
    community_name: string | null;
    district: string | null;
    city: string | null;
  } | null;
  requester_workspace: string | null;
  owner_workspace: string | null;
}

interface ListData {
  requests: CollaborationRequest[];
  total: number;
  page: number;
  limit: number;
}

function SkeletonCard() {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <div className="h-5 bg-muted rounded w-3/4" />
          <div className="h-3 bg-muted rounded w-1/2" />
        </div>
        <div className="h-5 bg-muted rounded w-16" />
      </div>
      <div className="h-3 bg-muted rounded w-1/3" />
      <div className="h-10 bg-muted rounded" />
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  );
}

function EmptyState({ tab }: { tab: "received" | "sent" }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        {tab === "received" ? <Inbox className="h-8 w-8 text-muted-foreground" /> : <Send className="h-8 w-8 text-muted-foreground" />}
      </div>
      <h2 className="text-lg font-semibold mb-1">
        {tab === "received" ? "暂无收到的协作请求" : "暂无发出的协作请求"}
      </h2>
      <p className="text-sm text-muted-foreground max-w-xs">
        {tab === "received"
          ? "其他门店的协作请求将显示在这里"
          : "去共享房源池浏览房源，向感兴趣的门店发起协作请求"}
      </p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <h2 className="text-lg font-semibold mb-1">加载失败</h2>
      <p className="text-sm text-muted-foreground mb-6">{message}</p>
      <button onClick={onRetry} className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium border border-input bg-background hover:bg-muted min-h-[44px] transition-colors">重试</button>
    </div>
  );
}

function CollaborationRequestsContent() {
  const [tab, setTab] = React.useState<"received" | "sent">("received");
  const [data, setData] = React.useState<ListData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);

  const fetchRequests = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/collaboration-requests?tab=${tab}`);
      const json = await resp.json();
      if (!resp.ok) {
        setError(json.error?.message ?? "加载失败");
        setData(null);
      } else {
        setData(json.data as ListData);
      }
    } catch {
      setError("加载失败，请检查网络后重试");
      setData(null);
    }
    setLoading(false);
  }, [tab, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => { fetchRequests(); }, [fetchRequests]);

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 max-w-3xl mx-auto min-h-dvh">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold">协作请求</h1>
        <p className="text-sm text-muted-foreground mt-1">管理收到的和发出的房源协作请求</p>
      </div>

      {/* Tab bar */}
      <div className="flex border-b mb-4">
        <button
          onClick={() => setTab("received")}
          className={cn(
            "flex-1 inline-flex items-center justify-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors min-h-[44px]",
            tab === "received"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Inbox className="h-4 w-4" />
          收到的请求
        </button>
        <button
          onClick={() => setTab("sent")}
          className={cn(
            "flex-1 inline-flex items-center justify-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors min-h-[44px]",
            tab === "sent"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Send className="h-4 w-4" />
          发出的请求
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <Skeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchRequests} />
      ) : !data || data.requests.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <div className="space-y-3">
          {data.requests.map((r) => (
            <CollaborationRequestCard
              key={r.id}
              request={r}
              tab={tab}
              onUpdated={() => setRefreshKey((k) => k + 1)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CollaborationRequestsPage() {
  return <CollaborationRequestsContent />;
}
