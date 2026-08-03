"use client";

import * as React from "react";
import {
  Phone,
  MessageCircle,
  Users,
  Eye,
  RefreshCw,
  Handshake,
  FileText,
  AlertCircle,
  MoreHorizontal,
  Plus,
  Loader2,
  ChevronDown,
  ChevronUp,
  Pencil,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { InteractionForm, type InteractionFormData } from "./interaction-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

// --- Type Config ---

const INTERACTION_TYPE_CONFIG = {
  phone_call: { icon: Phone, label: "电话", color: "bg-blue-100 text-blue-700" },
  wechat_message: { icon: MessageCircle, label: "微信", color: "bg-green-100 text-green-700" },
  in_person_meeting: { icon: Users, label: "见面", color: "bg-purple-100 text-purple-700" },
  property_viewing: { icon: Eye, label: "带看", color: "bg-amber-100 text-amber-700" },
  follow_up: { icon: RefreshCw, label: "跟进", color: "bg-teal-100 text-teal-700" },
  negotiation: { icon: Handshake, label: "谈判", color: "bg-indigo-100 text-indigo-700" },
  contract_signing: { icon: FileText, label: "签约", color: "bg-orange-100 text-orange-700" },
  complaint: { icon: AlertCircle, label: "投诉", color: "bg-red-100 text-red-700" },
  other: { icon: MoreHorizontal, label: "其他", color: "bg-gray-100 text-gray-700" },
};

const ALL_TYPES = Object.keys(INTERACTION_TYPE_CONFIG);

// --- Interaction Shape (list view) ---

interface InteractionListItem {
  id: string;
  workspace_id: string;
  client_id: string;
  interaction_type: string;
  summary?: string | null;
  occurred_at: string;
  created_at: string;
  created_by: string;
  property_id?: string | null;
  updated_at: string;
}

interface InteractionDetail extends InteractionListItem {
  raw_text?: string | null;
  next_action?: string | null;
}

interface InteractionsResponse {
  data: {
    interactions: InteractionListItem[];
    total: number;
    page: number;
    limit: number;
  } | null;
  error: { code: string; message: string } | null;
}

interface InteractionDetailResponse {
  data: InteractionDetail | null;
  error: { code: string; message: string } | null;
}

// --- Skeleton ---

function TimelineSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="rounded-lg border bg-card p-4 animate-pulse"
        >
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-20 bg-muted rounded" />
              <div className="h-3 w-3/4 bg-muted rounded" />
              <div className="h-3 w-1/3 bg-muted rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Empty State ---

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <MessageCircle className="h-12 w-12 text-muted-foreground/50 mb-3" />
      <p className="text-sm text-muted-foreground mb-4">暂无沟通记录</p>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 min-h-[44px] transition-colors"
      >
        <Plus className="h-4 w-4" />
        新增沟通记录
      </button>
    </div>
  );
}

// --- Error State ---

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <AlertCircle className="h-10 w-10 text-destructive mb-3" />
      <p className="text-sm text-destructive mb-4">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium border border-input hover:bg-muted min-h-[44px] transition-colors"
      >
        <RefreshCw className="h-4 w-4" />
        重试
      </button>
    </div>
  );
}

// --- Type Badge ---

function TypeBadge({ type }: { type: string }) {
  const config = INTERACTION_TYPE_CONFIG[type as keyof typeof INTERACTION_TYPE_CONFIG] ?? INTERACTION_TYPE_CONFIG.other;
  const Icon = config.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        config.color
      )}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

// --- Main Component ---

interface InteractionTimelineProps {
  clientId: string;
}

