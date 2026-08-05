"use client";

import { useState } from "react";
import { MapPin, Clock, Check, X, Loader2 } from "lucide-react";

interface CollaborationRequestCardProps {
  request: {
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
  };
  tab: "received" | "sent";
  onUpdated: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending: { label: "待处理", className: "bg-yellow-100 text-yellow-700" },
  accepted: { label: "已接受", className: "bg-green-100 text-green-700" },
  rejected: { label: "已拒绝", className: "bg-red-100 text-red-700" },
  cancelled: { label: "已取消", className: "bg-gray-100 text-gray-500" },
  completed: { label: "已完成", className: "bg-blue-100 text-blue-700" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, className: "bg-gray-100 text-gray-700" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("zh-CN");
}

export function CollaborationRequestCard({ request: r, tab, onUpdated }: CollaborationRequestCardProps) {
  const [responding, setResponding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRespond(action: "accept" | "reject") {
    setResponding(true);
    setError(null);
    try {
      const res = await fetch(`/api/collaboration-requests/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const body = await res.json();
      if (!res.ok) {
        setError(body.error?.message ?? "操作失败");
        return;
      }
      onUpdated();
    } catch {
      setError("网络错误，请重试");
    } finally {
      setResponding(false);
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="space-y-1 min-w-0 flex-1">
          <h3 className="font-semibold text-sm line-clamp-1">
            {r.property?.title ?? "房源已删除"}
          </h3>
          {r.property && (r.property.district || r.property.community_name) && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 flex-shrink-0" />
              <span className="line-clamp-1">
                {[r.property.city, r.property.district, r.property.community_name].filter(Boolean).join(" · ")}
              </span>
            </p>
          )}
        </div>
        <StatusBadge status={r.status} />
      </div>

      {/* Workspace context */}
      <p className="text-xs text-muted-foreground">
        {tab === "received" ? (
          <>来自: {r.requester_workspace ?? "未知门店"}</>
        ) : (
          <>发送至: {r.owner_workspace ?? "未知门店"}</>
        )}
      </p>

      {/* Message */}
      {r.message && (
        <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          {r.message}
        </div>
      )}

      {/* Dates */}
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          发送: {formatDate(r.requested_at)}
        </span>
        {r.responded_at && (
          <span>回复: {formatDate(r.responded_at)}</span>
        )}
      </div>

      {/* Error */}
      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* Action buttons for received pending requests */}
      {tab === "received" && r.status === "pending" && (
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => handleRespond("accept")}
            disabled={responding}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium bg-green-600 text-white hover:bg-green-700 min-h-[36px] transition-colors disabled:opacity-50"
          >
            {responding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            接受
          </button>
          <button
            type="button"
            onClick={() => handleRespond("reject")}
            disabled={responding}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium border border-input bg-background hover:bg-muted min-h-[36px] transition-colors disabled:opacity-50"
          >
            {responding ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
            拒绝
          </button>
        </div>
      )}
    </div>
  );
}
