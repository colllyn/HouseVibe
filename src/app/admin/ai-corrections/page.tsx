"use client";

// ============================================================
// Admin AI Corrections Analysis Page — P3-AI-019
// Shows correction stats, feedback rates, preference effectiveness.
// ============================================================

import { useState, useEffect, useCallback } from "react";
import type { CorrectionsSummary } from "@/features/ai-corrections/schemas";

// ============================================================
// Types
// ============================================================

interface PageState {
  status: "loading" | "loaded" | "error";
  message?: string;
  summary: CorrectionsSummary | null;
}

// ============================================================
// Helpers
// ============================================================

const FEATURE_LABELS: Record<string, string> = {
  content_factory: "内容生成",
  ai_data_extraction: "AI 数据提取",
  semantic_search: "语义搜索",
  property_matching: "房源匹配",
  shared_property_pool: "共享房源池",
};

function formatPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

// ============================================================
// Page
// ============================================================

export default function AdminAiCorrectionsPage() {
  const [state, setState] = useState<PageState>({ status: "loading", summary: null });
  const [days, setDays] = useState(30);

  const fetchData = useCallback(async (d: number) => {
    setState({ status: "loading", summary: null });
    try {
      const res = await fetch(`/api/admin/ai-corrections?days=${d}`);
      const json = await res.json();
      if (!res.ok || json.error) {
        setState({ status: "error", message: json.error?.message ?? "加载失败", summary: null });
        return;
      }
      setState({ status: "loaded", summary: json.data });
    } catch {
      setState({ status: "error", message: "网络错误", summary: null });
    }
  }, []);

  useEffect(() => {
    fetchData(days);
  }, [days, fetchData]);

  // ============================================================
  // Loading state
  // ============================================================

  if (state.status === "loading") {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">AI 纠错分析</h1>
        <div className="mt-6 animate-pulse space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 rounded-lg bg-muted" />
            ))}
          </div>
          <div className="h-64 rounded-lg bg-muted" />
        </div>
      </div>
    );
  }

  // ============================================================
  // Error state
  // ============================================================

  if (state.status === "error") {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">AI 纠错分析</h1>
        <div className="mt-6 rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">{state.message}</p>
          <button
            onClick={() => fetchData(days)}
            className="mt-3 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  // ============================================================
  // Loaded state
  // ============================================================

  const s = state.summary;
  if (!s) return null;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">AI 纠错分析</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        查看 AI 输出纠错趋势、高频被修改字段与用户反馈分析。
      </p>

      {/* ================================================================
          Period selector
          ================================================================ */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors first:rounded-l-md last:rounded-r-md ${
                days === d ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
              }`}
            >
              近 {d} 天
            </button>
          ))}
        </div>
      </div>

      {/* ================================================================
          Summary stat cards
          ================================================================ */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="总纠错次数"
          value={String(s.totals.total_corrections)}
          detail={`${s.totals.active_users} 位活跃用户`}
        />
        <StatCard
          label="涉及实体"
          value={String(s.totals.affected_entities)}
          detail={`${s.totals.feedback_count} 条反馈`}
        />
        <StatCard
          label="平均评分"
          value={s.totals.avg_feedback_score.toFixed(2)}
          detail={`负反馈 ${s.totals.negative_feedback_count} 条 (${s.totals.negative_feedback_users} 人)`}
        />
        <StatCard
          label="负反馈率"
          value={
            s.totals.feedback_count > 0
              ? formatPct((s.totals.negative_feedback_count / s.totals.feedback_count) * 100)
              : "—"
          }
          detail={s.totals.feedback_count > 0 ? `${s.totals.negative_feedback_count}/${s.totals.feedback_count}` : "暂无反馈"}
        />
      </div>

      {/* ================================================================
          Top corrected fields
          ================================================================ */}
      <div className="mt-6">
        <h2 className="text-lg font-semibold">高频被修改字段</h2>
        {s.topCorrectedFields.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">暂无纠错数据</p>
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2 text-left font-medium">字段</th>
                  <th className="px-4 py-2 text-right font-medium">修改次数</th>
                  <th className="px-4 py-2 text-left font-medium">最后修改时间</th>
                </tr>
              </thead>
              <tbody>
                {s.topCorrectedFields.map((f) => (
                  <tr key={f.field} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2 font-mono text-xs">{f.field}</td>
                    <td className="px-4 py-2 text-right">{f.count}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {f.lastCorrectedAt ? new Date(f.lastCorrectedAt).toLocaleDateString("zh-CN") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ================================================================
          Value mappings (original → corrected)
          ================================================================ */}
      {s.valueMappings.length > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold">常见值修正映射</h2>
          <div className="mt-3 space-y-3">
            {s.valueMappings.map((m) => (
              <div key={m.field} className="rounded-lg border p-4">
                <h3 className="text-sm font-semibold font-mono">{m.field}</h3>
                <div className="mt-2 space-y-1">
                  {m.examples.slice(0, 5).map((ex, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="rounded bg-red-50 px-2 py-0.5 text-red-700 line-through font-mono">
                        {ex.originalValue ?? "—"}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <span className="rounded bg-green-50 px-2 py-0.5 text-green-700 font-mono">
                        {ex.correctedValue ?? "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================================================================
          Feedback by feature
          ================================================================ */}
      <div className="mt-6">
        <h2 className="text-lg font-semibold">各功能负反馈率</h2>
        {s.feedbackByFeature.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">暂无反馈数据</p>
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2 text-left font-medium">功能</th>
                  <th className="px-4 py-2 text-right font-medium">总纠错</th>
                  <th className="px-4 py-2 text-right font-medium">有反馈</th>
                  <th className="px-4 py-2 text-right font-medium">负反馈</th>
                  <th className="px-4 py-2 text-right font-medium">负反馈率</th>
                  <th className="px-4 py-2 text-right font-medium">均分</th>
                </tr>
              </thead>
              <tbody>
                {s.feedbackByFeature.map((f) => (
                  <tr key={f.feature} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2 font-medium">
                      {FEATURE_LABELS[f.feature] ?? f.feature}
                    </td>
                    <td className="px-4 py-2 text-right">{f.total}</td>
                    <td className="px-4 py-2 text-right">{f.withFeedback}</td>
                    <td className="px-4 py-2 text-right text-red-600">{f.negativeFeedback}</td>
                    <td className="px-4 py-2 text-right">{formatPct(f.negativeRate)}</td>
                    <td className="px-4 py-2 text-right">{f.avgScore.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ================================================================
          Correction rate by prompt version
          ================================================================ */}
      <div className="mt-6">
        <h2 className="text-lg font-semibold">各 Prompt 版本纠错率</h2>
        {s.correctionByPrompt.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">暂无数据</p>
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2 text-left font-medium">Prompt 版本</th>
                  <th className="px-4 py-2 text-right font-medium">总纠错</th>
                  <th className="px-4 py-2 text-right font-medium">用户数</th>
                  <th className="px-4 py-2 text-right font-medium">均字段修改</th>
                </tr>
              </thead>
              <tbody>
                {s.correctionByPrompt.map((p) => (
                  <tr key={p.promptVersion} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2 font-mono text-xs">v{p.promptVersion}</td>
                    <td className="px-4 py-2 text-right">{p.totalCorrections}</td>
                    <td className="px-4 py-2 text-right">{p.uniqueUsers}</td>
                    <td className="px-4 py-2 text-right">{p.avgFieldsChanged}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ================================================================
          Preference effectiveness
          ================================================================ */}
      <div className="mt-6">
        <h2 className="text-lg font-semibold">用户偏好学习效果</h2>
        {s.preferenceEffectiveness.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">暂无数据</p>
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2 text-left font-medium">有偏好设置</th>
                  <th className="px-4 py-2 text-right font-medium">用户数</th>
                  <th className="px-4 py-2 text-right font-medium">人均纠错</th>
                  <th className="px-4 py-2 text-right font-medium">均反馈分</th>
                </tr>
              </thead>
              <tbody>
                {s.preferenceEffectiveness.map((p, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2 font-medium">
                      {p.hasPreferences ? "是" : "否"}
                    </td>
                    <td className="px-4 py-2 text-right">{p.userCount}</td>
                    <td className="px-4 py-2 text-right">{p.avgCorrectionsPerUser}</td>
                    <td className="px-4 py-2 text-right">{p.avgFeedbackScore.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Stat card sub-component
// ============================================================

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-bold">{value}</dd>
      <dd className="mt-1 text-xs text-muted-foreground">{detail}</dd>
    </div>
  );
}
