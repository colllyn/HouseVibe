"use client";

// ============================================================
// Admin AI Models Page — P3-AI-016
// Shows circuit breaker state and allows force model mode.
// ============================================================

import { useState, useEffect, useCallback } from "react";
import type { RuntimeConfig } from "@/features/ai-runtime/schemas";

interface PageState {
  status: "loading" | "loaded" | "error";
  message?: string;
  textConfig: RuntimeConfig | null;
  visionConfig: RuntimeConfig | null;
}

const MODE_LABELS: Record<string, string> = {
  auto: "自动切换",
  primary: "强制主模型",
  fallback: "强制备用模型",
};

export default function AdminAiModelsPage() {
  const [state, setState] = useState<PageState>({ status: "loading", textConfig: null, visionConfig: null });

  const fetchConfig = useCallback(async () => {
    setState((s) => ({ ...s, status: "loading" }));
    try {
      const res = await fetch("/api/admin/ai-models");
      const json = await res.json();
      if (!res.ok || json.error) {
        setState({ status: "error", message: json.error?.message ?? "加载失败", textConfig: null, visionConfig: null });
        return;
      }
      setState({
        status: "loaded",
        textConfig: json.data?.text ?? null,
        visionConfig: json.data?.vision ?? null,
      });
    } catch {
      setState({ status: "error", message: "网络错误", textConfig: null, visionConfig: null });
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleForceMode = async (capability: string, mode: string) => {
    try {
      const res = await fetch("/api/admin/ai-models", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capability, mode }),
      });
      if (res.ok) fetchConfig();
    } catch {
      // error state handled by page
    }
  };

  const handleResetCircuit = async (capability: string) => {
    try {
      const res = await fetch("/api/admin/ai-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capability }),
      });
      if (res.ok) fetchConfig();
    } catch {
      // error state handled by page
    }
  };

  if (state.status === "loading") {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">AI 模型管理</h1>
        <div className="mt-6 animate-pulse space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">AI 模型管理</h1>
        <div className="mt-6 rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">{state.message}</p>
          <button onClick={fetchConfig} className="mt-3 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">AI 模型管理</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        管理 DeepSeek 主/备模型切换策略。熔断器在连续 3 次服务端错误（5xx/超时/连接失败）后自动切换至备用模型。
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {(["text", "vision"] as const).map((cap) => {
          const config = cap === "text" ? state.textConfig : state.visionConfig;
          const isCircuitOpen = config?.circuitOpen ?? false;
          const mode = config?.mode ?? "auto";

          return (
            <div key={cap} className="rounded-lg border p-5">
              <h2 className="text-lg font-semibold">
                {cap === "text" ? "文本模型" : "视觉模型"}
              </h2>

              {/* Status badges */}
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                  mode === "auto" ? "bg-green-100 text-green-700" :
                  mode === "primary" ? "bg-blue-100 text-blue-700" :
                  "bg-yellow-100 text-yellow-700"
                }`}>
                  模式: {MODE_LABELS[mode] ?? mode}
                </span>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                  isCircuitOpen ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                }`}>
                  熔断: {isCircuitOpen ? "已断开" : "正常"}
                </span>
              </div>

              {/* Details */}
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">连续失败次数</dt>
                  <dd>{config?.consecutiveFailures ?? "—"}</dd>
                </div>
                {config?.lastFailureAt && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">最近失败</dt>
                    <dd>{new Date(config.lastFailureAt).toLocaleString()}</dd>
                  </div>
                )}
                {config?.forcedAt && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">强制时间</dt>
                    <dd>{new Date(config.forcedAt).toLocaleString()}</dd>
                  </div>
                )}
              </dl>

              {/* Mode controls */}
              <div className="mt-4 flex gap-2">
                {(["auto", "primary", "fallback"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => handleForceMode(cap, m)}
                    disabled={mode === m}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      mode === m
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary hover:bg-secondary/80"
                    }`}
                  >
                    {MODE_LABELS[m]}
                  </button>
                ))}
              </div>

              {/* Circuit breaker reset — P3-AI-015 */}
              {isCircuitOpen && (
                <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3">
                  <p className="text-xs text-red-700 mb-2">
                    熔断器已断开。如确认主模型已恢复，可手动重置。
                  </p>
                  <button
                    onClick={() => handleResetCircuit(cap)}
                    data-testid={`reset-circuit-${cap}`}
                    className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 transition-colors"
                  >
                    重置熔断器
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
