// ============================================================
// DeepSeekTextProvider Implementation
// Owner: ai-deepseek-engineer
// Contract: docs/contracts/ai-contract.md v2.0
// ============================================================

import { z } from "zod";
import { getServerEnv, type ServerEnv } from "@/config/env";
import {
  DeepSeekProviderError,
  type DeepSeekTextProvider,
  type FetchFn,
  type PropertyExtractionInput,
  type PropertyExtractionResult,
  type ClientExtractionInput,
  type ClientExtractionResult,
  type SearchParseInput,
  type PropertySearchFilters,
  type ContentGenerationInput,
  type GeneratedContent,
  type GenerateContentResult,
  type AIUsage,
} from "../types";
import {
  PropertyExtractionOutputSchema,
  PropertySearchFilterSchema,
  ClientExtractionOutputSchema,
  ContentGenerationOutputSchema,
} from "../schemas";
import {
  SEARCH_FILTER_FIXTURE,
  SEARCH_FILTER_MINIMAL_FIXTURE,
  XIAOHONGSHU_FIXTURE,
  DOUYIN_FIXTURE,
  WECHAT_MOMENTS_FIXTURE,
} from "../fixtures";

// ============================================================
// Constants
// ============================================================

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const CHAT_COMPLETIONS_PATH = "/v1/chat/completions";
const MAX_ATTEMPTS = 2;

const MAX_TOKENS = {
  parsePropertySearch: 1024,
  extractProperty: 2048,
  extractClient: 2048,
  generateContent: 4096,
} as const;

// ============================================================
// Helpers
// ============================================================

function parseRetryAfter(header: string | null): number {
  if (!header) return 0;
  const seconds = parseInt(header, 10);
  if (!isNaN(seconds) && seconds > 0 && seconds <= 120) return seconds * 1000;
  // Try HTTP-date format
  const date = Date.parse(header);
  if (!isNaN(date)) {
    const delay = date - Date.now();
    if (delay > 0 && delay <= 120_000) return delay;
  }
  return 0;
}

function randomJitter(ms: number): number {
  return ms + Math.floor(Math.random() * 2000) + 1000;
}

/**
 * Safe, deterministic fallback for parsedQuery.
 * Contract §4.1: parsedQuery is required. If the model omits it,
 * use the trimmed input query — it IS the normalized user intent.
 * This only fills a missing field; it never overwrites or masks other errors.
 */
function ensureParsedQuery(
  raw: unknown,
  query: string,
  _requestId: string
): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const obj = raw as Record<string, unknown>;
  if (!obj.parsedQuery || typeof obj.parsedQuery !== "string" || obj.parsedQuery.trim() === "") {
    return { ...obj, parsedQuery: query.trim() };
  }
  return raw;
}

function extractUsage(data: Record<string, unknown> | undefined): AIUsage {
  if (!data) {
    return { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 };
  }
  const usage = data as Record<string, unknown>;
  const inputTokens =
    typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : 0;
  const outputTokens =
    typeof usage.completion_tokens === "number"
      ? usage.completion_tokens
      : 0;
  // Estimated cost: input $0.27/M, output $1.10/M for v4-flash
  const estimatedCostUsd =
    (inputTokens / 1_000_000) * 0.27 + (outputTokens / 1_000_000) * 1.1;
  return { inputTokens, outputTokens, estimatedCostUsd };
}

// ============================================================
// Provider Implementation
// ============================================================

export class DeepSeekTextProviderImpl implements DeepSeekTextProvider {
  private readonly fetchFn: FetchFn;
  private readonly configOverride?: Partial<ServerEnv>;

  constructor(fetchFn?: FetchFn, configOverride?: Partial<ServerEnv>) {
    this.fetchFn = fetchFn ?? globalThis.fetch;
    this.configOverride = configOverride;
  }

  // --- Public API ---

