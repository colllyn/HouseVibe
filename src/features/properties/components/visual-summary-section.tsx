import { Eye, AlertTriangle, CheckCircle2, HelpCircle, Info } from "lucide-react";

// ============================================================
// Visual Summary Section — P3-AI-006
// Displays visual_summary and visual_fact_flags from AI analysis.
// ============================================================

export interface VisualFactFlag {
  field: string;
  label: string;
  verdict: "confirmed_visual_support" | "not_verified_by_images" | "possible_conflict" | "insufficient_evidence";
  detail?: string;
  evidenceMediaIds?: string[];
}

interface VisualSummarySectionProps {
  visualSummary: string | null;
  visualFactFlags: VisualFactFlag[] | null;
}

interface VerdictDisplay {
  icon: React.ReactNode;
  label: string;
  className: string;
}

type VerdictKey = "confirmed_visual_support" | "not_verified_by_images" | "possible_conflict" | "insufficient_evidence";

const VERDICT_CONFIG: Record<VerdictKey, VerdictDisplay> = {
  confirmed_visual_support: {
    icon: <CheckCircle2 className="h-4 w-4" />,
    label: "图片已验证",
    className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-950 dark:border-green-800 dark:text-green-300",
  },
  not_verified_by_images: {
    icon: <HelpCircle className="h-4 w-4" />,
    label: "图片未验证",
    className: "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-300",
  },
  possible_conflict: {
    icon: <AlertTriangle className="h-4 w-4" />,
    label: "疑似冲突",
    className: "bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-950 dark:border-orange-800 dark:text-orange-300",
  },
  insufficient_evidence: {
    icon: <Info className="h-4 w-4" />,
    label: "证据不足",
    className: "bg-gray-50 border-gray-200 text-gray-600 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-400",
  },
};

function getVerdictConfig(verdict: string): VerdictDisplay {
  return VERDICT_CONFIG[verdict as VerdictKey] ?? VERDICT_CONFIG.insufficient_evidence;
}

export function VisualSummarySection({ visualSummary, visualFactFlags }: VisualSummarySectionProps) {
  if (!visualSummary && (!visualFactFlags || visualFactFlags.length === 0)) {
    return null;
  }

  return (
    <section className="rounded-lg border mb-6">
      <h2 className="font-semibold text-sm px-4 py-3 border-b flex items-center gap-2">
        <Eye className="h-4 w-4 text-purple-600" />
        AI 图片分析
      </h2>

      <div className="px-4 py-3 space-y-4">
        {/* Visual Summary */}
        {visualSummary && (
          <div>
            <h3 className="text-xs font-medium text-muted-foreground mb-1">视觉摘要</h3>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{visualSummary}</p>
          </div>
        )}

        {/* Fact Flags */}
        {visualFactFlags && visualFactFlags.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-muted-foreground mb-2">事实交叉校验</h3>
            <div className="space-y-2">
              {visualFactFlags.map((flag, i) => {
                const config = getVerdictConfig(flag.verdict);
                return (
                  <div
                    key={`${flag.field}-${i}`}
                    className={`flex items-start gap-3 rounded-md border p-3 ${config.className}`}
                  >
                    <span className="shrink-0 mt-0.5">{config.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium">{flag.label}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full border opacity-70">
                          {config.label}
                        </span>
                      </div>
                      {flag.detail && (
                        <p className="text-xs mt-1 opacity-80">{flag.detail}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty summary with only flags */}
        {!visualSummary && (
          <p className="text-xs text-muted-foreground">视觉摘要尚未生成</p>
        )}
      </div>
    </section>
  );
}
