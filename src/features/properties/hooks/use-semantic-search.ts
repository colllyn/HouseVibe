"use client";

import { useCallback, useRef, useState } from "react";
import type { SemanticSearchPhase, SearchParseFilters } from "../schemas";
import { SearchParseInputSchema, SearchParseResponseSchema } from "../schemas";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchChip {
  /** Unique key for the chip (matches URL param name). */
  key: string;
  /** Human-readable label shown on the chip. */
  label: string;
  /** The raw URL param value. */
  value: string;
}

export interface SemanticSearchState {
  phase: SemanticSearchPhase;
  /** User-facing message (error, info, or fallback indicator). */
  message: string | null;
  /** Structured chips from a successful AI parse (200). */
  chips: SearchChip[];
  /** The raw query string the user typed. */
  rawQuery: string;
  /** Terms the AI could not map. Displayed non-blockingly. */
  unrecognizedTerms: string[];
  /** Whether the parser is available (false after 404/501). */
  parserAvailable: boolean;
}

// ---------------------------------------------------------------------------
// AI filter → URL param mapping (contract §6.5)
// ---------------------------------------------------------------------------

const FILTER_TO_URL_PARAM: Record<string, { param: string; transform: (v: unknown) => string }> = {
  districts: {
    param: "district",
    transform: (v) => (Array.isArray(v) && v.length > 0 ? String(v[0]) : ""),
  },
  monthlyRentMax: { param: "maxRent", transform: (v) => String(Number(v)) },
  monthlyRentMin: { param: "minRent", transform: (v) => String(Number(v)) },
  bedrooms: { param: "bedrooms", transform: (v) => String(Number(v)) },
  rentalType: { param: "rentalType", transform: (v) => String(v) },
  petsAllowed: { param: "petsAllowed", transform: (v) => (v ? "true" : "false") },
  cookingAllowed: { param: "cookingAllowed", transform: (v) => (v ? "true" : "false") },
  hasElevator: { param: "hasElevator", transform: (v) => (v ? "true" : "false") },
  availableBefore: { param: "availableBefore", transform: (v) => String(v) },
  communityName: { param: "communityName", transform: (v) => String(v) },
  subwayText: { param: "subwayText", transform: (v) => String(v) },
  sortBy: { param: "sortBy", transform: (v) => String(v) },
  sortOrder: { param: "sortOrder", transform: (v) => String(v) },
};

const CHIP_LABELS: Record<string, string> = {
  district: "区域",
  maxRent: "最高租金",
  minRent: "最低租金",
  bedrooms: "户型",
  rentalType: "租赁方式",
  petsAllowed: "可养宠物",
  cookingAllowed: "可做饭",
  hasElevator: "有电梯",
  availableBefore: "入住时间",
  communityName: "小区",
  subwayText: "地铁",
  sortBy: "排序",
  sortOrder: "排序方向",
};

function formatChipValue(key: string, value: string): string {
  if (key === "petsAllowed") return value === "true" ? "可养宠物" : "不可养宠物";
  if (key === "cookingAllowed") return value === "true" ? "可做饭" : "不可做饭";
  if (key === "hasElevator") return value === "true" ? "有电梯" : "无电梯";
  if (key === "rentalType") return value === "whole_unit" ? "整租" : value === "shared" ? "合租" : value;
  if (key === "bedrooms") return `${value}室`;
  if (key === "minRent" || key === "maxRent") return `¥${Number(value).toLocaleString()}`;
  return value;
}

function filtersToUrlParams(filters: SearchParseFilters): URLSearchParams {
  const params = new URLSearchParams();
  // Handle districts array specially: each value gets its own repeated param
  if (filters.districts && filters.districts.length > 0) {
    for (const district of filters.districts) {
      params.append("district", district);
    }
  }
  // Handle remaining fields via mapping table
  for (const [aiField, mapping] of Object.entries(FILTER_TO_URL_PARAM)) {
    if (aiField === "districts") continue; // handled above
    const val = (filters as Record<string, unknown>)[aiField];
    if (val !== undefined && val !== null) {
      const strVal = mapping.transform(val);
      if (strVal) params.set(mapping.param, strVal);
    }
  }
  return params;
}