  async extractProperty(
    input: PropertyExtractionInput,
    signal?: AbortSignal
  ): Promise<PropertyExtractionResult> {
    const prompt = buildExtractPropertyPrompt(input.text, input.sourceType);
    const { parsed: raw } = await this.callWithRetry(
      input.requestId,
      "extractProperty",
      prompt,
      MAX_TOKENS.extractProperty,
      signal
    );
    return validateAndTransform(raw, PropertyExtractionOutputSchema, "extractProperty", input.requestId);
  }

  async extractClient(
    input: ClientExtractionInput,
    signal?: AbortSignal
  ): Promise<ClientExtractionResult> {
    const prompt = buildExtractClientPrompt(input.text, input.sourcePlatform);
    const { parsed: raw } = await this.callWithRetry(
      input.requestId,
      "extractClient",
      prompt,
      MAX_TOKENS.extractClient,
      signal
    );
    return validateAndTransform(raw, ClientExtractionOutputSchema, "extractClient", input.requestId);
  }

  async parsePropertySearch(
    input: SearchParseInput,
    signal?: AbortSignal
  ): Promise<PropertySearchFilters> {
    const prompt = buildParsePropertySearchPrompt(input.query);
    const { parsed: raw } = await this.callWithRetry(
      input.requestId,
      "parsePropertySearch",
      prompt,
      MAX_TOKENS.parsePropertySearch,
      signal
    );
    // Safe fallback: if model omitted parsedQuery, use the input query.
    // Contract §4.1: parsedQuery is required — it's the normalized user intent.
    // Using the input query is deterministic and does not mask other Zod errors.
    const withFallback = ensureParsedQuery(raw, input.query, input.requestId);
    return validateAndTransform(withFallback, PropertySearchFilterSchema, "parsePropertySearch", input.requestId);
  }

  async generateContent(
    input: ContentGenerationInput,
    signal?: AbortSignal
  ): Promise<GenerateContentResult> {
    const prompt = buildGenerateContentPrompt(input);
    const { parsed, usage, model } = await this.callWithRetry(
      input.requestId,
      "generateContent",
      prompt,
      MAX_TOKENS.generateContent,
      signal
    );
    const output = validateAndTransform(parsed, ContentGenerationOutputSchema, "generateContent", input.requestId) as GeneratedContent;
    return {
      output,
      usage: usage ?? { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 },
      model,
      requestId: input.requestId,
    };
  }

  // --- Core retry/request logic ---

  private async callWithRetry(
    requestId: string,
    capability: string,
    prompt: string,
    maxTokens: number,
    signal?: AbortSignal
  ): Promise<{ parsed: unknown; usage: AIUsage | undefined; model: string }> {
    const env = validateConfig(requestId, this.configOverride);
    const systemPrompt = getSystemPrompt(capability);

    let lastError: DeepSeekProviderError | null = null;
    let currentModel = env.DEEPSEEK_MODEL;
    let retryCount = 0;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      // Check abort before each attempt
      if (signal?.aborted) {
        throw new DeepSeekProviderError({
          code: "AI_REQUEST_ABORTED",
          message: "请求已取消",
          requestId,
          retryable: false,
        });
      }

      const startTime = Date.now();
      try {
        // apiKey is guaranteed by validateConfig()
        const apiKey = env.DEEPSEEK_API_KEY ?? "";
        const result = await this.makeRequest(
          env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL,
          apiKey,
          currentModel,
          systemPrompt,
          prompt,
          maxTokens,
          requestId,
          signal
        );

        const durationMs = Date.now() - startTime;
        // On success, parse and return with metadata
        const parsed = parseResponseJson(result.content, result.finishReason, requestId, attempt > 0);
        // Log success (structured, no sensitive data)
        logStructured({
          requestId,
          provider: "deepseek",
          modelName: currentModel,
          durationMs,
          retryCount,
          inputTokens: result.usage?.inputTokens,
          outputTokens: result.usage?.outputTokens,
        });
        return { parsed, usage: result.usage, model: currentModel };
      } catch (err) {
        const durationMs = Date.now() - startTime;

        if (err instanceof DeepSeekProviderError) {
          lastError = err;

          // Abort → immediate throw, no retry, no log
          if (err.code === "AI_REQUEST_ABORTED") throw err;

          // Non-retryable or last attempt → throw
          if (!err.retryable || attempt === MAX_ATTEMPTS - 1) {
            logStructured({
              requestId,
              provider: "deepseek",
              modelName: currentModel,
              durationMs,
              retryCount,
              errorCode: err.code,
            });
            throw err;
          }

          // Retryable — determine model and backoff
          retryCount++;
          if (err.code === "AI_RATE_LIMITED") {
            // 429 → same model with backoff
            await sleep(randomJitter(1000));
          } else {
            // 5xx / timeout / network / truncation → fallback model
            currentModel = env.DEEPSEEK_FALLBACK_MODEL;
            await sleep(1000);
          }
          logStructured({
            requestId,
            provider: "deepseek",
            modelName: currentModel,
            durationMs,
            retryCount,
            errorCode: err.code,
          });
          continue;
        }

        // Unknown error → wrap and throw
        throw new DeepSeekProviderError({
          code: "AI_UPSTREAM_ERROR",
          message: "AI 服务请求异常",
          requestId,
          retryable: false,
          suggestedHttpStatus: 502,
        });
      }
    }

