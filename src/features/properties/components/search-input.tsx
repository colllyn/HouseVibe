"use client";

import * as React from "react";
import { Search, X, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SemanticSearchPhase } from "../schemas";

// ---------------------------------------------------------------------------
// Ref handle
// ---------------------------------------------------------------------------

export interface SearchInputHandle {
  focus: () => void;
}

// ---------------------------------------------------------------------------
// Example prompts
// ---------------------------------------------------------------------------

const EXAMPLE_PROMPTS = [
  "3500以内、天河、能养猫的一房",
  "下周能入住，近三号线，独立阳台",
  "找适合珠江新城通勤的整租房",
  "找最近没发过小红书的两房",
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SearchInputProps {
  /** The current semantic search phase. */
  phase: SemanticSearchPhase;
  /** Error or info message to display. */
  message: string | null;
  /** Whether the parser is available (false → show readiness indicator). */
  parserAvailable: boolean;
  /** Called when the user submits a query. */
  onSubmit: (query: string) => void;
  /** Called when the user clears the search. */
  onClear: () => void;
  /** Whether the semantic_search entitlement is active. */
  entitled: boolean;
  /** Optional CSS class. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const SearchInput = React.forwardRef<SearchInputHandle, SearchInputProps>(
  function SearchInput(
    { phase, message, parserAvailable, onSubmit, onClear, entitled, className },
    ref
  ) {
  const [value, setValue] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Expose focus() for external callers (contract §7.5: focus returns to input after chip removal)
  React.useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  const trimmed = value.trim();
  const isTooLong = trimmed.length > 500;
  const isPureSpecial =
    trimmed.length > 0 && /^[\s\p{P}\p{S}]+$/u.test(trimmed);
  const canSubmit =
    entitled &&
    trimmed.length > 0 &&
    trimmed.length <= 500 &&
    !isPureSpecial &&
    phase !== "requesting";
  const isLoading = phase === "requesting";

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canSubmit) return;
    onSubmit(trimmed);
  };

  const handleClear = () => {
    setValue("");
    onClear();
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      handleClear();
    }
  };

  const handlePromptClick = (prompt: string) => {
    setValue(prompt);
  };

  // If not entitled, show nothing (contract §8: hide/disable entry point)
  if (!entitled) return null;

  return (
    <div
      className={cn("w-full space-y-2", className)}
      role="search"
      aria-label="语义搜索房源"
    >
      {/* Input row */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
            <Search className="h-4 w-4" />
          </span>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="自然语言描述您的需求，例如：3500以内、天河、能养猫的一房"
            aria-label="自然语言搜索房源"
            maxLength={500}
            disabled={isLoading || phase === "error_forbidden"}
            className={cn(
              "w-full min-h-[44px] pl-9 pr-10 rounded-md border border-input bg-background",
              "text-sm placeholder:text-muted-foreground",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              isTooLong && "border-destructive focus:ring-destructive"
            )}
          />
          {/* Clear button inside input */}
          {value && !isLoading && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="清除搜索内容"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-muted min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {/* Loading spinner inside input */}
          {isLoading && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </span>
          )}
        </div>

        {/* Submit button */}
        <button
          type="submit"
          disabled={!canSubmit}
          aria-label="提交搜索"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium min-w-[44px] min-h-[44px]",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            "disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          )}
        >
          <Sparkles className="h-4 w-4" />
          <span>智能搜索</span>
        </button>
      </form>

      {/* Validation hints */}
      {isTooLong && (
        <p className="text-xs text-destructive" role="alert">
          搜索内容最多 500 字（当前 {trimmed.length} 字）
        </p>
      )}
      {isPureSpecial && (
        <p className="text-xs text-destructive" role="alert">
          搜索内容不能仅为标点或特殊字符
        </p>
      )}

      {/* Phase 3 readiness indicator */}
      {!parserAvailable && phase !== "error_forbidden" && (
        <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 dark:bg-amber-950 px-3 py-1 text-xs text-amber-700 dark:text-amber-300">
          <Sparkles className="h-3 w-3" />
          智能搜索即将上线 · 当前使用文本匹配
        </div>
      )}

      {/* Error/status messages (non-blocking for fallback states) */}
      {message && (
        <p
          className={cn(
            "text-xs",
            phase === "error_auth" || phase === "error_forbidden" || phase === "error_validation"
              ? "text-destructive"
              : "text-muted-foreground"
          )}
          role={phase.startsWith("error_") ? "alert" : "status"}
        >
          {message}
        </p>
      )}

      {/* Example prompts — only when idle */}
      {phase === "idle" && !value && (
        <div className="flex flex-wrap gap-2" aria-label="搜索示例">
          {EXAMPLE_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => handlePromptClick(prompt)}
              className="inline-block rounded-full bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80 min-h-[44px] transition-colors"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
