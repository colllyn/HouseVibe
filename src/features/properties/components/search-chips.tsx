"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SearchChip } from "../hooks/use-semantic-search";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SearchChipsProps {
  /** URL-derived filter chips (from existing URL params). */
  urlChips: SearchChip[];
  /** Chips returned from a successful AI parse (200). */
  aiChips: SearchChip[];
  /** Text-search fallback chips. */
  fallbackChips: SearchChip[];
  /** Called when the user clicks X on a chip. Passes the URL param key. */
  onRemoveUrlChip: (key: string) => void;
  /** Called when user clicks X on a fallback chip. */
  onRemoveFallbackChip: (key: string) => void;
  /** Clear all filters. */
  onClearAll: () => void;
  /** CSS class. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SearchChips({
  urlChips,
  aiChips,
  fallbackChips,
  onRemoveUrlChip,
  onRemoveFallbackChip,
  onClearAll,
  className,
}: SearchChipsProps) {
  // Deduplicate: AI chips take precedence; URL chips with same key are skipped
  const aiKeys = new Set(aiChips.map((c) => c.key));
  const fallbackKeys = new Set(fallbackChips.map((c) => c.key));
  const dedupedUrlChips = urlChips.filter(
    (c) => !aiKeys.has(c.key) && !fallbackKeys.has(c.key)
  );
  const allChips = [...aiChips, ...fallbackChips, ...dedupedUrlChips];

  if (allChips.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-2", className)} aria-label="当前筛选条件">
      {allChips.map((chip) => {
        const isFallback = chip.key === "search" && fallbackChips.some((c) => c.key === "search");
        const handleRemove = isFallback
          ? () => onRemoveFallbackChip(chip.key)
          : () => onRemoveUrlChip(chip.key);

        return (
          <span
            key={isFallback ? `search-${chip.value}` : chip.key}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium min-h-[44px]",
              isFallback
                ? "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                : "bg-secondary text-secondary-foreground"
            )}
          >
            <span className="text-muted-foreground">{chip.label}:</span>
            <span>{chip.value}</span>
            <button
              type="button"
              onClick={handleRemove}
              aria-label={`删除筛选条件: ${chip.label} ${chip.value}`}
              className="ml-0.5 rounded-full p-0.5 hover:bg-background/50 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        );
      })}

      {/* Clear all */}
      {allChips.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="inline-flex items-center gap-1 rounded-full border border-input bg-background px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted min-h-[44px] transition-colors"
        >
          <X className="h-3 w-3" />
          清除全部 ({allChips.length})
        </button>
      )}
    </div>
  );
}