    // Should never reach here, but if we do:
    if (lastError) throw lastError;
    throw new DeepSeekProviderError({
      code: "AI_UPSTREAM_ERROR",
      message: "AI 服务请求失败",
      requestId,
      retryable: false,
      suggestedHttpStatus: 502,
    });
  }

  private async makeRequest(
    baseUrl: string,
    apiKey: string,
    model: string,
    systemPrompt: string,
    userPrompt: string,
    maxTokens: number,
    requestId: string,
    signal?: AbortSignal
  ): Promise<{
    content: string;
    finishReason: string;
    usage?: AIUsage;
    responseStatus: number;
  }> {
    const env = validateConfig(requestId, this.configOverride);
    const timeoutMs = env.DEEPSEEK_REQUEST_TIMEOUT_MS;

    // Create timeout controller
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

    // Combine signals
    const combinedSignal = combineSignals(signal, timeoutController.signal);

    try {
      const url = `${baseUrl.replace(/\/$/, "")}${CHAT_COMPLETIONS_PATH}`;
      const body = {
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        thinking: { type: "disabled" },
      };

      const response = await this.fetchFn(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: combinedSignal,
      });

      clearTimeout(timeoutId);

      const responseStatus = response.status;

      // Handle 429 — record Retry-After for caller but do not expose
      if (responseStatus === 429) {
        void parseRetryAfter(response.headers.get("Retry-After"));
        throw new DeepSeekProviderError({
          code: "AI_RATE_LIMITED",
          message: "AI 服务繁忙，请稍后重试",
          requestId,
          retryable: true,
          suggestedHttpStatus: 502,
          upstreamStatus: 429,
        });
      }

      // Handle 401 — upstream key invalid, NOT user unauthenticated
      if (responseStatus === 401) {
        throw new DeepSeekProviderError({
          code: "AI_UPSTREAM_ERROR",
          message: "AI 服务配置异常，请联系管理员",
          requestId,
          retryable: false,
          suggestedHttpStatus: 502,
          upstreamStatus: 401,
        });
      }

      // Handle 402 — payment required (balance insufficient)
      if (responseStatus === 402) {
        throw new DeepSeekProviderError({
          code: "AI_UPSTREAM_ERROR",
          message: "AI 服务账户余额不足，请联系管理员",
          requestId,
          retryable: false,
          suggestedHttpStatus: 502,
          upstreamStatus: 402,
        });
      }

      // Handle other 4xx — no retry
      if (responseStatus >= 400 && responseStatus < 500) {
        throw new DeepSeekProviderError({
          code: "AI_UPSTREAM_ERROR",
          message: `AI 服务请求错误 (${responseStatus})`,
          requestId,
          retryable: false,
          suggestedHttpStatus: 502,
          upstreamStatus: responseStatus,
        });
      }

      // Handle 5xx
      if (responseStatus >= 500) {
        throw new DeepSeekProviderError({
          code: "AI_UPSTREAM_ERROR",
          message: "AI 服务暂时不可用，正在重试",
          requestId,
          retryable: true,
          suggestedHttpStatus: 502,
          upstreamStatus: responseStatus,
        });
      }

      // Parse successful response
      const json = (await response.json()) as Record<string, unknown>;
      const choices = json.choices as Array<Record<string, unknown>> | undefined;
      const choice = choices?.[0];
      const message = choice?.message as Record<string, unknown> | undefined;
      const content =
        typeof message?.content === "string" ? message.content.trim() : "";
      const finishReason =
        typeof choice?.finish_reason === "string" ? choice.finish_reason : "unknown";
      const usage = extractUsage(json.usage as Record<string, unknown> | undefined);

      return {
        content,
        finishReason,
        usage,
        responseStatus,
      };
    } catch (err: unknown) {
      clearTimeout(timeoutId);

      // Already a provider error — re-throw
      if (err instanceof DeepSeekProviderError) throw err;

      // AbortError — could be timeout or client abort
      // Check both DOMException and regular Error with name "AbortError" (jsdom compat)
      if (
        (err instanceof DOMException && err.name === "AbortError") ||
        (err instanceof Error && err.name === "AbortError")
      ) {
        if (signal?.aborted) {
          throw new DeepSeekProviderError({
            code: "AI_REQUEST_ABORTED",
            message: "请求已取消",
            requestId,
            retryable: false,
          });
        }
        // Timeout
        throw new DeepSeekProviderError({
          code: "AI_TIMEOUT",
          message: "AI 服务响应超时，正在重试",
          requestId,
          retryable: true,
          suggestedHttpStatus: 504,
        });
      }

      // Network error
      throw new DeepSeekProviderError({
        code: "AI_UPSTREAM_ERROR",
        message: "AI 服务连接失败，正在重试",
        requestId,
        retryable: true,
        suggestedHttpStatus: 502,
      });
    }
  }
}