function filtersToChips(filters: SearchParseFilters): SearchChip[] {
  const chips: SearchChip[] = [];
  // Handle districts array: one chip per district value
  if (filters.districts && filters.districts.length > 0) {
    for (const district of filters.districts) {
      chips.push({
        key: `district-${district}`,
        label: CHIP_LABELS["district"] ?? "区域",
        value: formatChipValue("district", district),
      });
    }
  }
  // Handle remaining fields via mapping table
  for (const [aiField, mapping] of Object.entries(FILTER_TO_URL_PARAM)) {
    if (aiField === "districts") continue; // handled above
    const val = (filters as Record<string, unknown>)[aiField];
    if (val !== undefined && val !== null) {
      const strVal = mapping.transform(val);
      if (strVal) {
        chips.push({
          key: mapping.param,
          label: CHIP_LABELS[mapping.param] ?? mapping.param,
          value: formatChipValue(mapping.param, strVal),
        });
      }
    }
  }
  return chips;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const INITIAL_STATE: SemanticSearchState = {
  phase: "idle",
  message: null,
  chips: [],
  rawQuery: "",
  unrecognizedTerms: [],
  parserAvailable: true, // optimistic until proven otherwise
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSemanticSearch(onUrlUpdate: (params: URLSearchParams) => void) {
  const [state, setState] = useState<SemanticSearchState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  /** Validate the raw input without submitting. */
  const validate = useCallback((query: string): string | null => {
    const trimmed = query.trim();
    if (!trimmed) return null; // empty is not an error, just disables submit
    if (trimmed.length > 500) return "搜索内容最多 500 字";
    if (/^[\s\p{P}\p{S}]+$/u.test(trimmed)) return "搜索内容不能仅为标点或特殊字符";
    return null; // valid
  }, []);

  /** Submit the query for AI parsing. */
  const submit = useCallback(
    async (rawQuery: string) => {
      const trimmed = rawQuery.trim();

      // --- Validate ---
      const validation = SearchParseInputSchema.safeParse({
        query: trimmed,
        requestId: crypto.randomUUID(),
      });

      if (!validation.success) {
        const msg = validation.error.errors[0]?.message ?? "输入格式不正确";
        setState((s) => ({ ...s, phase: "error_validation", message: msg, rawQuery: trimmed }));
        return;
      }

      // --- Abort any in-flight request ---
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState((s) => ({
        ...s,
        phase: "requesting",
        message: null,
        rawQuery: trimmed,
        chips: [],
        unrecognizedTerms: [],
      }));

      try {
        const resp = await fetch("/api/ai/parse-property-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Only send the query field — route schema is strict() and rejects extra fields
          body: JSON.stringify({ query: validation.data.query }),
          signal: controller.signal,
        });

        // --- Per-contract explicit branching (NO blanket !ok fallback) ---

        // 401: no fallback
        if (resp.status === 401) {
          setState((s) => ({
            ...s,
            phase: "error_auth",
            message: "请先登录",
            parserAvailable: true,
          }));
          return;
        }

        // 403: no fallback
        if (resp.status === 403) {
          setState((s) => ({
            ...s,
            phase: "error_forbidden",
            message: "需要 semantic_search 权限",
            parserAvailable: false,
          }));
          return;
        }

        // 422: no fallback
        if (resp.status === 422) {
          setState((s) => ({
            ...s,
            phase: "error_validation",
            message: "输入校验失败，请修改搜索内容",
            parserAvailable: true,
          }));
          return;
        }

        // 404 / 501: parser not deployed → text search fallback
        if (resp.status === 404 || resp.status === 501) {
          const params = new URLSearchParams();
          params.set("search", trimmed);
          params.set("page", "1");
          onUrlUpdate(params);

          setState((s) => ({
            ...s,
            phase: "fallback_text",
            message: "智能搜索即将上线 · 当前使用文本匹配",
            chips: [{ key: "search", label: "搜索", value: trimmed }],
            parserAvailable: false,
          }));
          return;
        }

        // 200: structured response
        if (resp.status === 200) {
          let json: unknown;
          try {
            json = await resp.json();
          } catch {
            // Invalid JSON from 200 → do NOT modify URL, do NOT fallback
            setState((s) => ({
              ...s,
              phase: "error_validation",
              message: "智能解析响应无效",
              parserAvailable: true,
            }));
            return;
          }

          // Accept response in either shape:
          // - Contract shape: { data: { filters, parsedQuery, unrecognizedTerms, requestId } }
          // - Minimal shape: { data: { filters } } where parsedQuery/unrecognizedTerms are inside filters
          const parsed = SearchParseResponseSchema.safeParse(json);
          const rawData = (json as Record<string, unknown>)?.data as Record<string, unknown> | null | undefined;

          if (!rawData || typeof rawData !== "object") {
            setState((s) => ({
              ...s,
              phase: "error_validation",
              message: "智能解析响应无效",
              parserAvailable: true,
            }));
            return;
          }

          const rawFilters = rawData.filters as Record<string, unknown> | null | undefined;
          if (!rawFilters || typeof rawFilters !== "object") {
            setState((s) => ({
              ...s,
              phase: "error_validation",
              message: "智能解析响应无效",
              parserAvailable: true,
            }));
            return;
          }

          // Use contract-validated data if available, otherwise extract from filters
          const filters: SearchParseFilters = (parsed.success && parsed.data.data?.filters)
            ? parsed.data.data.filters
            : (rawFilters as unknown as SearchParseFilters);

          const parsedQuery: string = (parsed.success && parsed.data.data?.parsedQuery)
            || (typeof rawFilters.parsedQuery === "string" ? rawFilters.parsedQuery : "");

          const unrecognizedTerms: string[] = (parsed.success && parsed.data.data?.unrecognizedTerms)
            || (Array.isArray(rawFilters.unrecognizedTerms) ? rawFilters.unrecognizedTerms : []);

          // Convert AI filters to URL params
          const aiParams = filtersToUrlParams(filters);
          // Always include the original query as a chip context
          aiParams.set("page", "1");
          onUrlUpdate(aiParams);

          const chips = filtersToChips(filters);

          setState((s) => ({
            ...s,
            phase: "structured",
            message: `已识别筛选条件${parsedQuery ? `：${parsedQuery}` : ""}`,
            chips,
            unrecognizedTerms,
            parserAvailable: true,
          }));
          return;
        }

        // 5xx / any other status → fallback to text search
        {
          const params = new URLSearchParams();
          params.set("search", trimmed);
          params.set("page", "1");
          onUrlUpdate(params);

          setState((s) => ({
            ...s,
            phase: "fallback_error",
            message: "智能解析暂不可用，已使用文本搜索",
            chips: [{ key: "search", label: "搜索", value: trimmed }],
            parserAvailable: true,
          }));
        }
      } catch (err: unknown) {
        // Network error / timeout / abort
        if (err instanceof DOMException && err.name === "AbortError") {
          return; // silently ignore aborted requests
        }

        // Network error → fallback to text search
        const params = new URLSearchParams();
        params.set("search", trimmed);
        params.set("page", "1");
        onUrlUpdate(params);

        setState((s) => ({
          ...s,
          phase: "fallback_error",
          message: "智能解析暂不可用，已使用文本搜索",
          chips: [{ key: "search", label: "搜索", value: trimmed }],
          parserAvailable: true,
        }));
      }
    },
    [onUrlUpdate]
  );

  /** Clear the search state. */
  const clear = useCallback(() => {
    abortRef.current?.abort();
    setState(INITIAL_STATE);
  }, []);

  /** Remove a single chip by key. */
  const removeChip = useCallback(
    (chipKey: string) => {
      setState((s) => ({
        ...s,
        chips: s.chips.filter((c) => c.key !== chipKey),
      }));
    },
    []
  );

  /** Reset to idle (used after URL param changes). */
  const resetToIdle = useCallback(() => {
    setState((s) => ({
      ...INITIAL_STATE,
      rawQuery: s.rawQuery,
    }));
  }, []);

  return { state, validate, submit, clear, removeChip, resetToIdle };
}
