"use client";

// ============================================================
// Publishing Records Page — P3-AI-021
// /publishing — List, create, and update publishing records
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { Plus, Filter, ExternalLink, Edit2, Check, X, ChevronDown, ChevronUp } from "lucide-react";
import type { PublishingRecord, ContentProject } from "@/features/content-projects/schemas";
import { PLATFORM_LABELS } from "@/features/content-projects/schemas";

// ============================================================
// Types
// ============================================================

interface PageState {
  status: "loading" | "loaded" | "error" | "denied";
  message?: string;
  records: PublishingRecord[];
  projects: ContentProject[];
}

type FormMode = "idle" | "create" | "edit";

// ============================================================
// Platform badge color
// ============================================================

function platformBadge(platform: string) {
  const colors: Record<string, string> = {
    xiaohongshu: "bg-rose-100 text-rose-700",
    douyin: "bg-gray-100 text-gray-700",
    wechat_moments: "bg-green-100 text-green-700",
  };
  return colors[platform] ?? "bg-muted text-muted-foreground";
}

function platformLabel(p: string) {
  return PLATFORM_LABELS[p as keyof typeof PLATFORM_LABELS] ?? p;
}

function formatMetric(n: number | null | undefined) {
  if (n == null || n === 0) return "-";
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return n.toLocaleString("zh-CN");
}

// ============================================================
// Page
// ============================================================