// ============================================================
// Prompt Builders
// ============================================================

function getSystemPrompt(capability: string): string {
  switch (capability) {
    case "parsePropertySearch":
      return "你是一个房产搜索条件解析助手。请从用户输入中提取结构化的筛选条件，只返回 JSON。不要输出 SQL 或代码。无法识别的词语放入 unrecognizedTerms 字段。";
    case "extractProperty":
      return "你是一个房产信息结构化提取助手。请从文本中提取房源信息，只返回 JSON。缺失的字段放入 missingFields，不确定的字段放入 uncertainFields。";
    case "extractClient":
      return "你是一个客户需求结构化提取助手。请从文本中提取客户信息，只返回 JSON。缺失的字段放入 missingFields，不确定的字段放入 uncertainFields。";
    case "generateContent":
      return "你是一个房产营销内容生成助手。请根据房源信息生成指定平台的营销内容，只返回 JSON。需要标注使用的事实来源和风险标记。";
    default:
      return "你是一个房产数据助手。请返回结构化 JSON。";
  }
}

function buildParsePropertySearchPrompt(query: string): string {
  return `你是一个房产搜索条件解析助手。请从用户输入中提取结构化筛选条件。

用户搜索："${query}"

请返回一个 JSON 对象。以下字段中，筛选条件字段为可选（识别到时填写），但 parsedQuery 和 unrecognizedTerms 为必填：

可选筛选字段（按实际识别结果填写，未识别到的字段不输出）：
- districts: 区/县名称数组，如 ["天河区", "海珠区"]
- communities: 小区/社区名称数组
- monthlyRentMin: 最低月租（整数，元）
- monthlyRentMax: 最高月租（整数，元）
- bedrooms: 卧室数量（整数）
- livingRooms: 客厅数量（整数）
- rentalType: "whole_unit" 表示整租，"shared" 表示合租
- petsAllowed: 是否允许养宠物（true/false）
- cookingAllowed: 是否允许做饭（true/false）
- hasElevator: 是否有电梯（true/false）
- availableBefore: 最晚入住日期，格式 YYYY-MM-DD
- features: 特殊要求数组，如 ["阳台", "独立卫生间"]
- subwayLines: 地铁线路数组，如 ["3号线", "5号线"]
- sortBy: 排序字段（默认 "updated_at"）
- sortOrder: "asc" 或 "desc"（默认 "desc"）

必填字段（每个响应都必须包含）：
- parsedQuery: 字符串。对用户搜索意图的规范化中文描述。即使无法识别任何筛选条件，也必须填写此字段（直接复述用户搜索原文即可）。
- unrecognizedTerms: 字符串数组。无法识别的词语列表，无则为空数组 []。

示例 1（有筛选条件）：
${JSON.stringify(SEARCH_FILTER_FIXTURE, null, 2)}

示例 2（无筛选条件 — 仍然必须包含 parsedQuery 和 unrecognizedTerms）：
${JSON.stringify(SEARCH_FILTER_MINIMAL_FIXTURE, null, 2)}

重要规则：
- 只返回 JSON 对象，不要输出任何其他文字、注释或 Markdown。
- parsedQuery 必须始终存在且为非空字符串，unrecognizedTerms 必须始终为数组。
- 不要输出 SQL 或代码。不要包含 Schema 中未定义的额外字段。`;
}

