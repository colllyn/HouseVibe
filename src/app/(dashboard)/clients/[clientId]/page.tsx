"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MapPin, Pencil, Loader2, Phone, MessageCircle } from "lucide-react";
import { StageBadge, STAGE_LABELS } from "@/features/clients/components/stage-badge";
import { InteractionTimeline } from "@/features/clients/components/interaction-timeline";
import { MatchList } from "@/features/matching/components";
import type { MatchItem } from "@/features/matching/components/match-list";
import { MatchListResponseSchema } from "@/features/matching/schemas";
import { cn } from "@/lib/utils";

interface ClientData {
  id: string;
  name: string;
  phone?: string;
  wechat?: string;
  source_platform?: string;
  budget_min?: number;
  budget_max?: number;
  preferred_districts?: string[];
  preferred_communities?: string[];
  bedrooms?: number;
  rental_type?: string;
  available_from?: string;
  minimum_lease_months?: number;
  pets_required?: boolean;
  cooking_required?: boolean;
  commute_destination?: string;
  hard_requirements?: unknown;
  soft_preferences?: unknown;
  deal_breakers?: string[];
  stage: string;
  raw_input_text?: string;
  next_follow_up_at?: string;
  last_interaction_at?: string;
  created_at: string;
  updated_at: string;
}

function DetailRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex items-start justify-between py-2 border-b border-muted last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right max-w-[60%]">{String(value)}</span>
    </div>
  );
}

function DetailSkeleton() {
  return <div className="px-4 py-4 sm:px-6 sm:py-6 max-w-3xl mx-auto animate-pulse space-y-6"><div className="h-6 bg-muted rounded w-32" /><div className="h-8 bg-muted rounded w-3/4" /><div className="h-4 bg-muted rounded w-1/2" /><div className="h-20 bg-muted rounded" /><div className="h-20 bg-muted rounded" /></div>;
}