export function InteractionTimeline({ clientId }: InteractionTimelineProps) {
  // --- core state ---
  const [interactions, setInteractions] = React.useState<InteractionListItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [activeType, setActiveType] = React.useState<string>("all");

  // --- expansion / detail ---
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [detailCache, setDetailCache] = React.useState<Record<string, InteractionDetail>>({});
  const [loadingDetail, setLoadingDetail] = React.useState<string | null>(null);
  const [detailError, setDetailError] = React.useState<string | null>(null);

  // --- form ---
  const [showForm, setShowForm] = React.useState(false);
  const [editingData, setEditingData] = React.useState<(InteractionFormData & { id: string }) | null>(null);

  // --- delete ---
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const limit = 20;

  // --- fetch list ---
  const fetchInteractions = React.useCallback(
    async (pageNum: number, type: string, append: boolean) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError(null);
      }

      try {
        const params = new URLSearchParams();
        params.set("page", String(pageNum));
        params.set("limit", String(limit));
        params.set("sortOrder", "desc");
        if (type !== "all") params.set("type", type);

        const resp = await fetch(`/api/clients/${clientId}/interactions?${params.toString()}`);
        const json: InteractionsResponse = await resp.json();

        if (!resp.ok || json.error) {
          setError(json.error?.message ?? "加载失败");
          setLoading(false);
          setLoadingMore(false);
          return;
        }

        if (json.data) {
          const d = json.data;
          if (append) {
            setInteractions((prev) => [...prev, ...d.interactions]);
          } else {
            setInteractions(d.interactions);
          }
          setTotal(d.total);
          setPage(pageNum);
        }
      } catch {
        setError("加载失败，请重试");
      }
      setLoading(false);
      setLoadingMore(false);
    },
    [clientId]
  );

  React.useEffect(() => {
    fetchInteractions(1, activeType, false);
  }, [fetchInteractions, activeType]);

  // --- fetch detail ---
  const fetchDetail = React.useCallback(
    async (interactionId: string) => {
      if (detailCache[interactionId]) return;
      setLoadingDetail(interactionId);
      setDetailError(null);
      try {
        const resp = await fetch(`/api/clients/${clientId}/interactions/${interactionId}`);
        const json: InteractionDetailResponse = await resp.json();
        if (!resp.ok || json.error) {
          setDetailError(json.error?.message ?? "加载详情失败");
        } else if (json.data) {
          const detail = json.data;
          setDetailCache((prev) => ({ ...prev, [interactionId]: detail }));
        }
      } catch {
        setDetailError("加载详情失败，请重试");
      }
      setLoadingDetail(null);
    },
    [clientId, detailCache]
  );

  // --- toggle expand ---
  const handleToggleExpand = (interactionId: string) => {
    if (expandedId === interactionId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(interactionId);
    fetchDetail(interactionId);
  };

  // --- filter ---
  const handleTypeChange = (type: string) => {
    setActiveType(type);
    setExpandedId(null);
    setDetailCache({});
  };

  // --- load more ---
  const hasMore = interactions.length < total;

  const handleLoadMore = () => {
    fetchInteractions(page + 1, activeType, true);
  };

  // --- form handlers ---
  const handleAdd = () => {
    setEditingData(null);
    setShowForm(true);
  };

  const handleEdit = (item: InteractionListItem) => {
    const detail = detailCache[item.id];
    setEditingData({
      id: item.id,
      interaction_type: item.interaction_type,
      occurred_at: item.occurred_at
        ? new Date(item.occurred_at).toISOString().slice(0, 16)
        : "",
      summary: detail?.summary ?? item.summary ?? "",
      raw_text: detail?.raw_text ?? "",
      next_action: detail?.next_action ?? "",
      property_id: detail?.property_id ?? item.property_id ?? "",
    });
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingData(null);
    setDetailCache({});
    setExpandedId(null);
    fetchInteractions(1, activeType, false);
  };

  // --- delete handler ---
  const handleDeleteRequest = (interactionId: string) => {
    setDeletingId(interactionId);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingId) return;
    setDeleting(true);
    try {
      const resp = await fetch(`/api/clients/${clientId}/interactions/${deletingId}`, {
        method: "DELETE",
      });
      const json = await resp.json();
      if (!resp.ok || json.error) {
        setError(json.error?.message ?? "删除失败");
        return;
      }
      // Remove from local state
      setInteractions((prev) => prev.filter((i) => i.id !== deletingId));
      setTotal((prev) => prev - 1);
      setExpandedId(null);
      setDetailCache((prev) => {
        const { [deletingId]: _removed, ...next } = prev;
        return next;
      });
    } catch {
      setError("删除失败，请重试");
    }
    setDeletingId(null);
    setDeleting(false);
  };

  // --- helpers ---
  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  const getSummaryText = (item: InteractionListItem) => {
    if (item.summary) return item.summary;
    return null;
  };

  // --- render ---

  return (
    <section className="rounded-lg border mb-6">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h2 className="font-semibold text-sm">沟通记录</h2>
        <button
          type="button"
          onClick={handleAdd}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 min-h-[36px] transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          新增
        </button>
      </div>

      <div className="px-4 py-3">
        {/* Type Filter Chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-3 -mx-1 px-1">
          <button
            type="button"
            onClick={() => handleTypeChange("all")}
            className={cn(
              "inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap min-h-[32px] transition-colors border flex-shrink-0",
              activeType === "all"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background hover:bg-muted border-input"
            )}
          >
            全部
          </button>
          {ALL_TYPES.map((type) => {
            const t = type as keyof typeof INTERACTION_TYPE_CONFIG;
            const config = INTERACTION_TYPE_CONFIG[t];
            const Icon = config.icon;
            return (
              <button
                key={type}
                type="button"
                onClick={() => handleTypeChange(type)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap min-h-[32px] transition-colors border flex-shrink-0",
                  activeType === type
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-muted border-input"
                )}
              >
                <Icon className="h-3 w-3" />
                {config.label}
              </button>
            );
          })}
        </div>

        {/* Content Area */}
        {loading ? (
          <TimelineSkeleton />
        ) : error ? (
          <ErrorState message={error} onRetry={() => fetchInteractions(1, activeType, false)} />
        ) : interactions.length === 0 ? (
          <EmptyState onAdd={handleAdd} />
        ) : (
          <div className="space-y-3">
            {interactions.map((item) => {
              const isExpanded = expandedId === item.id;
              const detail = detailCache[item.id];
              const isLoadingDetail = loadingDetail === item.id;

              return (
                <div
                  key={item.id}
                  className="rounded-lg border bg-card overflow-hidden"
                >
                  {/* Card Header — always visible */}
                  <button
                    type="button"
                    onClick={() => handleToggleExpand(item.id)}
                    className="w-full text-left p-4 flex items-start gap-3 min-h-[44px] hover:bg-muted/50 transition-colors"
                  >
                    <TypeBadge type={item.interaction_type} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {getSummaryText(item) ?? (
                            <span className="text-muted-foreground font-normal">
                              {INTERACTION_TYPE_CONFIG[item.interaction_type as keyof typeof INTERACTION_TYPE_CONFIG]?.label ?? "沟通记录"}
                            </span>
                          )}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDate(item.occurred_at)}
                      </p>
                    </div>
                    <span className="text-muted-foreground flex-shrink-0 mt-0.5">
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </span>
                  </button>

                  {/* Expanded Detail */}
                  {isExpanded && (
                    <div className="border-t px-4 py-3 bg-muted/30">
                      {isLoadingDetail ? (
                        <div className="flex items-center justify-center py-6">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : detailError ? (
                        <div className="flex flex-col items-center py-4 gap-2">
                          <p className="text-xs text-destructive">{detailError}</p>
                          <button
                            type="button"
                            onClick={() => fetchDetail(item.id)}
                            className="text-xs text-primary hover:underline"
                          >
                            重试
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3 text-sm">
                          {(detail?.summary ?? item.summary) && (
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">摘要</p>
                              <p className="text-sm">
                                {detail?.summary ?? item.summary}
                              </p>
                            </div>
                          )}

                          {detail?.raw_text && (
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">详细记录</p>
                              <p className="text-sm whitespace-pre-wrap break-words">
                                {detail.raw_text}
                              </p>
                            </div>
                          )}

                          {detail?.next_action && (
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">后续行动</p>
                              <p className="text-sm">{detail.next_action}</p>
                            </div>
                          )}

                          {detail?.property_id && (
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">关联房源</p>
                              <p className="text-sm font-mono text-xs">{detail.property_id}</p>
                            </div>
                          )}

                          <div>
                            <p className="text-xs text-muted-foreground mb-1">创建时间</p>
                            <p className="text-xs">{formatDate(item.created_at)}</p>
                          </div>

                          <div>
                            <p className="text-xs text-muted-foreground mb-1">更新时间</p>
                            <p className="text-xs">{formatDate(item.updated_at)}</p>
                          </div>

                          <div className="flex items-center gap-2 pt-2 border-t border-border">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(item);
                              }}
                              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium border border-input hover:bg-muted min-h-[36px] transition-colors"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              编辑
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteRequest(item.id);
                              }}
                              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium border border-destructive text-destructive hover:bg-destructive/10 min-h-[36px] transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              删除
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Load More */}
            {hasMore && (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium border border-input hover:bg-muted min-h-[44px] transition-colors disabled:opacity-50"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      加载中...
                    </>
                  ) : (
                    "加载更多"
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Interaction Form Overlay */}
      <InteractionForm
        open={showForm}
        onOpenChange={setShowForm}
        clientId={clientId}
        initialData={editingData}
        onSuccess={handleFormSuccess}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deletingId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingId(null);
        }}
        title="删除沟通记录"
        description="确定要删除这条沟通记录吗？删除后不可见但保留审计记录。"
        confirmLabel="确认删除"
        variant="destructive"
        isLoading={deleting}
        onConfirm={handleDeleteConfirm}
      />
    </section>
  );
}
