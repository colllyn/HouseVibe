"use client";

// ============================================================
// Content Project Detail Page — P3-AI-021
// /content/[id] — View project, generate AI content, manage versions
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Loader2, Sparkles, Save, Trash2, Check, X,
  ThumbsUp, ThumbsDown, ChevronDown, ChevronUp, Copy, AlertTriangle,
} from "lucide-react";
import type { ContentProject, ContentVersion } from "@/features/content-projects/schemas";
import {
  PLATFORM_LABELS, STATUS_LABELS,
} from "@/features/content-projects/schemas";

// ============================================================
// Types
// ============================================================

interface ProjectState {
  status: "loading" | "loaded" | "error" | "denied" | "not_found";
  message?: string;
  project: ContentProject | null;
  versions: ContentVersion[];
}

interface GenerateState {
  status: "idle" | "loading" | "done" | "error";
  message?: string;
  result?: GenerateResult | null;
}

interface GenerateResult {
  platform: string;
  output: Record<string, unknown>;
  copyAllowed: boolean;
  complianceStatus: string;
  model: string | null;
  requestId: string;
}

interface VersionState {
  loading: boolean;
  error: string | null;
}

// ============================================================
// Helpers
// ============================================================

function complianceLabel(status: string): string {
  switch (status) {
    case "clean": return "合规";
    case "review_required": return "需审核";
    case "blocked": return "已拦截";
    default: return status;
  }
}

function complianceColor(status: string): string {
  switch (status) {
    case "clean": return "bg-green-100 text-green-700";
    case "review_required": return "bg-yellow-100 text-yellow-700";
    case "blocked": return "bg-red-100 text-red-700";
    default: return "bg-gray-100 text-gray-500";
  }
}

// ============================================================
// Page Component
// ============================================================

