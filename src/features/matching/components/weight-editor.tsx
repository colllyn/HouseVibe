"use client";

import React from "react";
import { SlidersHorizontal, RotateCcw } from "lucide-react";

interface WeightEditorProps {
  weights: {
    budget: number;
    district: number;
    roomType: number;
    availability: number;
    commute: number;
    specialRequirements: number;
  };
  onChange: (weights: Record<string, number>) => void;
  disabled?: boolean;
  error?: string | null;
}

const DIMENSIONS = [
  { key: "budget", label: "预算匹配", default: 30 },
  { key: "district", label: "区域匹配", default: 20 },
  { key: "roomType", label: "户型匹配", default: 15 },
  { key: "availability", label: "入住时间", default: 15 },
  { key: "commute", label: "通勤/地铁", default: 10 },
  { key: "specialRequirements", label: "特殊要求", default: 10 },
];

export function WeightEditor({ weights, onChange, disabled, error }: WeightEditorProps) {
  const total = Object.values(weights).reduce((sum, w) => sum + w, 0);

  const handleChange = (key: string, value: string) => {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 0) return;
    onChange({ ...weights, [key]: num });
  };

  const handleReset = () => {
    const defaults: Record<string, number> = {};
    for (const dim of DIMENSIONS) {
      defaults[dim.key] = dim.default;
    }
    onChange(defaults);
  };

  return (
    <div className="space-y-3" role="group" aria-label="匹配权重调整">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">权重调整</span>
        </div>
        <button
          type="button"
          onClick={handleReset}
          disabled={disabled}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          aria-label="重置为默认权重"
          style={{ minHeight: 44, minWidth: 44 }}
        >
          <RotateCcw className="size-3" />
          重置
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {DIMENSIONS.map((dim) => (
          <div key={dim.key} className="space-y-1">
            <label
              htmlFor={`weight-${dim.key}`}
              className="flex items-center justify-between text-xs text-muted-foreground"
            >
              <span>{dim.label}</span>
              <span className="tabular-nums">默认 {dim.default}</span>
            </label>
            <input
              id={`weight-${dim.key}`}
              type="number"
              min={0}
              step={1}
              value={weights[dim.key as keyof typeof weights]}
              onChange={(e) => handleChange(dim.key, e.target.value)}
              disabled={disabled}
              className="w-full rounded-md border px-3 py-2 text-sm disabled:opacity-50"
              style={{ minHeight: 44 }}
              aria-label={`${dim.label}权重`}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">权重总和</span>
        <span className="font-mono font-medium tabular-nums">{total}</span>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
