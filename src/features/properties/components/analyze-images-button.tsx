"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ScanEye, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";

// ============================================================
// Analyze Images Button — P3-AI-006
// Triggers POST /api/ai/analyze-property-images and refreshes
// the page to show visual summary / AI labels.
// ============================================================

interface AnalyzeImagesButtonProps {
  propertyId: string;
  mediaCount: number;
  disabled?: boolean;
}

export function AnalyzeImagesButton({ propertyId, mediaCount, disabled }: AnalyzeImagesButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleAnalyze = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch("/api/ai/analyze-property-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const code = body?.error?.code ?? `HTTP ${res.status}`;
        const message = body?.error?.message ?? "分析请求失败";

        if (res.status === 401) throw new Error("请先登录");
        if (res.status === 403) {
          if (code === "FEATURE_NOT_ALLOWED") throw new Error("暂无图片分析权限");
          if (code === "WORKSPACE_ACCESS_DENIED") throw new Error("无权访问此房源");
          throw new Error(message);
        }
        if (res.status === 429) throw new Error("今日配额已用完，请明日再试");
        throw new Error(message);
      }

      setSuccess(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "分析失败");
    } finally {
      setLoading(false);
    }
  }, [propertyId, loading, router]);

  if (mediaCount === 0) {
    return (
      <div className="text-xs text-muted-foreground py-2 text-center">
        上传图片后可进行 AI 分析
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleAnalyze}
        disabled={disabled || loading}
        className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium border border-input hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] transition-colors"
        data-testid="analyze-images-button"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : success ? (
          <CheckCircle2 className="h-4 w-4 text-green-600" />
        ) : (
          <ScanEye className="h-4 w-4" />
        )}
        {loading ? "分析中..." : success ? "分析完成" : `AI 分析图片 (${mediaCount} 张)`}
      </button>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {success && !loading && (
        <p className="text-xs text-muted-foreground">结果已保存，刷新页面查看分析结果</p>
      )}
    </div>
  );
}