export default function PublishingPage() {
  const [state, setState] = useState<PageState>({ status: "loading", records: [], projects: [] });
  const [platformFilter, setPlatformFilter] = useState<string>("");
  const [expandedRecord, setExpandedRecord] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<FormMode>("idle");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Create form state
  const [form, setForm] = useState({
    content_project_id: "",
    content_version_id: "",
    platform: "xiaohongshu",
    published_at: new Date().toISOString().slice(0, 16),
    post_url: "",
    content_code: "",
    private_message_keyword: "",
  });

  // Edit metrics state
  const [editMetrics, setEditMetrics] = useState<Record<string, number>>({});

  // ============================================================
  // Fetch data
  // ============================================================

  const fetchData = useCallback(async () => {
    setState(s => ({ ...s, status: "loading" }));
    try {
      // Fetch recent publishing records from the first few projects
      // For a global list, we query the first 50 records across all projects
      const params = new URLSearchParams({ limit: "50" });
      if (platformFilter) params.set("platform", platformFilter);

      // Get all content projects first, then aggregate their publishing records
      const projectsRes = await fetch(`/api/content/projects?limit=100`);
      if (!projectsRes.ok) {
        if (projectsRes.status === 403) {
          const body = await projectsRes.json();
          if (body?.error?.code === "FEATURE_DENIED") {
            setState(s => ({ ...s, status: "denied", message: body.error.message, records: [], projects: [] }));
            return;
          }
        }
        setState(s => ({ ...s, status: "error", message: "加载内容项目失败", records: [], projects: [] }));
        return;
      }
      const projectsJson = await projectsRes.json();
      const projects: ContentProject[] = projectsJson.data ?? [];

      // Fetch publishing records for each project
      const allRecords: PublishingRecord[] = [];
      for (const p of projects) {
        const pubParams = new URLSearchParams();
        if (platformFilter) pubParams.set("platform", platformFilter);
        const pubRes = await fetch(`/api/content/projects/${p.id}/publishing?${pubParams}`);
        if (pubRes.ok) {
          const pubJson = await pubRes.json();
          allRecords.push(...(pubJson.data ?? []));
        }
      }

      setState({ status: "loaded", records: allRecords, projects });
    } catch {
      setState(s => ({ ...s, status: "error", message: "网络错误", records: [], projects: [] }));
    }
  }, [platformFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ============================================================
  // Reset form
  // ============================================================

  const resetForm = () => {
    setForm({
      content_project_id: "",
      content_version_id: "",
      platform: "xiaohongshu",
      published_at: new Date().toISOString().slice(0, 16),
      post_url: "",
      content_code: "",
      private_message_keyword: "",
    });
    setFormMode("idle");
  };

  // ============================================================
  // Create record
  // ============================================================

  const handleCreate = async () => {
    if (!form.content_project_id || !form.content_version_id) return;
    setSaving(true);
    setSaveError(null);
    try {
      const body: Record<string, unknown> = {
        content_version_id: form.content_version_id,
        platform: form.platform,
        published_at: new Date(form.published_at).toISOString(),
      };
      if (form.post_url) body.post_url = form.post_url;
      if (form.content_code) body.content_code = form.content_code;
      if (form.private_message_keyword) body.private_message_keyword = form.private_message_keyword;

      const res = await fetch(`/api/content/projects/${form.content_project_id}/publishing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        resetForm();
        await fetchData();
      } else {
        const json = await res.json().catch(() => null);
        setSaveError(json?.error?.message ?? "保存失败，请重试");
      }
    } catch {
      setSaveError("网络错误，请重试");
    }
    setSaving(false);
  };

  // ============================================================
  // Update metrics
  // ============================================================

  const handleUpdateMetrics = async (recordId: string, projectId: string) => {
    if (Object.keys(editMetrics).length === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/content/projects/${projectId}/publishing/${recordId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editMetrics),
      });
      if (res.ok) {
        setEditingId(null);
        setEditMetrics({});
        await fetchData();
      } else {
        const json = await res.json().catch(() => null);
        setSaveError(json?.error?.message ?? "更新失败，请重试");
      }
    } catch {
      setSaveError("网络错误，请重试");
    }
    setSaving(false);
  };

  // ============================================================
  // Get versions for a project (used in create form)
  // ============================================================

  const [versions, setVersions] = useState<Array<{ id: string; version_number: number }>>([]);

  const loadVersions = async (projectId: string) => {
    if (!projectId) { setVersions([]); return; }
    try {
      const res = await fetch(`/api/content/projects/${projectId}/versions`);
      if (res.ok) {
        const json = await res.json();
        setVersions(json.data ?? []);
      }
    } catch { setVersions([]); }
  };

  // ============================================================
  // Loading
  // ============================================================

  if (state.status === "loading") {
    return (
      <div className="mx-auto max-w-4xl p-4 pb-24">
        <h1 className="text-lg font-semibold">发布记录</h1>
        <div className="mt-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  // ============================================================
  // Denied
  // ============================================================

  if (state.status === "denied") {
    return (
      <div className="mx-auto max-w-4xl p-4 pb-24">
        <h1 className="text-lg font-semibold">发布记录</h1>
        <div className="mt-12 text-center">
          <p className="text-muted-foreground">{state.message ?? "需要内容工厂权限"}</p>
        </div>
      </div>
    );
  }

  // ============================================================
  // Error
  // ============================================================

  if (state.status === "error") {
    return (
      <div className="mx-auto max-w-4xl p-4 pb-24">
        <h1 className="text-lg font-semibold">发布记录</h1>
        <div className="mt-12 text-center">
          <p className="text-sm text-destructive">{state.message ?? "加载失败"}</p>
          <button onClick={fetchData} className="mt-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">
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
    <div className="mx-auto max-w-4xl p-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">发布记录</h1>
        <button
          onClick={() => setFormMode("create")}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
        >
          <Plus className="h-4 w-4" />
          添加记录
        </button>
      </div>

      {/* Filters */}
      <div className="mt-4 flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <select
          aria-label="平台筛选"
          value={platformFilter}
          onChange={e => setPlatformFilter(e.target.value)}
          className="rounded-md border px-2 py-1 text-sm"
        >
          <option value="">全部平台</option>
          <option value="xiaohongshu">小红书</option>
          <option value="douyin">抖音</option>
          <option value="wechat_moments">微信朋友圈</option>
        </select>
      </div>

      {/* Create form */}
      {formMode === "create" && (
        <div className="mt-4 rounded-lg border p-4">
          <h2 className="text-sm font-medium">添加发布记录</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs text-muted-foreground">内容项目</span>
              <select
                value={form.content_project_id}
                onChange={e => { setForm(f => ({ ...f, content_project_id: e.target.value, content_version_id: "" })); loadVersions(e.target.value); }}
                className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
                required
              >
                <option value="">请选择项目</option>
                {state.projects.map(p => (
                  <option key={p.id} value={p.id}>{p.content_angle ?? p.target_audience ?? p.platform} ({p.id.slice(0, 8)})</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs text-muted-foreground">版本</span>
              <select
                value={form.content_version_id}
                onChange={e => setForm(f => ({ ...f, content_version_id: e.target.value }))}
                className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
                required
                disabled={!form.content_project_id}
              >
                <option value="">请选择版本</option>
                {versions.map(v => (
                  <option key={v.id} value={v.id}>版本 {v.version_number}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs text-muted-foreground">平台</span>
              <select
                value={form.platform}
                onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
                className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
              >
                <option value="xiaohongshu">小红书</option>
                <option value="douyin">抖音</option>
                <option value="wechat_moments">微信朋友圈</option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs text-muted-foreground">发布时间</span>
              <input
                type="datetime-local"
                value={form.published_at}
                onChange={e => setForm(f => ({ ...f, published_at: e.target.value }))}
                className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
                required
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="text-xs text-muted-foreground">帖子链接（可选）</span>
              <input
                type="url"
                value={form.post_url}
                onChange={e => setForm(f => ({ ...f, post_url: e.target.value }))}
                placeholder="https://..."
                className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
              />
            </label>

            <label className="block">
              <span className="text-xs text-muted-foreground">内容编码（可选）</span>
              <input
                value={form.content_code}
                onChange={e => setForm(f => ({ ...f, content_code: e.target.value }))}
                placeholder="如：DM123"
                className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
              />
            </label>

            <label className="block">
              <span className="text-xs text-muted-foreground">私信口令（可选）</span>
              <input
                value={form.private_message_keyword}
                onChange={e => setForm(f => ({ ...f, private_message_keyword: e.target.value }))}
                placeholder="如：看房666"
                className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
              />
            </label>
          </div>

          {saveError && (
            <p className="mt-3 text-xs text-destructive">{saveError}</p>
          )}
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleCreate}
              disabled={saving || !form.content_project_id || !form.content_version_id}
              className="rounded-md bg-primary px-4 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
            >
              {saving ? "保存中..." : "保存"}
            </button>
            <button onClick={resetForm} className="rounded-md border px-4 py-1.5 text-sm">取消</button>
          </div>
        </div>
      )}

      {/* Records list */}
      <div className="mt-6 space-y-3">
        {state.records.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            暂无发布记录。点击&ldquo;添加记录&rdquo;录入第一条发布数据。
          </p>
        ) : (
          state.records.map(record => {
            const isExpanded = expandedRecord === record.id;
            const isEditing = editingId === record.id;

            return (
              <div key={record.id} className="rounded-lg border">
                {/* Header */}
                <button
                  onClick={() => setExpandedRecord(isExpanded ? null : record.id)}
                  className="flex w-full items-center justify-between p-3 text-left hover:bg-muted/50"
                >
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${platformBadge(record.platform)}`}>
                      {platformLabel(record.platform)}
                    </span>
                    <span className="text-sm">
                      {new Date(record.published_at).toLocaleDateString("zh-CN")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {record.post_url && <ExternalLink className="h-3 w-3" />}
                    <span>{formatMetric(record.views)} 阅读</span>
                    <span>{formatMetric(record.qualified_leads)} 咨询</span>
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t p-3">
                    {record.content_code && (
                      <p className="text-xs text-muted-foreground">编码：{record.content_code}</p>
                    )}
                    {record.private_message_keyword && (
                      <p className="text-xs text-muted-foreground">口令：{record.private_message_keyword}</p>
                    )}
                    {record.post_url && (
                      <a href={record.post_url} target="_blank" rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        <ExternalLink className="h-3 w-3" /> 查看原帖
                      </a>
                    )}

                    {/* Metrics grid */}
                    <div className="mt-3 grid grid-cols-4 gap-2">
                      {([
                        ["阅读", "views"], ["点赞", "likes"], ["收藏", "favorites"], ["评论", "comments"],
                        ["私信", "direct_messages"], ["咨询", "qualified_leads"], ["带看", "viewings"], ["成交", "deals"],
                      ] as Array<[string, keyof PublishingRecord]>).map(([label, key]) => {
                        const recordVal = (record as Record<string, unknown>)[key as string] as number;
                        return (
                          <div key={key as string} className="rounded-md bg-muted/50 p-2 text-center">
                            <div className="text-xs text-muted-foreground">{label}</div>
                            {isEditing ? (
                              <input
                                type="number"
                                min={0}
                                defaultValue={recordVal}
                                onChange={e => setEditMetrics(m => ({ ...m, [key as string]: parseInt(e.target.value) || 0 }))}
                                className="mt-1 w-full rounded border px-1 py-0.5 text-center text-sm"
                                aria-label={label}
                              />
                            ) : (
                              <div className="text-sm font-medium">{formatMetric(recordVal)}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Actions */}
                    <div className="mt-3 flex gap-2">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => handleUpdateMetrics(record.id, record.content_project_id)}
                            disabled={saving}
                            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground"
                          >
                            <Check className="h-3 w-3" /> 保存
                          </button>
                          <button
                            onClick={() => { setEditingId(null); setEditMetrics({}); }}
                            className="inline-flex items-center gap-1 rounded-md border px-3 py-1 text-xs"
                          >
                            <X className="h-3 w-3" /> 取消
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setEditingId(record.id)}
                          className="inline-flex items-center gap-1 rounded-md border px-3 py-1 text-xs hover:bg-muted"
                        >
                          <Edit2 className="h-3 w-3" /> 编辑数据
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Bottom padding for mobile nav */}
      <div className="h-16" />
    </div>
  );
}
