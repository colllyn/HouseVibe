"use client";

// ============================================================
// Content Projects List Page — P3-AI-021
// /content — Content workbench with list, status filter, platform filter
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { ContentProject } from "@/features/content-projects/schemas";
import { PLATFORM_LABELS, STATUS_LABELS } from "@/features/content-projects/schemas";

// ============================================================
// Types
// ============================================================

interface PageState {
  status: "loading" | "loaded" | "error" | "denied";
  message?: string;
  projects: ContentProject[];
  total: number;
}

// ============================================================
// Page
// ============================================================

export default function ContentListPage() {
  const router = useRouter();
  const [state, setState] = useState<PageState>({ status: "loading", projects: [], total: 0 });
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [platformFilter, setPlatformFilter] = useState<string>("");

  const fetchProjects = useCallback(async () => {
    setState(s => ({ ...s, status: "loading" }));
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (platformFilter) params.set("platform", platformFilter);
      params.set("limit", "50");

      const res = await fetch(`/api/content/projects?${params.toString()}`);
      const json = await res.json();

      if (!res.ok) {
        if (json.error?.code === "FEATURE_DENIED") {
          setState({ status: "denied", message: json.error.message, projects: [], total: 0 });
          return;
        }
        setState({ status: "error", message: json.error?.message ?? "加载失败", projects: [], total: 0 });
        return;
      }

      setState({ status: "loaded", projects: json.data?.data ?? [], total: json.data?.total ?? 0 });
    } catch {
      setState({ status: "error", message: "网络错误", projects: [], total: 0 });
    }
  }, [statusFilter, platformFilter]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // ============================================================
  // Loading
  // ============================================================

  if (state.status === "loading") {
    return (
      <div className="p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">内容工作台</h1>
        </div>
        <div className="mt-6 animate-pulse space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  // ============================================================
  // Denied (no content_factory feature)
  // ============================================================

  if (state.status === "denied") {
    return (
      <div className="p-4 sm:p-6">
        <h1 className="text-2xl font-bold">内容工作台</h1>
        <div className="mt-6 rounded-lg border border-destructive/20 bg-destructive/5 p-8 text-center">
          <p className="text-sm text-destructive">{state.message}</p>
          <p className="mt-2 text-xs text-muted-foreground">请联系管理员开通内容工厂功能</p>
        </div>
      </div>
    );
  }

  // ============================================================
  // Error
  // ============================================================

  if (state.status === "error") {
    return (
      <div className="p-4 sm:p-6">
        <h1 className="text-2xl font-bold">内容工作台</h1>
        <div className="mt-6 rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">{state.message}</p>
          <button
            onClick={fetchProjects}
            className="mt-3 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  // ============================================================
  // Loaded
  // ============================================================

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">内容工作台</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {state.total > 0 ? `${state.total} 个项目` : "创建内容项目，开始生成"}
          </p>
        </div>
        <button
          onClick={() => router.push("/content/new")}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          新建项目
        </button>
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="rounded-md border px-3 py-1.5 text-xs"
          aria-label="状态筛选"
        >
          <option value="">全部状态</option>
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <select
          value={platformFilter}
          onChange={e => setPlatformFilter(e.target.value)}
          className="rounded-md border px-3 py-1.5 text-xs"
          aria-label="平台筛选"
        >
          <option value="">全部平台</option>
          {Object.entries(PLATFORM_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {/* Empty state */}
      {state.projects.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed p-12 text-center">
          <p className="text-sm text-muted-foreground">暂无内容项目</p>
          <button
            onClick={() => router.push("/content/new")}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            <Plus className="h-4 w-4" />
            创建第一个项目
          </button>
        </div>
      ) : (
        /* Project list */
        <div className="mt-6 space-y-3">
          {state.projects.map(project => (
            <button
              key={project.id}
              onClick={() => router.push(`/content/${project.id}`)}
              className="w-full rounded-lg border p-4 text-left transition-colors hover:bg-muted/50"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {PLATFORM_LABELS[project.platform] ?? project.platform}
                    </span>
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                      project.status === "draft" ? "bg-yellow-100 text-yellow-700" :
                      project.status === "ready" ? "bg-blue-100 text-blue-700" :
                      project.status === "published" ? "bg-green-100 text-green-700" :
                      "bg-gray-100 text-gray-500"
                    }`}>
                      {STATUS_LABELS[project.status]}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium truncate">
                    {project.target_audience || project.content_angle || "未命名项目"}
                  </p>
                  {project.content_goal && (
                    <p className="mt-1 text-xs text-muted-foreground truncate">{project.content_goal}</p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(project.updated_at).toLocaleDateString("zh-CN")}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
