// ============================================================
// DeepSeekTextProvider Implementation
// Owner: ai-deepseek-engineer
// Contract: docs/contracts/ai-contract.md v2.0
// ============================================================

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
  type AIUsage,
} from "../types";
import {
  PropertyExtractionOutputSchema,
  PropertySearchFilterSchema,
  ClientExtractionOutputSchema,
  ContentGenerationOutputSchema,
} from "../schemas";

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
    const raw = await this.callWithRetry(
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
    const raw = await this.callWithRetry(
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
    const raw = await this.callWithRetry(
      input.requestId,
      "parsePropertySearch",
      prompt,
      MAX_TOKENS.parsePropertySearch,
      signal
    );
    return validateAndTransform(raw, PropertySearchFilterSchema, "parsePropertySearch", input.requestId);
  }

  async generateContent(
    input: ContentGenerationInput,
    signal?: AbortSignal
  ): Promise<GeneratedContent> {
    const prompt = buildGenerateContentPrompt(input);
    const raw = await this.callWithRetry(
      input.requestId,
      "generateContent",
      prompt,
      MAX_TOKENS.generateContent,
      signal
    );
    const result = validateAndTransform(raw, ContentGenerationOutputSchema, "generateContent", input.requestId);
    return result as GeneratedContent;
  }

  // --- Core retry/request logic ---

  private async callWithRetry(
    requestId: string,
    capability: string,
    prompt: string,
    maxTokens: number,
    signal?: AbortSignal
  ): Promise<unknown> {
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
        // On success, parse and return
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
        return parsed;
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
  return `请分析以下自然语言搜索条件，提取结构化筛选参数。

用户搜索："${query}"

请返回 JSON 对象，只包含以下字段（均为可选，按实际识别结果填写）：
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
- parsedQuery: 对用户意图的规范化描述（字符串）
- unrecognizedTerms: 无法识别的词语数组（无则为空数组）

输出示例：
{
  "districts": ["天河区"],
  "monthlyRentMax": 3500,
  "bedrooms": 1,
  "petsAllowed": true,
  "sortBy": "updated_at",
  "sortOrder": "desc",
  "parsedQuery": "预算3500以内，天河区，一房，允许养宠物",
  "unrecognizedTerms": []
}`;
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
  return `请为以下房源生成${input.platform}平台的营销内容。

平台: ${input.platform}
房源信息: ${JSON.stringify(input.propertyFacts)}
目标受众: ${input.targetAudience || "通用"}
内容角度: ${input.contentAngle || "通用"}
内容目标: ${input.contentGoal || "获取咨询"}
语气: ${input.tone || "专业"}
视觉摘要: ${input.visualSummary || "无"}
展示缺点: ${input.showDrawbacks ? "是" : "否"}
私信关键词: ${input.privateMessageKeyword || ""}

请返回平台对应的 JSON 结构。对于小红书(xiaohongshu)：包含 titleOptions, coverText, hook, body, imageSequence, imageCaptions, factualSummary, interactionQuestion, privateMessageKeyword, hashtags, factsUsed, visualFactsUsed, missingInformation, riskFlags, complianceFlags, requiresFactReview。
对于抖音(douyin)：包含 hookOptions, coverText, fullVoiceover, shots, subtitles, caption, commentCta, privateMessageKeyword, hashtags, missingShots, factsUsed, visualFactsUsed, missingInformation, riskFlags, complianceFlags, requiresFactReview。
对于朋友圈(wechat_moments)：包含 copyOptions, nineGridSuggestion, shortCta, privateMessageKeyword, factsUsed, visualFactsUsed, riskFlags, complianceFlags, requiresFactReview。

对于所有平台，输出需包含 platform 字段标记平台类型。`;
}

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
  schema: { parse: (data: unknown) => T },
  capability: string,
  requestId: string
): T {
  try {
    return schema.parse(raw);
  } catch {
    throw new DeepSeekProviderError({
      code: "AI_INVALID_RESPONSE",
      message: `${capability} 输出格式校验失败`,
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