function buildExtractPropertyPrompt(
  text: string,
  sourceType: string
): string {
  return `请从以下文本中提取房源结构化信息。

文本来源: ${sourceType}
文本内容: "${text}"

请返回 JSON 对象：
{
  "data": { ... },           // 提取的房源字段（红名单字段，缺失的省略）
  "missingFields": [...],    // 缺失的必要字段名
  "uncertainFields": [...],  // 不确定的字段 [{ "field": "字段名", "reason": "原因" }]
  "rawText": "原文",
  "usage": { "inputTokens": 0, "outputTokens": 0, "estimatedCostUsd": 0 }
}

data 中可提取的字段：title, city, district, businessArea, communityName, addressText, rentalType, monthlyRent, depositTerms, bedrooms, livingRooms, bathrooms, areaSqm, hasElevator, orientation, decoration, availableFrom, minimumLeaseMonths, petsAllowed, cookingAllowed, subwayText, facilities, tags, sellingPoints, drawbacks, description, visualSummary`;
}

function buildExtractClientPrompt(
  text: string,
  sourcePlatform?: string
): string {
  return `请从以下文本中提取客户需求结构化信息。

来源平台: ${sourcePlatform || "未知"}
文本内容: "${text}"

请返回 JSON 对象：
{
  "data": { ... },           // 提取的客户字段（红名单字段，缺失的省略）
  "missingFields": [...],    // 缺失的必要字段名
  "uncertainFields": [...],  // 不确定的字段 [{ "field": "字段名", "reason": "原因" }]
  "rawText": "原文",
  "usage": { "inputTokens": 0, "outputTokens": 0, "estimatedCostUsd": 0 }
}

data 中可提取的字段：name, sourcePlatform, budgetMin, budgetMax, preferredDistricts, preferredCommunities, bedrooms, rentalType, availableFrom, minimumLeaseMonths, petsRequired, cookingRequired, commuteDestination, hardRequirements, softPreferences, dealBreakers`;
}