export default function ClientDetailPage() {
  const params = useParams();
  const clientId = params.clientId as string;

  const [client, setClient] = React.useState<ClientData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [stageUpdating, setStageUpdating] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  // Matches
  const [matches, setMatches] = React.useState<MatchItem[]>([]);
  const [matchesLoading, setMatchesLoading] = React.useState(false);
  const [matchesError, setMatchesError] = React.useState<string | null>(null);
  const [calculatingMatches, setCalculatingMatches] = React.useState(false);

  const fetchClient = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const resp = await fetch(`/api/clients/${clientId}`);
      const json = await resp.json();
      if (!resp.ok) {
        setLoadError(json.error?.message ?? "加载失败");
        setClient(null);
      } else {
        if (json.data && typeof json.data === "object" && "id" in json.data) {
          setClient(json.data as ClientData);
        } else {
          setLoadError("客户数据格式异常");
          setClient(null);
        }
      }
    } catch {
      setLoadError("加载失败，请检查网络后重试");
      setClient(null);
    }
    setLoading(false);
  }, [clientId]);

  React.useEffect(() => { fetchClient(); }, [fetchClient]);

  const handleStageChange = async (newStage: string) => {
    if (!client) return;
    setStageUpdating(true);
    try {
      const resp = await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: newStage }),
      });
      const json = await resp.json();
      if (!resp.ok) { setLoadError(json.error?.message ?? "更新失败"); return; }
      setClient({ ...client, stage: newStage });
    } catch { setLoadError("更新失败，请重试"); }
    setStageUpdating(false);
  };

  const handleDelete = async () => {
    if (!confirm("确定要删除该客户吗？此操作不可撤销。")) return;
    setDeleting(true);
    try {
      const resp = await fetch(`/api/clients/${clientId}`, { method: "DELETE" });
      const json = await resp.json();
      if (!resp.ok) { setLoadError(json.error?.message ?? "删除失败"); return; }
      window.location.href = "/clients";
    } catch { setLoadError("删除失败，请重试"); }
    setDeleting(false);
  };

  // --- Match handlers ---

  const fetchMatches = React.useCallback(async () => {
    setMatchesLoading(true);
    setMatchesError(null);
    try {
      const resp = await fetch(`/api/clients/${clientId}/matches`);
      const json = await resp.json();
      if (!resp.ok) {
        const errCode = json.error?.code;
        if (errCode === "UNAUTHENTICATED") {
          setMatchesError("登录已失效，请重新登录");
        } else if (errCode === "WORKSPACE_ACCESS_DENIED") {
          setMatchesError("无权访问该客户的匹配数据");
        } else {
          setMatchesError(json.error?.message ?? "加载失败");
        }
        setMatches([]);
      } else {
        // API contract: GET /api/clients/[id]/matches returns { data: <MatchItem[]>, error: null }
        const parsed = MatchListResponseSchema.safeParse(json);
        if (parsed.success) {
          setMatches(parsed.data.data);
        } else {
          const data = json.data;
          if (Array.isArray(data)) {
            setMatches(data as MatchItem[]);
          } else {
            setMatchesError("匹配数据格式异常");
            setMatches([]);
          }
        }
      }
    } catch {
      setMatchesError("加载失败");
      setMatches([]);
    }
    setMatchesLoading(false);
  }, [clientId]);

  React.useEffect(() => { fetchMatches(); }, [fetchMatches]);

  const handleCalculateMatches = async () => {
    setCalculatingMatches(true);
    setMatchesError(null);
    try {
      const resp = await fetch("/api/matches/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        setMatchesError(json.error?.message ?? "计算失败");
      } else {
        await fetchMatches();
      }
    } catch {
      setMatchesError("计算失败");
    }
    setCalculatingMatches(false);
  };

  const handleDismissMatch = async (matchId: string) => {
    try {
      const resp = await fetch(`/api/matches/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "dismissed" }),
      });
      if (resp.ok) fetchMatches();
    } catch {
      // Silently fail; user can retry
    }
  };

  const handleArchiveMatch = async (matchId: string) => {
    try {
      const resp = await fetch(`/api/matches/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      });
      if (resp.ok) fetchMatches();
    } catch {
      // Silently fail; user can retry
    }
  };

  if (loading) return <DetailSkeleton />;
  if (loadError) return <div className="px-4 py-20 text-center"><p className="text-destructive">{loadError}</p><Link href="/clients" className="text-sm text-primary mt-2 inline-block">返回列表</Link></div>;
  if (!client) return <div className="px-4 py-20 text-center text-muted-foreground">客户不存在</div>;

  const hasBudget = client.budget_min != null || client.budget_max != null;
  const budgetText = hasBudget
    ? (client.budget_min != null && client.budget_max != null
      ? `¥${client.budget_min.toLocaleString()} - ¥${client.budget_max.toLocaleString()}`
      : client.budget_min != null
        ? `¥${client.budget_min.toLocaleString()}起`
        : (client.budget_max != null ? `¥${client.budget_max.toLocaleString()}以内` : null))
    : null;

  const preferredLocation = Array.isArray(client.preferred_districts) && client.preferred_districts.length > 0
    ? client.preferred_districts.join(" · ")
    : null;

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/clients" className="inline-flex items-center justify-center rounded-md h-10 w-10 hover:bg-muted transition-colors"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="flex-1">
          <div className="flex items-center gap-2"><h1 className="text-xl font-bold">{client.name}</h1><StageBadge stage={client.stage} /></div>
          {preferredLocation ? <p className="flex items-center gap-1 text-sm text-muted-foreground mt-1"><MapPin className="h-3.5 w-3.5" />{preferredLocation}</p> : null}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mb-6">
        <Link href={`/clients/${client.id}/edit`} className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium border border-input hover:bg-muted min-h-[44px] transition-colors"><Pencil className="h-4 w-4" />编辑</Link>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium border border-destructive text-destructive hover:bg-destructive/10 min-h-[44px] transition-colors disabled:opacity-50"
        >
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "删除"}
        </button>
      </div>

      {/* Stage Selector */}
      <section className="rounded-lg border mb-6">
        <h2 className="font-semibold text-sm px-4 py-3 border-b">跟进阶段</h2>
        <div className="px-4 py-3">
          <div className="flex flex-wrap gap-2">
            {Object.entries(STAGE_LABELS).filter(([k]) => k !== "deleted").map(([k, v]) => (
              <button
                key={k}
                disabled={stageUpdating || k === client.stage}
                onClick={() => handleStageChange(k)}
                className={cn(
                  "inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium min-h-[36px] transition-colors border",
                  k === client.stage
                    ? "bg-primary text-primary-foreground border-primary cursor-default"
                    : "bg-background hover:bg-muted border-input disabled:opacity-50"
                )}
              >
                {v}
              </button>
            ))}
          </div>
          {stageUpdating && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
              <Loader2 className="h-3 w-3 animate-spin" />更新中...
            </p>
          )}
        </div>
      </section>

      {/* Basic Info */}
      <section className="rounded-lg border mb-6">
        <h2 className="font-semibold text-sm px-4 py-3 border-b">基本信息</h2>
        <div className="px-4 py-2">
          <DetailRow label="来源" value={client.source_platform} />
          <DetailRow label="租赁方式" value={client.rental_type === "whole_unit" ? "整租" : client.rental_type === "shared" ? "合租" : client.rental_type} />
          <DetailRow label="户型需求" value={client.bedrooms != null ? `${client.bedrooms}室` : undefined} />
          <DetailRow label="最早入住" value={client.available_from} />
          <DetailRow label="最短租期" value={client.minimum_lease_months ? `${client.minimum_lease_months}个月` : undefined} />
          <DetailRow label="通勤目的地" value={client.commute_destination} />
          <DetailRow label="需要养宠物" value={client.pets_required ? "是" : undefined} />
          <DetailRow label="需要做饭" value={client.cooking_required ? "是" : undefined} />
          <DetailRow label="下次跟进" value={client.next_follow_up_at} />
          <DetailRow label="最近互动" value={client.last_interaction_at} />
        </div>
      </section>

      {/* Budget */}
      {hasBudget && (
        <section className="rounded-lg border mb-6">
          <h2 className="font-semibold text-sm px-4 py-3 border-b">预算信息</h2>
          <div className="px-4 py-2">
            <DetailRow label="预算范围" value={budgetText} />
          </div>
        </section>
      )}

      {/* Preferences */}
      <section className="rounded-lg border mb-6">
        <h2 className="font-semibold text-sm px-4 py-3 border-b">找房偏好</h2>
        <div className="px-4 py-2">
          <DetailRow label="意向区域" value={preferredLocation} />
          {Array.isArray(client.preferred_communities) && client.preferred_communities.length > 0 && (
            <DetailRow label="意向小区" value={client.preferred_communities.join(" · ")} />
          )}
          {Array.isArray(client.deal_breakers) && client.deal_breakers.length > 0 && (
            <DetailRow label="拒绝条件" value={client.deal_breakers.join(" · ")} />
          )}
          {client.hard_requirements != null
            ? <DetailRow label="硬性要求" value={JSON.stringify(client.hard_requirements as object) ?? ""} />
            : null}
          {client.soft_preferences != null
            ? <DetailRow label="软性偏好" value={JSON.stringify(client.soft_preferences as object) ?? ""} />
            : null}
        </div>
      </section>

      {/* Raw input */}
      {client.raw_input_text && (
        <section className="rounded-lg border mb-6">
          <h2 className="font-semibold text-sm px-4 py-3 border-b">原始录入</h2>
          <div className="px-4 py-3 text-sm text-muted-foreground whitespace-pre-wrap break-words">{client.raw_input_text}</div>
        </section>
      )}

      {/* Contact info (sensitive — only visible within workspace) */}
      {client.phone || client.wechat ? (
        <section className="rounded-lg border mb-6">
          <h2 className="font-semibold text-sm px-4 py-3 border-b">联系方式（仅本门店可见）</h2>
          <div className="px-4 py-2">
            {client.phone && (
              <div className="flex items-center gap-2 py-2">
                <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <a href={`tel:${client.phone}`} className="text-sm text-primary hover:underline">{client.phone}</a>
              </div>
            )}
            {client.wechat && (
              <div className="flex items-center gap-2 py-2">
                <MessageCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm">{client.wechat}</span>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {/* Property Matches */}
      <section className="rounded-lg border mb-6">
        <h2 className="font-semibold text-sm px-4 py-3 border-b flex items-center justify-between">
          <span>房源匹配</span>
          <button
            type="button"
            onClick={handleCalculateMatches}
            disabled={calculatingMatches}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            style={{ minHeight: 36 }}
          >
            {calculatingMatches ? <Loader2 className="size-3 animate-spin" /> : null}
            计算匹配
          </button>
        </h2>
        <div className="px-4 py-3">
          <MatchList
            matches={matches}
            view="client"
            loading={matchesLoading}
            error={matchesError}
            onRetry={fetchMatches}
            onDismiss={handleDismissMatch}
            onArchive={handleArchiveMatch}
            onRecalculate={handleCalculateMatches}
            emptyTitle="暂无匹配结果"
            emptyDescription="点击右上角「计算匹配」为该客户匹配房源"
          />
        </div>
      </section>

      {/* Interaction Timeline */}
      <InteractionTimeline clientId={client.id} />

      {/* Meta */}
      <section className="rounded-lg border mb-6">
        <h2 className="font-semibold text-sm px-4 py-3 border-b">记录信息</h2>
        <div className="px-4 py-2">
          <DetailRow label="创建时间" value={new Date(client.created_at).toLocaleString("zh-CN")} />
          <DetailRow label="更新时间" value={new Date(client.updated_at).toLocaleString("zh-CN")} />
        </div>
      </section>
    </div>
  );
}
