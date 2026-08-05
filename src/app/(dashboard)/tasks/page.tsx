"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, Calendar, Clock, ArrowUpRight, ClipboardList, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { TaskForm } from "@/features/tasks/components/task-form";
import { TASK_TYPE_LABELS, TASK_STATUS_LABELS } from "@/features/tasks/schemas";

// Types
interface TaskCard {
  id: string;
  task_type: string;
  title: string;
  description?: string;
  status: string;
  due_at?: string;
  completed_at?: string;
  property_id?: string;
  client_id?: string;
  created_at: string;
  updated_at: string;
}

interface ListData {
  tasks: TaskCard[];
  total: number;
  page: number;
  limit: number;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    todo: "bg-blue-50 text-blue-700 border-blue-200",
    in_progress: "bg-amber-50 text-amber-700 border-amber-200",
    done: "bg-green-50 text-green-700 border-green-200",
    cancelled: "bg-gray-100 text-gray-500 border-gray-200",
  };
  const label = TASK_STATUS_LABELS[status as keyof typeof TASK_STATUS_LABELS] ?? status;

  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", colors[status] ?? "bg-muted text-muted-foreground")}>
      {label}
    </span>
  );
}

function Card({ t }: { t: TaskCard }) {
  const typeLabel = TASK_TYPE_LABELS[t.task_type as keyof typeof TASK_TYPE_LABELS] ?? t.task_type;
  const isOverdue = t.due_at && t.status !== "done" && t.status !== "cancelled" && new Date(t.due_at) < new Date();

  return (
    <Link
      href={`/tasks/${t.id}`}
      className="group block rounded-lg border bg-card hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
    >
      <div className="p-4 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm line-clamp-2 group-hover:text-primary transition-colors flex-1">
            {t.title}
          </h3>
          <ArrowUpRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors flex-shrink-0 mt-0.5" />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{typeLabel}</span>
          <StatusBadge status={t.status} />
        </div>

        {t.description && (
          <p className="text-xs text-muted-foreground line-clamp-1">{t.description}</p>
        )}

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {t.due_at && (
            <span className={cn("flex items-center gap-1", isOverdue && "text-destructive font-medium")}>
              <Calendar className="h-3 w-3" />
              {isOverdue ? "已逾期: " : "截止: "}
              {new Date(t.due_at).toLocaleDateString("zh-CN")}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {new Date(t.created_at).toLocaleDateString("zh-CN")}
          </span>
        </div>
      </div>
    </Link>
  );
}

function Skeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-card p-4 animate-pulse space-y-3">
          <div className="h-5 bg-muted rounded w-3/4" />
          <div className="h-4 bg-muted rounded w-1/2" />
          <div className="h-4 bg-muted rounded w-1/3" />
          <div className="flex gap-2"><div className="h-6 bg-muted rounded w-16" /></div>
        </div>
      ))}
    </div>
  );
}

function Empty() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="rounded-full bg-muted p-4 mb-4"><ClipboardList className="h-8 w-8 text-muted-foreground" /></div>
      <h2 className="text-lg font-semibold mb-1">暂无任务</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs">创建您的第一个任务，开始管理待办</p>
    </div>
  );
}

function NoResults() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="rounded-full bg-muted p-4 mb-4"><SlidersHorizontal className="h-8 w-8 text-muted-foreground" /></div>
      <h2 className="text-lg font-semibold mb-1">暂无符合条件的任务</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs">试试切换筛选条件</p>
    </div>
  );
}

function ErrorState({ m, onRetry }: { m: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <h2 className="text-lg font-semibold mb-1">加载失败</h2>
      <p className="text-sm text-muted-foreground mb-6">{m}</p>
      <button onClick={onRetry} className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium border border-input bg-background hover:bg-muted min-h-[44px] transition-colors">重试</button>
    </div>
  );
}

const STATUS_TABS = [
  { value: "", label: "全部" },
  { value: "todo", label: "待处理" },
  { value: "in_progress", label: "处理中" },
  { value: "done", label: "已完成" },
  { value: "cancelled", label: "已取消" },
];

const SORT_OPTIONS = [
  { value: "created_at:desc", label: "最近创建" },
  { value: "due_at:asc", label: "最早截止" },
  { value: "due_at:desc", label: "最晚截止" },
];

function TasksContent() {
  const [data, setData] = React.useState<ListData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);

  // URL-managed state
  const [params, setParams] = React.useState<URLSearchParams>(() =>
    typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams()
  );

  const fetchTasks = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = params.toString();
      const resp = await fetch(`/api/tasks${qs ? `?${qs}` : ""}`);
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
  }, [params]);

  React.useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // Sync URL changes from popstate
  React.useEffect(() => {
    const handler = () => setParams(new URLSearchParams(window.location.search));
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.set("page", "1");
    window.history.pushState(null, "", `/tasks?${next.toString()}`);
    setParams(next);
  };

  const currentStatus = params.get("status") ?? "";
  const sortValue = `${params.get("sortBy") ?? "created_at"}:${params.get("sortOrder") ?? "desc"}`;

  const updateSort = (combined: string) => {
    const parts = combined.split(":");
    const sortBy = parts[0] ?? "created_at";
    const sortOrder = parts[1] ?? "desc";
    const next = new URLSearchParams(params.toString());
    next.set("sortBy", sortBy);
    next.set("sortOrder", sortOrder);
    window.history.pushState(null, "", `/tasks?${next.toString()}`);
    setParams(next);
  };

  const handleFormSuccess = () => {
    setFormOpen(false);
    fetchTasks();
  };

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">任务</h1>
          <p className="text-sm text-muted-foreground mt-1">管理您的待办事项与跟进</p>
        </div>
        <button
          onClick={() => setFormOpen(true)}
          className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 min-h-[44px] transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">新增任务</span>
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* Status tabs */}
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => updateParam("status", tab.value)}
            className={cn(
              "inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium min-h-[36px] transition-colors",
              currentStatus === tab.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {tab.label}
          </button>
        ))}

        {/* Divider */}
        <span className="w-px h-6 bg-border mx-1" />

        {/* Sort */}
        <select
          value={sortValue}
          onChange={(e) => updateSort(e.target.value)}
          className="min-h-[44px] rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {/* Clear filter */}
        {currentStatus && (
          <button
            onClick={() => updateParam("status", "")}
            className="inline-flex items-center gap-1 min-h-[44px] rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />清除筛选
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <Skeleton />
      ) : error ? (
        <ErrorState m={error} onRetry={fetchTasks} />
      ) : !data || data.tasks.length === 0 ? (
        currentStatus ? <NoResults /> : <Empty />
      ) : (
        <>
          <div className="text-xs text-muted-foreground mb-3">共 {data.total} 个任务</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.tasks.map((t) => <Card key={t.id} t={t} />)}
          </div>
        </>
      )}

      {/* Task form overlay */}
      <TaskForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSuccess={handleFormSuccess}
      />
    </div>
  );
}

function TasksFallback() { return <Skeleton />; }
export default function TasksPage() {
  return (
    <React.Suspense fallback={<TasksFallback />}>
      <TasksContent />
    </React.Suspense>
  );
}