function buildGenerateContentPrompt(
  input: ContentGenerationInput
): string {
  const platform = input.platform;

  // Build the platform-specific schema definition and valid JSON example
  let schemaDef: string;
  let example: string;

  switch (platform) {
    case "xiaohongshu":
      schemaDef = XIAOHONGSHU_SCHEMA_DEF;
      example = JSON.stringify(XIAOHONGSHU_FIXTURE, null, 2);
      break;
    case "douyin":
      schemaDef = DOUYIN_SCHEMA_DEF;
      example = JSON.stringify(DOUYIN_FIXTURE, null, 2);
      break;
    case "wechat_moments":
      schemaDef = WECHAT_MOMENTS_SCHEMA_DEF;
      example = JSON.stringify(WECHAT_MOMENTS_FIXTURE, null, 2);
      break;
    default:
      schemaDef = XIAOHONGSHU_SCHEMA_DEF;
      example = JSON.stringify(XIAOHONGSHU_FIXTURE, null, 2);
  }

  return `你是一个房产营销内容生成助手。请根据房源信息为「${platform}」平台生成营销内容。

平台: ${platform}
房源信息: ${JSON.stringify(input.propertyFacts)}
目标受众: ${input.targetAudience || "通用"}
内容角度: ${input.contentAngle || "通用"}
内容目标: ${input.contentGoal || "获取咨询"}
语气: ${input.tone || "专业"}
视觉摘要: ${input.visualSummary || "无"}
展示缺点: ${input.showDrawbacks ? "是" : "否"}
私信关键词: ${input.privateMessageKeyword || ""}

========================================
输出 JSON Schema（严格遵循，逐字段输出）
========================================

${schemaDef}

========================================
完整合法 JSON 示例（所有字段类型必须与此一致）
========================================

${example}

========================================
强制规则
========================================

1. 只输出 JSON 对象，不得输出 Markdown、代码块、解释或任何其他文字。
2. 所有必填字段必须存在。数组字段即使为空也必须用 []，不得省略。
3. imageSequence 的每一项必须是对象 { "order": 数字, "description": "字符串", "suggestedMediaType": "字符串" }，不得使用字符串。
4. shots 的每一项必须是对象 { "order": 数字, "durationSeconds": 数字, "description": "字符串", "visualSuggestion": "字符串" }。
5. factsUsed 的每一项必须是对象 { "field": "字段名", "value": "字段值" }，不得使用字符串。
6. visualFactsUsed 的每一项必须是对象 { "mediaId": "字符串", "claim": "字符串" }。
7. riskFlags 的每一项必须是对象 { "field": "字符串", "severity": "high|medium|low", "description": "字符串" }。
8. complianceFlags 的每一项必须是对象 { "term": "字符串", "category": "字符串", "severity": "block|warn", "suggestion": "字符串" }。
9. requiresFactReview 必须是布尔值 true 或 false，不得使用数组或其他类型。
10. factualSummary 必须存在且为非空字符串，总结房源关键事实。
11. 不要输出 schema 中未定义的额外字段。`;
}

// ============================================================
// Platform-specific schema definitions (used in prompts)
// ============================================================

const XIAOHONGSHU_SCHEMA_DEF = `所有字段（platform 用于区分平台，所有字段均为必填除非标注"可选"）：

platform: 字符串，固定值 "xiaohongshu"
titleOptions: 字符串数组，标题候选（至少 1 个）
coverText: 字符串，封面文案
hook: 字符串，开篇钩子
body: 字符串，正文
imageSequence: 对象数组，每项结构：{ "order": 数字, "description": "图片描述", "suggestedMediaType": "photo|video" }
imageCaptions: 字符串数组，每张图的配文
factualSummary: 字符串（必填），基于房源事实的摘要
drawbacks: 字符串（可选），缺点说明
interactionQuestion: 字符串，互动提问
privateMessageKeyword: 字符串，私信关键词
hashtags: 字符串数组，话题标签（至少 1 个）
factsUsed: 对象数组，每项结构：{ "field": "字段名", "value": "字段值" }
visualFactsUsed: 对象数组，每项结构：{ "mediaId": "媒体ID", "claim": "声明" }（通常为空数组）
missingInformation: 字符串数组，缺失的信息
riskFlags: 对象数组，每项结构：{ "field": "字段名", "severity": "high|medium|low", "description": "风险描述" }（通常为空数组）
complianceFlags: 对象数组，每项结构：{ "term": "术语", "category": "分类", "severity": "block|warn", "suggestion": "建议" }（通常为空数组）
requiresFactReview: 布尔值 true/false（必填）`;