export default function ContentDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [projectState, setProjectState] = useState<ProjectState>({
    status: "loading", project: null, versions: [],
  });
  const [generate, setGenerate] = useState<GenerateState>({ status: "idle" });
  const [versionState, setVersionState] = useState<VersionState>({ loading: false, error: null });
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editStatus, setEditStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // ============================================================
  // Fetch project + versions
  // ============================================================

  const fetchProject = useCallback(async () => {
    setProjectState(s => ({ ...s, status: "loading" }));
    try {
      const res = await fetch(`/api/content/projects/${id}`);
      const json = await res.json();

      if (!res.ok) {
        if (json.error?.code === "FEATURE_DENIED") {
          setProjectState({ status: "denied", message: json.error.message, project: null, versions: [] });
          return;
        }
        if (res.status === 404) {
          setProjectState({ status: "not_found", message: "项目不存在", project: null, versions: [] });
          return;
        }
        setProjectState({ status: "error", message: json.error?.message ?? "加载失败", project: null, versions: [] });
        return;
      }

      const project = json.data as ContentProject;

      // Fetch versions
      let versions: ContentVersion[] = [];
      try {
        const vRes = await fetch(`/api/content/projects/${id}/versions`);
        const vJson = await vRes.json();
        if (vRes.ok) versions = vJson.data ?? [];
      } catch { /* versions optional */ }

      setProjectState({ status: "loaded", project, versions });
    } catch {
      setProjectState({ status: "error", message: "网络错误", project: null, versions: [] });
    }
  }, [id]);

  useEffect(() => { fetchProject(); }, [fetchProject]);

  // ============================================================
  // Generate content
  // ============================================================

  const handleGenerate = async () => {
    const project = projectState.project;
    if (!project) return;

    setGenerate({ status: "loading" });
    try {
      const idempotencyKey = crypto.randomUUID();
      const res = await fetch("/api/ai/generate-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: project.property_id,
          platform: project.platform,
          targetAudience: project.target_audience ?? undefined,
          contentAngle: project.content_angle ?? undefined,
          contentGoal: project.content_goal ?? undefined,
          tone: project.tone ?? undefined,
          idempotencyKey,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setGenerate({
          status: "error",
          message: json.error?.message ?? "生成失败",
        });
        return;
      }

      setGenerate({
        status: "done",
        result: json.data as GenerateResult,
      });
    } catch {
      setGenerate({ status: "error", message: "网络错误" });
    }
  };

  // ============================================================
  // Save generated content as version
  // ============================================================

  const handleSaveVersion = async () => {
    if (!generate.result) return;

    setVersionState({ loading: true, error: null });
    try {
      // Save the generated output as a new version
      const res = await fetch(`/api/content/projects/${id}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model_name: generate.result.model ?? "deepseek",
          prompt_version: "1.0.0",
          input_snapshot: {
            platform: generate.result.platform,
            property_id: projectState.project?.property_id,
          },
          output_json: generate.result.output,
          facts_used: (generate.result.output as Record<string, unknown>).factsUsed ?? [],
          missing_information: (generate.result.output as Record<string, unknown>).missingInformation ?? [],
          risk_flags: (generate.result.output as Record<string, unknown>).riskFlags ?? [],
          compliance_status: generate.result.complianceStatus,
          compliance_flags: (generate.result.output as Record<string, unknown>).complianceFlags ?? [],
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setVersionState({ loading: false, error: json.error?.message ?? "保存失败" });
        return;
      }

      setVersionState({ loading: false, error: null });
      setGenerate({ status: "idle" });
      // Refresh project and versions
      await fetchProject();
    } catch {
      setVersionState({ loading: false, error: "网络错误" });
    }
  };

  // ============================================================
  // Update status
  // ============================================================

  const handleUpdateStatus = async (newStatus: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/content/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setEditing(false);
        await fetchProject();
      }
    } catch { /* ignore */ }
    setSaving(false);
  };

  // ============================================================
  // Soft delete
  // ============================================================

  const handleDelete = async () => {
    if (!confirm("确定要删除此内容项目吗？")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/content/projects/${id}`, { method: "DELETE" });
      if (res.ok) router.push("/content");
    } catch { /* ignore */ }
    setSaving(false);
  };

  // ============================================================
  // Copy content text
  // ============================================================

  const handleCopyContent = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  // ============================================================
  // Loading state
  // ============================================================

  if (projectState.status === "loading") {
    return (
      <div className="p-4 sm:p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-muted" />
          <div className="h-40 rounded-lg bg-muted" />
          <div className="h-60 rounded-lg bg-muted" />
        </div>
      </div>
    );
  }

  // ============================================================
  // Error / Denied / Not Found states
  // ============================================================

  if (projectState.status === "denied") {
    return (
      <div className="p-4 sm:p-6">
        <h1 className="text-2xl font-bold">内容项目</h1>
        <div className="mt-6 rounded-lg border border-destructive/20 bg-destructive/5 p-8 text-center">
          <p className="text-sm text-destructive">{projectState.message}</p>
          <button onClick={() => router.push("/content")} className="mt-3 text-sm text-primary">
            返回内容工作台
          </button>
        </div>
      </div>
    );
  }

  if (projectState.status === "not_found") {
    return (
      <div className="p-4 sm:p-6">
        <h1 className="text-2xl font-bold">内容项目</h1>
        <div className="mt-6 rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">项目不存在或已被删除</p>
          <button onClick={() => router.push("/content")} className="mt-3 text-sm text-primary">
            返回内容工作台
          </button>
        </div>
      </div>
    );
  }

  if (projectState.status === "error") {
    return (
      <div className="p-4 sm:p-6">
        <h1 className="text-2xl font-bold">内容项目</h1>
        <div className="mt-6 rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">{projectState.message}</p>
          <button onClick={fetchProject} className="mt-3 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">
            重试
          </button>
        </div>
      </div>
    );
  }

  // ============================================================
  // Loaded state
  // ============================================================

  const project = projectState.project;
  if (!project) return null;

  return (
    <div className="p-4 sm:p-6 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/content")}
          className="rounded-md p-1 hover:bg-muted"
          aria-label="返回"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">
            {project.target_audience || project.content_angle || "内容项目"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Status badge */}
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${
            project.status === "draft" ? "bg-yellow-100 text-yellow-700" :
            project.status === "ready" ? "bg-blue-100 text-blue-700" :
            project.status === "published" ? "bg-green-100 text-green-700" :
            "bg-gray-100 text-gray-500"
          }`}>
            {STATUS_LABELS[project.status]}
          </span>
          {/* Platform badge */}
          <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {PLATFORM_LABELS[project.platform]}
          </span>
          {/* Delete */}
          <button
            onClick={handleDelete}
            disabled={saving}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            aria-label="删除"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Project info */}
      <div className="mt-4 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">项目信息</h2>
          {!editing ? (
            <button
              onClick={() => { setEditing(true); setEditStatus(project.status); }}
              className="text-xs text-primary hover:underline"
            >
              管理状态
            </button>
          ) : null}
        </div>

        {editing ? (
          <div className="mt-3 flex items-center gap-2">
            <select
              value={editStatus}
              onChange={e => setEditStatus(e.target.value)}
              className="rounded-md border px-2 py-1 text-xs"
            >
              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <button
              onClick={() => handleUpdateStatus(editStatus)}
              disabled={saving || editStatus === project.status}
              className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground disabled:opacity-50"
            >
              {saving ? "保存中..." : "确认"}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded-md border px-3 py-1 text-xs"
            >
              取消
            </button>
          </div>
        ) : (
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
            {project.content_goal && (
              <>
                <dt className="text-muted-foreground">内容目标</dt>
                <dd>{project.content_goal}</dd>
              </>
            )}
            {project.tone && (
              <>
                <dt className="text-muted-foreground">语气风格</dt>
                <dd>{project.tone}</dd>
              </>
            )}
            {project.content_angle && (
              <>
                <dt className="text-muted-foreground">内容角度</dt>
                <dd>{project.content_angle}</dd>
              </>
            )}
            {project.private_message_keyword && (
              <>
                <dt className="text-muted-foreground">私信口令</dt>
                <dd className="font-mono">{project.private_message_keyword}</dd>
              </>
            )}
          </dl>
        )}
      </div>

      {/* Generate content section */}
      <div className="mt-4 rounded-lg border p-4">
        <h2 className="text-sm font-medium">AI 内容生成</h2>

        {/* Generate trigger */}
        {generate.status === "idle" && (
          <div className="mt-3">
            <p className="text-xs text-muted-foreground">
              基于选定房源信息，为 {PLATFORM_LABELS[project.platform]} 平台生成营销内容
            </p>
            <button
              onClick={handleGenerate}
              className="mt-3 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Sparkles className="h-4 w-4" />
              生成内容
            </button>
          </div>
        )}

        {/* Generating */}
        {generate.status === "loading" && (
          <div className="mt-3 flex items-center gap-3 rounded-lg bg-muted/50 p-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <div>
              <p className="text-sm">AI 正在生成内容...</p>
              <p className="text-xs text-muted-foreground">这可能需要 10-30 秒</p>
            </div>
          </div>
        )}

        {/* Generated content */}
        {generate.status === "done" && generate.result && (
          <div className="mt-3 space-y-3">
            {/* Compliance status */}
            <div className="flex items-center gap-2">
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${complianceColor(generate.result.complianceStatus)}`}>
                {complianceLabel(generate.result.complianceStatus)}
              </span>
              {!generate.result.copyAllowed && (
                <span className="inline-flex items-center gap-1 text-xs text-destructive">
                  <AlertTriangle className="h-3 w-3" />
                  需审核后复制
                </span>
              )}
            </div>

            {/* Content preview */}
            <div className="rounded-lg bg-muted/30 p-4 max-h-96 overflow-y-auto">
              <GeneratedContentPreview
                output={generate.result.output}
                platform={project.platform}
              />
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleSaveVersion}
                disabled={versionState.loading}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {versionState.loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                保存为版本
              </button>

              {generate.result.copyAllowed && (
                <button
                  onClick={() => handleCopyContent(JSON.stringify(generate.result?.output, null, 2))}
                  className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "已复制" : "复制内容"}
                </button>
              )}

              <button
                onClick={() => setGenerate({ status: "idle" })}
                className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
              >
                <X className="h-3.5 w-3.5" />
                丢弃
              </button>
            </div>

            {versionState.error && (
              <p className="text-xs text-destructive">{versionState.error}</p>
            )}
          </div>
        )}

        {/* Generate error */}
        {generate.status === "error" && (
          <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
            <p className="text-sm text-destructive">{generate.message}</p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={handleGenerate}
                className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground"
              >
                重试
              </button>
              <button
                onClick={() => setGenerate({ status: "idle" })}
                className="rounded-md border px-3 py-1 text-xs"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Version history */}
      <div className="mt-4 rounded-lg border p-4">
        <h2 className="text-sm font-medium">
          版本历史
          {projectState.versions.length > 0 && (
            <span className="ml-2 text-xs text-muted-foreground">
              ({projectState.versions.length})
            </span>
          )}
        </h2>

        {projectState.versions.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            暂无保存的版本。生成内容后点击“保存为版本”即可在此查看。
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {projectState.versions.map((v) => {
              const isExpanded = expandedVersion === v.id;
              const modelString = typeof v.output_json === "object" ? JSON.stringify(v.output_json) : String(v.output_json ?? "");

              return (
                <div key={v.id} className="rounded-lg border">
                  <button
                    onClick={() => setExpandedVersion(isExpanded ? null : v.id)}
                    className="flex w-full items-center justify-between p-3 text-left hover:bg-muted/50"
                  >
                    <div>
                      <span className="text-sm font-medium">版本 {v.version_number}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {new Date(v.created_at).toLocaleString("zh-CN")}
                      </span>
                      <span className={`ml-2 rounded px-1.5 py-0.5 text-xs ${complianceColor(v.compliance_status)}`}>
                        {complianceLabel(v.compliance_status)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Feedback */}
                      {v.feedback_score === 1 && <ThumbsUp className="h-3.5 w-3.5 text-green-600" />}
                      {v.feedback_score === -1 && <ThumbsDown className="h-3.5 w-3.5 text-destructive" />}
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t p-3">
                      <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
                        {modelString.length > 2000 ? modelString.slice(0, 2000) + "\n\n... (内容已截断)" : modelString}
                      </pre>
                      <div className="mt-2 flex items-center gap-2">
                        {v.compliance_status === "blocked" ? (
                          <button
                            onClick={() => {
                              if (confirm("此版本存在高风险合规标记，确定要复制内容吗？")) {
                                handleCopyContent(modelString);
                              }
                            }}
                            className="inline-flex items-center gap-1 rounded border border-destructive/30 bg-destructive/5 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                            title="高风险合规标记 — 复制前需人工确认"
                          >
                            <Copy className="h-3 w-3" />
                            复制（需确认）
                          </button>
                        ) : (
                          <button
                            onClick={() => handleCopyContent(modelString)}
                            className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-muted"
                          >
                            <Copy className="h-3 w-3" />
                            复制
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Content Preview Component (by platform)
// ============================================================

function GeneratedContentPreview({
  output,
  platform,
}: {
  output: Record<string, unknown>;
  platform: string;
}) {
  if (platform === "xiaohongshu") {
    return (
      <div className="space-y-3 text-xs">
        {Array.isArray(output.titleOptions) && (
          <div>
            <span className="font-medium text-muted-foreground">标题选项：</span>
            {(output.titleOptions as string[]).map((t, i) => (
              <span key={i} className="ml-2 rounded bg-primary/5 px-1.5 py-0.5">
                {t}
              </span>
            ))}
          </div>
        )}
        {Boolean(output.hook) && (
          <div>
            <span className="font-medium text-muted-foreground">Hook：</span>
            <p className="mt-1">{String(output.hook)}</p>
          </div>
        )}
        {Boolean(output.body) && (
          <div>
            <span className="font-medium text-muted-foreground">正文：</span>
            <p className="mt-1 whitespace-pre-wrap">{String(output.body)}</p>
          </div>
        )}
        {Boolean(output.coverText) && (
          <p className="text-muted-foreground">封面文字：{String(output.coverText)}</p>
        )}
        {Boolean(output.factualSummary) && (
          <p className="text-muted-foreground">事实摘要：{String(output.factualSummary)}</p>
        )}
        {Array.isArray(output.hashtags) && (
          <p className="text-primary">
            {(output.hashtags as string[]).map(h => `#${h}`).join(" ")}
          </p>
        )}
      </div>
    );
  }

  if (platform === "douyin") {
    return (
      <div className="space-y-3 text-xs">
        {Array.isArray(output.hookOptions) && (
          <div>
            <span className="font-medium text-muted-foreground">Hook 选项：</span>
            {(output.hookOptions as string[]).map((h, i) => (
              <span key={i} className="ml-2 rounded bg-primary/5 px-1.5 py-0.5">{h}</span>
            ))}
          </div>
        )}
        {Boolean(output.fullVoiceover) && (
          <div>
            <span className="font-medium text-muted-foreground">完整口播：</span>
            <p className="mt-1 whitespace-pre-wrap">{String(output.fullVoiceover)}</p>
          </div>
        )}
        {Boolean(output.caption) && <p className="text-muted-foreground">标题文案：{String(output.caption)}</p>}
        {Boolean(output.subtitles) && <p className="text-muted-foreground">字幕：{String(output.subtitles)}</p>}
      </div>
    );
  }

  // wechat_moments or fallback
  return (
    <div className="space-y-3 text-xs">
      {Array.isArray(output.copyOptions) && (
        <div>
          <span className="font-medium text-muted-foreground">文案选项：</span>
          {(output.copyOptions as string[]).map((c, i) => (
            <p key={i} className="mt-1 rounded bg-primary/5 p-2">{c}</p>
          ))}
        </div>
      )}
      {Boolean(output.nineGridSuggestion) && (
        <p className="text-muted-foreground">九宫格建议：{String(output.nineGridSuggestion)}</p>
      )}
    </div>
  );
}
