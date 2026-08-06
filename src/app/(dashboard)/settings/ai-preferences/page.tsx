"use client";

/**
 * AI Preferences Settings Page — P3-AI-013
 *
 * Displays learned AI preferences with toggle and delete controls.
 * Lists preferences by confidence (high → low) with evidence count.
 */

import { useEffect, useState, useCallback } from "react";
import type { UserPreference } from "@/features/ai-preferences/schemas";

// ============================================================
// Types
// ============================================================

type PageState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty" }
  | { status: "loaded"; preferences: UserPreference[] };

// ============================================================
// Feature label mapping
// ============================================================

const FEATURE_LABELS: Record<string, string> = {
  ai_data_extraction: "AI 数据提取",
  semantic_search: "语义搜索",
  property_matching: "房客匹配",
  shared_property_pool: "共享房源库",
  content_factory: "内容工厂",
};

// ============================================================
// Component
// ============================================================

export default function AiPreferencesPage() {
  const [state, setState] = useState<PageState>({ status: "loading" });
  const [errorIds, setErrorIds] = useState<Set<string>>(new Set());

  const fetchPreferences = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/me/ai-preferences");
      const json = await res.json();

      if (!res.ok || json.error) {
        setState({
          status: "error",
          message: json.error?.message ?? "加载失败",
        });
        return;
      }

      const prefs = (json.data as UserPreference[]) ?? [];
      if (prefs.length === 0) {
        setState({ status: "empty" });
        return;
      }

      setState({ status: "loaded", preferences: prefs });
    } catch {
      setState({ status: "error", message: "网络错误，请重试" });
    }
  }, []);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  const handleToggle = async (id: string, currentStatus: string) => {
    setErrorIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    const newStatus = currentStatus === "active" ? "disabled" : "active";
    try {
      const res = await fetch(`/api/me/ai-preferences/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        fetchPreferences();
      } else {
        setErrorIds((prev) => new Set(prev).add(id));
      }
    } catch {
      setErrorIds((prev) => new Set(prev).add(id));
    }
  };

  const handleDelete = async (id: string) => {
    setErrorIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    try {
      const res = await fetch(`/api/me/ai-preferences/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchPreferences();
      } else {
        setErrorIds((prev) => new Set(prev).add(id));
      }
    } catch {
      setErrorIds((prev) => new Set(prev).add(id));
    }
  };

  // ============================================================
  // Loading state
  // ============================================================
  if (state.status === "loading") {
    return (
      <div className="space-y-4 p-6">
        <h2 className="text-lg font-semibold">AI 偏好学习</h2>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  // ============================================================
  // Error state
  // ============================================================
  if (state.status === "error") {
    return (
      <div className="space-y-4 p-6">
        <h2 className="text-lg font-semibold">AI 偏好学习</h2>
        <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-8 text-center">
          <p className="text-sm text-destructive">{state.message}</p>
          <button
            onClick={fetchPreferences}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  // ============================================================
  // Empty state
  // ============================================================
  if (state.status === "empty") {
    return (
      <div className="space-y-4 p-6">
        <h2 className="text-lg font-semibold">AI 偏好学习</h2>
        <div className="flex flex-col items-center gap-3 rounded-lg border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            暂无已学习的偏好。当你多次对 AI 结果做出相同修正后，系统将自动学习你的偏好。
          </p>
          <p className="text-xs text-muted-foreground">
            至少需要 {3} 次相同的修正才能触发偏好学习。
          </p>
        </div>
      </div>
    );
  }

  // ============================================================
  // Loaded state
  // ============================================================
  const { preferences } = state;
  const activePrefs = preferences.filter((p) => p.status === "active");
  const disabledPrefs = preferences.filter((p) => p.status === "disabled");

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-lg font-semibold">AI 偏好学习</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          系统根据你的历史修正数据自动学习偏好。偏好仅影响分类倾向、文案语气和格式，不改变事实字段。
        </p>
      </div>

      {/* Active preferences */}
      {activePrefs.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-medium text-muted-foreground">
            已启用的偏好（{activePrefs.length}）
          </h3>
          <div className="space-y-3">
            {activePrefs.map((pref) => (
              <PreferenceCard
                key={pref.id}
                preference={pref}
                hasError={errorIds.has(pref.id)}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </section>
      )}

      {/* Disabled preferences */}
      {disabledPrefs.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-medium text-muted-foreground">
            已停用的偏好（{disabledPrefs.length}）
          </h3>
          <div className="space-y-3 opacity-60">
            {disabledPrefs.map((pref) => (
              <PreferenceCard
                key={pref.id}
                preference={pref}
                hasError={errorIds.has(pref.id)}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ============================================================
// Preference card sub-component
// ============================================================

function PreferenceCard({
  preference,
  hasError,
  onToggle,
  onDelete,
}: {
  preference: UserPreference;
  hasError?: boolean;
  onToggle: (id: string, status: string) => void;
  onDelete: (id: string) => void;
}) {
  const confidencePercent = Math.round(preference.confidence * 100);
  const confidenceColor =
    confidencePercent >= 70
      ? "bg-green-500"
      : confidencePercent >= 40
        ? "bg-yellow-500"
        : "bg-orange-500";

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Hint text */}
          <p className="text-sm">{preference.preferenceValue.hint}</p>

          {/* Metadata */}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded bg-secondary px-2 py-0.5">
              {FEATURE_LABELS[preference.feature] ?? preference.feature}
            </span>
            <span>证据: {preference.evidenceCount} 次修正</span>
            <span className="flex items-center gap-1">
              <span
                className={`inline-block h-2 w-2 rounded-full ${confidenceColor}`}
              />
              置信度 {confidencePercent}%
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 gap-1">
          <button
            onClick={() => onToggle(preference.id, preference.status)}
            className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary"
            title={
              preference.status === "active" ? "停用此偏好" : "启用此偏好"
            }
          >
            {preference.status === "active" ? "停用" : "启用"}
          </button>
          <button
            onClick={() => onDelete(preference.id)}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
            title="删除此偏好"
          >
            删除
          </button>
        </div>
      </div>
      {hasError && (
        <div className="mt-2 rounded bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          操作失败，请重试
        </div>
      )}
    </div>
  );
}