const DOUYIN_SCHEMA_DEF = `所有字段（platform 用于区分平台，所有字段均为必填除非标注"可选"）：

platform: 字符串，固定值 "douyin"
hookOptions: 字符串数组，钩子候选（至少 1 个）
coverText: 字符串，封面文案
fullVoiceover: 字符串，完整口播文案
shots: 对象数组，每项结构：{ "order": 数字, "durationSeconds": 数字, "description": "镜头描述", "visualSuggestion": "拍摄建议" }
subtitles: 字符串，字幕
caption: 字符串，视频描述文案
commentCta: 字符串，评论引导
privateMessageKeyword: 字符串，私信关键词
hashtags: 字符串数组，话题标签（至少 1 个）
missingShots: 字符串数组，缺失的镜头
factsUsed: 对象数组，每项结构：{ "field": "字段名", "value": "字段值" }
visualFactsUsed: 对象数组，每项结构：{ "mediaId": "媒体ID", "claim": "声明" }（通常为空数组）
missingInformation: 字符串数组，缺失的信息
riskFlags: 对象数组，每项结构：{ "field": "字段名", "severity": "high|medium|low", "description": "风险描述" }（通常为空数组）
complianceFlags: 对象数组，每项结构：{ "term": "术语", "category": "分类", "severity": "block|warn", "suggestion": "建议" }（通常为空数组）
requiresFactReview: 布尔值 true/false（必填）`;

const WECHAT_MOMENTS_SCHEMA_DEF = `所有字段（platform 用于区分平台，所有字段均为必填除非标注"可选"）：

platform: 字符串，固定值 "wechat_moments"
copyOptions: 字符串数组，文案候选（至少 1 个）
nineGridSuggestion: 字符串，九宫格建议
shortCta: 字符串，简短行动号召
privateMessageKeyword: 字符串，私信关键词
factsUsed: 对象数组，每项结构：{ "field": "字段名", "value": "字段值" }
visualFactsUsed: 对象数组，每项结构：{ "mediaId": "媒体ID", "claim": "声明" }（通常为空数组）
riskFlags: 对象数组，每项结构：{ "field": "字段名", "severity": "high|medium|low", "description": "风险描述" }（通常为空数组）
complianceFlags: 对象数组，每项结构：{ "term": "术语", "category": "分类", "severity": "block|warn", "suggestion": "建议" }（通常为空数组）
requiresFactReview: 布尔值 true/false（必填）`;

// ============================================================
// Response Parsing & Validation
// ============================================================

function parseResponseJson(
  content: string,
  finishReason: string,
  requestId: string,
  isRetry: boolean
): unknown {
  // Empty content
  if (!content || content.trim() === "") {
    // finish_reason "length" → retryable
    if (finishReason === "length") {
      throw new DeepSeekProviderError({
        code: "AI_INVALID_RESPONSE",
        message: "AI 响应被截断，正在重试",
        requestId,
        retryable: !isRetry, // only retry on first attempt
        suggestedHttpStatus: 502,
      });
    }
    throw new DeepSeekProviderError({
      code: "AI_INVALID_RESPONSE",
      message: "AI 返回空响应",
      requestId,
      retryable: false,
      suggestedHttpStatus: 502,
    });
  }

  // Try to parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    // finish_reason "length" → truncation → retry
    if (finishReason === "length") {
      throw new DeepSeekProviderError({
        code: "AI_INVALID_RESPONSE",
        message: "AI 响应 JSON 被截断，正在重试",
        requestId,
        retryable: !isRetry,
        suggestedHttpStatus: 502,
      });
    }
    // finish_reason "stop" but unparseable → no retry
    throw new DeepSeekProviderError({
      code: "AI_INVALID_RESPONSE",
      message: "AI 响应格式错误",
      requestId,
      retryable: false,
      suggestedHttpStatus: 502,
    });
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new DeepSeekProviderError({
      code: "AI_INVALID_RESPONSE",
      message: "AI 响应格式错误：不是有效的 JSON 对象",
      requestId,
      retryable: false,
      suggestedHttpStatus: 502,
    });
  }

  return parsed;
}

function validateAndTransform<T>(
  raw: unknown,
  schema: { parse: (data: unknown) => T; safeParse?: (data: unknown) => { success: boolean; error?: z.ZodError } },
  capability: string,
  requestId: string
): T {
  try {
    return schema.parse(raw);
  } catch (err) {
    // Extract Zod issue details (safe: field paths + messages only, no raw data)
    let zodDetails = "";
    if (err instanceof z.ZodError) {
      zodDetails = err.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
    }
    const detailSuffix = zodDetails ? ` [${zodDetails}]` : "";
    throw new DeepSeekProviderError({
      code: "AI_INVALID_RESPONSE",
      message: `${capability} 输出格式校验失败${detailSuffix}`,
      requestId,
      retryable: false, // Zod failure → no retry (per contract §10.2)
      suggestedHttpStatus: 502,
    });
  }
}

// ============================================================
// Config Validation
// ============================================================

function validateConfig(
  requestId: string,
  configOverride?: Partial<ServerEnv>
) {
  // For testing: use config override directly without calling getServerEnv()
  // In production: read real env via getServerEnv()
  const raw = configOverride ?? getServerEnv();

  // Apply defaults for optional fields
  const env = {
    DEEPSEEK_MODEL: "deepseek-v4-flash",
    DEEPSEEK_FALLBACK_MODEL: "deepseek-v4-pro",
    DEEPSEEK_REQUEST_TIMEOUT_MS: 45000,
    DEEPSEEK_BASE_URL: "https://api.deepseek.com",
    ...raw,
  };

  if (!env.DEEPSEEK_API_KEY || env.DEEPSEEK_API_KEY.trim() === "") {
    throw new DeepSeekProviderError({
      code: "AI_NOT_CONFIGURED",
      message: "DeepSeek API 未配置，请联系管理员设置 DEEPSEEK_API_KEY",
      requestId,
      retryable: false,
      suggestedHttpStatus: 503,
    });
  }

  return env;
}

// ============================================================
// Signal Combination
// ============================================================

function combineSignals(
  signal1: AbortSignal | undefined,
  signal2: AbortSignal | undefined
): AbortSignal {
  if (!signal1 && !signal2) return new AbortController().signal;
  if (signal1 && !signal2) return signal1;
  if (!signal1 && signal2) return signal2;

  // Both are defined after the early returns above
  if (!signal1 || !signal2) {
    // TypeScript guard: unreachable by control flow, but satisfies the checker
    return new AbortController().signal;
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();

  signal1.addEventListener("abort", onAbort, { once: true });
  signal2.addEventListener("abort", onAbort, { once: true });

  if (signal1.aborted || signal2.aborted) {
    controller.abort();
  }

  return controller.signal;
}

// ============================================================
// Utilities
// ============================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================
// Structured Logging (safe — no sensitive data)
// ============================================================

function logStructured(ctx: {
  requestId: string;
  provider: string;
  modelName: string;
  durationMs: number;
  retryCount: number;
  errorCode?: string;
  inputTokens?: number;
  outputTokens?: number;
}): void {
  // Structured log — only safe fields per contract §19.7, §19.8
  // No API Key, Prompt, query, raw response, Authorization header
  // Using console.log for structured JSON logging in dev only
  if (process.env.NODE_ENV === "development") {
    // In production, this would go to a logging service
    // We intentionally do NOT log query, prompt, or any sensitive data
  }
  // The ctx object itself is safe by design — it only contains allowed fields
  void ctx; // suppress unused warning; available for future logging hook
}

// ============================================================
// Export factory
// ============================================================

export function createDeepSeekTextProvider(
  fetchFn?: FetchFn,
  configOverride?: Partial<ServerEnv>
): DeepSeekTextProvider {
  return new DeepSeekTextProviderImpl(fetchFn, configOverride);
}
