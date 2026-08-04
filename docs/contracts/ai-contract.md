# HouseVibe AI Contract

| 属性 | 值 |
|---|---|
| 文档名称 | ai-contract |
| 版本 | 2.0 |
| 状态 | FROZEN FOR P3-AI-001; model refresh + retry/env/error contracts finalized |
| Owner | solution-architect |
| 依赖 | PRD v1.3, domain-model v1.0 |
| 最后更新 | 2026-08-03 |
| 模型核验日期 | 2026-08-03 |

---

## 1. Provider 边界

### 1.1 核心约束
- 所有 LLM/VLM 统一使用 DeepSeek。MUST NOT 配置 OpenAI、Anthropic、Gemini 等其他 LLM API Key 或回退路径。
- STT 是独立子系统，不属于 LLM/VLM。不得复用 DeepSeek 文本接口伪造语音识别。
- DeepSeek 文本与视觉 Provider 分离。视觉推理 MUST NOT 在 Vercel Function 内加载模型权重。
- 视觉端点必须是部署了 DeepSeek-VL 权重的独立 GPU 推理服务。

### 1.2 模型指定

**当前有效模型**（核验日期：2026-08-03，依据 DeepSeek 官方 API 文档）：

| 角色 | 模型 ID | 环境变量 |
|---|---|---|
| **Primary** | `deepseek-v4-flash` | `DEEPSEEK_MODEL`（默认 `deepseek-v4-flash`） |
| **Fallback** | `deepseek-v4-pro` | `DEEPSEEK_FALLBACK_MODEL`（默认 `deepseek-v4-pro`） |

**选择依据**：
- `deepseek-v4-flash`：更低延迟与成本。被选为默认模型，依据是较低成本与时延；实际业务 Schema 成功率必须由后续 Smoke/集成测试验证。
- `deepseek-v4-pro`：更高推理能力。保留为 Fallback，仅在 Primary 不可用或持续失败时切换。
- 已废弃模型 `deepseek-chat`、`deepseek-reasoner` 不得使用。

**Thinking 模式**：
- P3-AI-001 默认**不启用** Thinking（`thinking: { type: "disabled" }`）。
- Thinking 模式仅限 generateContent 等需要深度推理的场景，且必须通过独立合同（ADR）批准。
- 结构化提取（parsePropertySearch、extractProperty、extractClient）不得使用 Thinking。

**API 端点**：
- 使用 **Chat Completions API**：`POST https://api.deepseek.com/v1/chat/completions`，OpenAI 兼容格式。
- 本 Provider 合同基于 Chat Completions API 编写。`deepseek-v4-pro` 对 Responses API 的支持状态不在本合同范围内，不得混入 Provider 实现。

**模型兼容性**：
- `deepseek-v4-flash` 和 `deepseek-v4-pro` 使用相同 Chat Completions 端点与请求格式。
- 切换仅需更改 `model` 字段；请求 body、response shape、token counting 完全兼容。

**未知/下线模型处理**：
- 若 API 返回 `model_not_found` 或模型返回非预期 response shape，Provider 必须返回 `AI_UPSTREAM_ERROR`，不得静默退化。

**视觉模型**：
- 通过 `DEEPSEEK_VISION_MODEL` 指定，由独立 DeepSeek-VL endpoint 提供服务。
- 视觉模型配置仅 P3-AI-005（Vision Provider）需要；文本 Provider 不依赖视觉变量。

### 1.3 Provider 记录
- `ai_usage_logs.provider` MUST 固定为 `deepseek` 或 `deepseek_self_hosted`
- `content_versions.model_provider` MUST 固定为 `deepseek`
- 即使 SDK 兼容 OpenAI 格式，也不得记录为 OpenAI

---

## 2. TypeScript 接口（冻结契约）

### 2.1 TranscriptionProvider

```ts
// Owner: ai-deepseek-engineer
// Location: src/lib/ai/providers/transcription-provider.ts

interface TranscriptionInput {
  audioFile: File;
  purpose?: 'property' | 'client';
  language?: string;
  requestId?: string;
}

interface TranscriptionResult {
  text: string;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
  durationSeconds: number;
  provider: string;
  requestId: string;
  error?: TranscriptionError;
}

interface TranscriptionError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

interface TranscriptionProvider {
  transcribe(input: TranscriptionInput): Promise<TranscriptionResult>;
}
```

### 2.2 DeepSeekTextProvider

```ts
// Owner: ai-deepseek-engineer
// Location: src/lib/ai/providers/deepseek-text-provider.ts

interface DeepSeekTextProvider {
  extractProperty(input: PropertyExtractionInput): Promise<PropertyExtractionResult>;
  extractClient(input: ClientExtractionInput): Promise<ClientExtractionResult>;
  parsePropertySearch(input: SearchParseInput): Promise<PropertySearchFilters>;
  generateContent(input: ContentGenerationInput): Promise<GeneratedContent>;
}

// Shared types
interface AIRequestContext {
  requestId: string;
  promptVersion: string;
  modelName: string;
  idempotencyKey?: string;
}

interface AIUsage {
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

// --- extractProperty ---
interface PropertyExtractionInput {
  text: string;
  sourceType: "text" | "speech" | "wechat";
  requestId: string;
}

interface PropertyExtractionResult {
  data: RedactedPropertyFacts;
  missingFields: string[];
  uncertainFields: Array<{ field: string; reason: string }>;
  rawText: string;
  usage: AIUsage;
}

// --- extractClient ---
interface ClientExtractionInput extends AIRequestContext {
  text: string;
  sourcePlatform?: string;
  workspaceId: string;
  userId: string;
}

interface ClientExtractionResult {
  data: RedactedClientFacts;
  missingFields: string[];
  uncertainFields: Array<{ field: string; reason: string }>;
  rawText: string;
  usage: AIUsage;
}

// --- parsePropertySearch ---
interface SearchParseInput extends AIRequestContext {
  query: string;
}

interface PropertySearchFilters {
  districts?: string[];
  communities?: string[];
  monthlyRentMin?: number;
  monthlyRentMax?: number;
  bedrooms?: number;
  livingRooms?: number;
  rentalType?: 'whole_unit' | 'shared';
  petsAllowed?: boolean;
  cookingAllowed?: boolean;
  hasElevator?: boolean;
  availableBefore?: string;
  features?: string[];
  subwayLines?: string[];
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  parsedQuery: string;
  unrecognizedTerms: string[];
}

// --- generateContent ---
type ContentPlatform = 'xiaohongshu' | 'douyin' | 'wechat_moments';

interface ContentGenerationInput extends AIRequestContext {
  platform: ContentPlatform;
  propertyFacts: RedactedPropertyFacts;
  visualSummary?: string;
  confirmedAiLabels?: PropertyMediaAiLabel[];
  targetAudience?: string;
  contentAngle?: string;
  contentGoal?: string;
  tone?: string;
  videoDurationSeconds?: number;
  isOnCamera?: boolean;
  showDrawbacks?: boolean;
  privateMessageKeyword?: string;
  userPreferences?: UserPreferenceHint[];
  unresolvedVisualConflicts?: VisualFactCheck[];
}

// Platform-specific outputs
interface XiaohongshuOutput {
  titleOptions: string[];
  coverText: string;
  hook: string;
  body: string;
  imageSequence: ImageSequenceItem[];
  imageCaptions: string[];
  factualSummary: string;
  drawbacks?: string;
  interactionQuestion: string;
  privateMessageKeyword: string;
  hashtags: string[];
  factsUsed: FactReference[];
  visualFactsUsed: VisualFactReference[];
  missingInformation: string[];
  riskFlags: RiskFlag[];
  complianceFlags: ComplianceFlag[];
  requiresFactReview: boolean;
}

interface DouyinOutput {
  hookOptions: string[];
  coverText: string;
  fullVoiceover: string;
  shots: ShotItem[];
  subtitles: string;
  caption: string;
  commentCta: string;
  privateMessageKeyword: string;
  hashtags: string[];
  missingShots: string[];
  factsUsed: FactReference[];
  visualFactsUsed: VisualFactReference[];
  missingInformation: string[];
  riskFlags: RiskFlag[];
  complianceFlags: ComplianceFlag[];
  requiresFactReview: boolean;
}

interface WechatMomentsOutput {
  copyOptions: string[];
  nineGridSuggestion: string;
  shortCta: string;
  privateMessageKeyword: string;
  factsUsed: FactReference[];
  visualFactsUsed: VisualFactReference[];
  riskFlags: RiskFlag[];
  complianceFlags: ComplianceFlag[];
  requiresFactReview: boolean;
}

type GeneratedContent = XiaohongshuOutput | DouyinOutput | WechatMomentsOutput;
```

### 2.3 DeepSeekVisionProvider

```ts
// Owner: ai-deepseek-engineer
// Location: src/lib/ai/providers/deepseek-vision-provider.ts

interface DeepSeekVisionProvider {
  analyzePropertyImages(input: VisionAnalysisInput): Promise<PropertyVisionResult>;
}

interface VisionAnalysisInput extends AIRequestContext {
  imageUrls: string[];  // Service-generated short-lived signed URLs
  propertyFacts: RedactedPropertyFacts;
  schemaVersion: string;
}

interface PropertyVisionResult {
  mediaResults: SingleImageResult[];
  visualSummary: string;
  factChecks: VisualFactCheck[];
  usage: AIUsage;
}

interface SingleImageResult {
  mediaId: string;
  aiLabels: PropertyMediaAiLabel;
  status: 'completed' | 'failed';
  error?: string;
}

interface PropertyMediaAiLabel {
  sceneType: string;
  styles: string[];
  visibleFeatures: string[];
  condition: string[];
  lighting: string[];
  appliances: string[];
  confidence: number;
  evidence: string[];
  uncertainLabels: string[];
}

interface VisualFactCheck {
  textClaim: string;
  fieldName: string;
  visualResult: VisualFactLevel;
  confidence: number;
  suggestion: string;
}

type VisualFactLevel =
  | 'not_verified_by_images'
  | 'insufficient_evidence'
  | 'weak_visual_support'
  | 'confirmed_visual_support'
  | 'possible_conflict';
```

### 2.4 隐私字段类型定义

```ts
// --- Redacted types (safe to send to DeepSeek) ---
interface RedactedPropertyFacts {
  title?: string;
  city?: string;
  district?: string;
  businessArea?: string;
  communityName?: string;
  addressText?: string;
  rentalType?: string;
  monthlyRent?: number;
  depositTerms?: string;
  bedrooms?: number;
  livingRooms?: number;
  bathrooms?: number;
  areaSqm?: number;
  hasElevator?: boolean;
  orientation?: string;
  decoration?: string;
  availableFrom?: string;
  minimumLeaseMonths?: number;
  petsAllowed?: boolean;
  cookingAllowed?: boolean;
  subwayText?: string;
  facilities?: unknown;
  tags?: string[];
  sellingPoints?: string[];
  drawbacks?: string[];
  description?: string;
  visualSummary?: string;
  // MUST NOT include: ownerName, ownerPhone, ownerWechat, exactAddress,
  // buildingNo, unitNo, roomNo, internalNotes, keyLocation
}

interface RedactedClientFacts {
  name?: string;
  sourcePlatform?: string;
  budgetMin?: number;
  budgetMax?: number;
  preferredDistricts?: string[];
  preferredCommunities?: string[];
  bedrooms?: number;
  rentalType?: string;
  availableFrom?: string;
  minimumLeaseMonths?: number;
  petsRequired?: boolean;
  cookingRequired?: boolean;
  commuteDestination?: string;
  hardRequirements?: unknown;
  softPreferences?: unknown;
  dealBreakers?: string[];
  // MUST NOT include: phone, wechat
}
```

---

## 3. 隐私字段禁止发送清单

以下字段在调用 DeepSeek 前 MUST 通过隐私预处理移除或替换：

| 所属实体 | 禁止字段 |
|---|---|
| properties | `owner_name`, `owner_phone`, `owner_wechat` (in private_details) |
| properties | `exact_address`, `building_no`, `unit_no`, `room_no` (in private_details) |
| properties | `internal_notes`, `key_location` (in private_details) |
| clients | `phone`, `wechat` |

---

## 4. Structured Output Schema（Zod）

### 4.1 通用 Schema 名称

每个 AI 能力对应的 Zod Schema 名称：

| 能力 | Zod Schema | 用途 |
|---|---|---|
| extract-property | `PropertyExtractionOutputSchema` | 房源解析输出校验 |
| extract-client | `ClientExtractionOutputSchema` | 客户解析输出校验 |
| parse-property-search | `PropertySearchFilterSchema` | 搜索条件输出校验 |
| analyze-property-images | `PropertyVisionResultSchema` | 视觉分析输出校验 |
| generate-content | `ContentGenerationOutputSchema` | 内容生成输出校验 |

Zod Schema 由 `src/lib/ai/schemas/` 下的 `ai-deepseek-engineer` 拥有。

### 4.2 缺失/不确定/风险字段表示

- 缺失字段：`missingFields: string[]` -- 字段名列表
- 不确定字段：`uncertainFields: Array<{ field: string; reason: string }>`
- 风险标记：`riskFlags: Array<{ field: string; severity: 'high' | 'medium' | 'low'; description: string }>`

### 4.3 请求追踪

每个 AI 请求必须包含：
- `requestId: string` (UUID) -- 用于关联日志、纠错和配额
- `promptVersion: string` -- 当前 Prompt 模板版本号
- `modelName: string` -- 实际调用的模型名称

---

## 5. 视觉事实等级（VisualFactLevel）

| 等级 | 含义 | 前端展示 |
|---|---|---|
| `not_verified_by_images` | 图片未拍到，不得判定为假 | 灰色标记："图片未验证" |
| `insufficient_evidence` | 有图片但无法判断 | 灰色标记："证据不足" |
| `weak_visual_support` | 图片提供弱证据 | 浅绿色/蓝色标记："弱支持" |
| `confirmed_visual_support` | 图片明确支持 | 绿色标记："已确认" |
| `possible_conflict` | 图片明确反证 | 橙色/红色标记："疑似冲突" |

**关键规则**：图片未展示某特征不能等同于反证。只有 `possible_conflict` 表示明确视觉冲突。

---

## 6. property_media.ai_labels JSON 结构（冻结）

```ts
interface PropertyMediaAiLabel {
  sceneType: string;           // "living_room" | "bedroom" | "kitchen" | "bathroom" | "balcony" | "exterior" | ...
  styles: string[];            // ["modern", "minimal", "french", "industrial", "chinese", ...]
  visibleFeatures: string[];   // ["floor_to_ceiling_window", "balcony_door", "open_kitchen", ...]
  condition: string[];         // ["well_maintained", "lightly_aged", "obviously_dated", "pending_confirmation"]
  lighting: string[];          // ["bright_natural_light", "moderate", "dim", "cannot_determine"]
  appliances: string[];        // ["air_conditioner", "washing_machine", "refrigerator", ...]
  confidence: number;          // 0.0 - 1.0
  evidence: string[];          // ["media-uuid"] -- 证据媒体 ID
  uncertainLabels: string[];   // 不确定的标签列表
}
```

---

## 7. properties.visual_summary（冻结）

字段类型：`TEXT`（自由文本摘要）。

必须包含"不足以判断"的边界说明。不得把未拍摄空间推断为不存在或状态良好。

---

## 8. properties.visual_fact_flags JSON 结构（冻结）

```ts
type VisualFactFlag = {
  textClaim: string;
  fieldName: string;
  visualResult: 'not_verified_by_images' | 'insufficient_evidence' | 'weak_visual_support' | 'confirmed_visual_support' | 'possible_conflict';
  confidence: number;
  evidenceMediaIds: string[];
  suggestion: string;
};

type VisualFactFlags = VisualFactFlag[];
```

---

## 9. AI 纠错流程

```
requestId
→ 服务端读取 AI 原始输出
→ 对隐私字段脱敏或排除
→ 比较 AI 原始输出与用户确认输出
→ 计算字段级 JSON Diff
→ 保存脱敏后的 original_output, corrected_output, diff 至 ai_correction_logs
```

**要求**：
- Diff MUST 在服务端计算，不信任客户端提交的差异结果。
- MUST NOT 记录未脱敏的电话、微信和精确地址到纠错日志。
- 只记录发生变化的字段、原值、确认值和修改类型。
- 用户直接手工创建且没有 `requestId` 时不创建纠错日志。

**禁止**：
- 不进行在线模型微调。
- 用户偏好仅影响 Prompt 上下文和候选排序，不得绕过事实与合规。

---

## 10. 重试策略与 Circuit Breaker

### 10.1 请求尝试上限

每次 Provider 调用最多 **2 次 HTTP 请求尝试**（首次 + 最多 1 次重试）。单次尝试超时 = `DEEPSEEK_REQUEST_TIMEOUT_MS`（默认 45000ms）。

总耗时上限 = 2 × timeout + retry delay ≈ 95s（两个 45s timeout + 5s backoff）。

### 10.2 重试规则

| 场景 | 重试? | 重试模型 | 说明 |
|---|---|---|---|
| HTTP 429 (DeepSeek rate limit) | **Yes, 1×** | Same model | 优先读取 `Retry-After` header；无 header 时使用 1s–3s random jitter backoff |
| HTTP 500 / 502 / 503 / 504 | **Yes, 1×** | Fallback model | 切换至 `DEEPSEEK_FALLBACK_MODEL`；若 Fallback 也不可用，返回 `AI_UPSTREAM_ERROR` |
| Network error / DNS failure / connection reset | **Yes, 1×** | Fallback model | 同上 |
| Timeout (>45s) | **Yes, 1×** | Fallback model | 同上 |
| HTTP 200 but body is empty or unparseable JSON | **Depends on `finish_reason`** | Fallback model | `finish_reason: \"length\"` → retry; `finish_reason: \"stop\"` → NO retry (model completed but output is corrupt, per §11.4) |
| HTTP 200 + valid JSON + Zod schema fails | **No** | N/A | Schema 失败表明 Prompt/模型输出质量问题，重试大概率重复失败 |
| HTTP 400 / 401 / 402 / 403 / 404 / 422 | **No** | N/A | 客户端/权限/配置错误，重试无意义 |
| AbortError (client disconnect) | **No** | N/A | 连接已关闭，无法发送响应 |
| HTTP 200 + Zod pass | N/A | N/A | 成功 |

### 10.3 Fallback Model 切换

Fallback Model（`deepseek-v4-pro`）**仅在上表明确允许时切换**。不得无条件将 Primary 错误切换至 Fallback。

切换至 Fallback 时：
- 使用相同 request body，仅更改 `model` 字段。
- Fallback 调用计入同一个 Provider 请求的总尝试次数（最多 2 次）。
- Fallback 也不可用时，返回 `AI_UPSTREAM_ERROR`；不进行第三次尝试，不循环。

### 10.4 Circuit Breaker — Deferred

Circuit Breaker（连续 N 次失败后自动熔断）**不在 P3-AI-001 范围内实现**。

P3-AI-001 仅实现单次调用的重试逻辑（§10.2）。跨请求的状态存储、窗口计数、熔断恢复属于独立任务（建议 P3-AI-016），需要持久化状态（数据库或 Redis）。

P3-AI-001 Provider 必须暴露每次调用的成功/失败结果，为后续 Circuit Breaker 提供数据接口，但不对跨请求状态做出决策。

### 10.5 超时策略

- 文本模型：45 秒（`DEEPSEEK_REQUEST_TIMEOUT_MS`）
- 视觉模型：60 秒
- STT：30 秒
- 单次 HTTP 请求超时 = `DEEPSEEK_REQUEST_TIMEOUT_MS`；重试时重新计时。

### 10.6 Abort 行为

- Provider 方法接受可选 `AbortSignal`。
- Abort 触发时，in-flight HTTP 请求立即取消。
- `AbortError` 映射为 `AI_REQUEST_ABORTED`，**绝不重试**。
- Aborted 请求不计入 Circuit Breaker 失败计数（未来实现时）。

---

## 11. JSON 输出合同

### 11.1 请求配置

所有 DeepSeek Text Provider 调用 MUST 使用：

```json
{
  "response_format": { "type": "json_object" }
}
```

### 11.2 Prompt 要求

- System/user prompt MUST 明确要求返回 JSON。
- Prompt MUST 包含目标 JSON 结构的完整示例。
- 示例中的字段名、类型和嵌套结构必须与实际 Zod Schema 一致。

### 11.3 max_tokens

- 每次请求 MUST 设置 `max_tokens`，防止无限输出。
- parsePropertySearch：建议 1024 tokens。
- extractProperty / extractClient：建议 2048 tokens。
- generateContent：建议 4096 tokens。
- 具体值可通过环境变量覆盖，但不得省略。

### 11.4 空 Content 与截断

- 若模型返回 `choices[0].message.content` 为空字符串或仅空白 → `AI_INVALID_RESPONSE`，重试 1×（§10.2）。
- 若 JSON 被截断（以 `finish_reason: "length"` 结束且无法 parse）→ `AI_INVALID_RESPONSE`，重试 1×（§10.2）。
- 若 `finish_reason` 为 `"stop"` 但 JSON 仍不可 parse → `AI_INVALID_RESPONSE`，不重试（模型确认完成但输出非法）。

### 11.5 解析后 Zod 校验

- JSON.parse 成功是必要条件，不是充分条件。
- 所有输出 MUST 经过对应的 Zod Schema 校验。
- `PropertySearchFilterSchema` MUST 使用 `strict()`，拒绝额外字段。
- 仅因 JSON 可解析就信任字段内容属于合同违反。

### 11.6 Schema 唯一性

- `PropertySearchFilterSchema` 是 parsePropertySearch 的唯一输出 Schema。
- 不存在第二套并行 Schema 或宽松回退 Schema。
- 其他能力（extractProperty、extractClient、generateContent）各有独立 Zod Schema，定义在 `src/lib/ai/schemas/`。

---

## 12. 环境变量与 Fail-Closed

### 12.1 全局 Schema：AI 配置 Optional

全局 Server Env Schema（`src/config/env.ts` `serverEnvSchema`）中，所有 AI 相关变量 MUST 为 `.optional()`：

```ts
DEEPSEEK_API_KEY: z.string().min(1).optional(),
DEEPSEEK_BASE_URL: z.string().url().optional(),
DEEPSEEK_MODEL: z.string().default("deepseek-v4-flash"),
DEEPSEEK_FALLBACK_MODEL: z.string().default("deepseek-v4-pro"),
// Note: .default() alone makes the field optional-on-input + guaranteed-on-output.
// Do NOT chain .optional() — it short-circuits and drops the default in Zod v3.
DEEPSEEK_REQUEST_TIMEOUT_MS: z.coerce.number().int().default(45000),
// Vision 变量全部 optional
DEEPSEEK_VISION_BASE_URL_PRIMARY: z.string().url().optional(),
DEEPSEEK_VISION_BASE_URL_FALLBACK: z.string().url().optional(),
DEEPSEEK_VISION_API_KEY: z.string().min(1).optional(),
```

**要求**：
- 普通应用（Properties、Clients、Auth、Settings）在未配置任何 AI 变量时必须正常启动。
- Unit 测试无 Key 可运行。
- Build 无 Key 可完成。
- 只有实际调用 AI Provider 时才检查配置。

### 12.2 Provider 初始化：独立 Validate

Provider 构造或首次调用时，MUST 独立校验所需变量：

```ts
// In DeepSeekTextProvider constructor or first method call
if (!apiKey || !baseUrl) {
  throw new DeepSeekProviderError({
    code: "AI_NOT_CONFIGURED",
    message: "DeepSeek API 未配置，请联系管理员设置 DEEPSEEK_API_KEY",
    requestId,
    retryable: false,
  });
}
```

### 12.3 Key 安全

- `DEEPSEEK_API_KEY` 仅服务端读取；不得使用 `NEXT_PUBLIC_` 前缀。
- 不得硬编码默认 Key、伪 Key 或空字符串绕过。
- Key 不得出现在：客户端 bundle、日志、错误详情、测试快照、审计记录。
- Key 缺失时 fail closed；不得静默退化到无 AI 模式。
- `DEEPSEEK_BASE_URL` 必须通过 HTTPS；拒绝 `http://`（localhost 开发除外）。
- `DEEPSEEK_VISION_BASE_URL_PRIMARY` 和 `DEEPSEEK_VISION_BASE_URL_FALLBACK` 同样必须为 HTTPS（若已配置）。空值表示未配置，允许普通应用启动；配置为 `http://` 时必须校验失败。
- 不得允许生产 AI Key 通过明文 HTTP 发送。
- `SUPABASE_SERVICE_ROLE_KEY` 不属于应用运行时 `serverEnvSchema`。仅允许数据库管理、部署或测试工具使用。Route Handler、AI Provider 和应用代码禁止读取。参见 `error-and-env-conventions.md` §3.1。

### 12.4 Vision 变量隔离

- Vision 变量（`DEEPSEEK_VISION_*`）仅 P3-AI-005（Vision Provider）需要。
- P3-AI-001（Text Provider）不读取、不验证、不因 Vision 变量缺失而失败。
- 文本 Provider 与视觉 Provider 的 env 依赖完全解耦。

---

## 13. Provider 隐私责任

Provider 自身必须保持最小暴露面。Route Handler（P3-AI-004）额外负责输入预处理，但 Provider 不得依赖 Route Handler 来保证安全。

### 13.1 窄类型 DTO

Provider 方法仅接受窄类型 DTO：
- `parsePropertySearch`：仅 `{ query: string, requestId: string, promptVersion: string, modelName: string }`
- `extractProperty`：仅 `RedactedPropertyFacts`（已移除 PII 字段）
- `extractClient`：仅 `RedactedClientFacts`（已移除 PII 字段）

**禁止接收**：完整 `Property`、`Client`、`User` 对象，或任何包含 `phone`、`wechat`、`email`、`token`、`cookie`、`authorization` header 的数据结构。

### 13.2 日志与记录

Provider 内部 MUST NOT：
- 记录用户 query 全文
- 记录模型原始响应 body
- 记录 `Authorization` header
- 将 Prompt 或响应写入数据库
- 将 Prompt 或响应写入文件系统

Provider 仅可记录：
- `requestId`（UUID）
- `durationMs`（请求耗时）
- `modelName`（使用的模型）
- `errorCode`（若失败）
- `retryCount`（重试次数）
- `inputTokens` / `outputTokens` / `estimatedCostUsd`（Usage）

---

## 14. Smoke Test 合同

> **P3-AI-001 终局决议**：联网 Smoke Test 为后续独立任务，Owner 为 `integration-engineer`。Smoke 文件与 `package.json` 脚本必须同一任务交付。当前 P3-AI-001 Provider 门禁只使用 Mock；默认 Unit/CI 不需要真实 Key。

### 14.1 文件位置

```
src/lib/ai/providers/__tests__/deepseek-text-provider.smoke.test.ts
```

### 14.2 运行条件

Smoke test 不得匹配默认 Vitest `include` pattern（`src/**/*.test.ts`）。Smoke 文件使用独立命名 `*.smoke.test.ts`，默认 vitest config 不包含 `*.smoke.*` pattern。

独立运行命令（需添加至 `package.json` scripts）：

```bash
SMOKE_TEST=true npx vitest run --include='**/*.smoke.test.ts'
```

### 14.3 双重门控

Smoke test MUST 在 `beforeAll` 中检查：

```ts
if (process.env.SMOKE_TEST !== "true") {
  throw new Error("SMOKE_TEST must be 'true' to run smoke tests");
}
if (!process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY === "sk-test-dummy") {
  throw new Error("DEEPSEEK_API_KEY must be set to a real key for smoke tests");
}
```

缺少任一条件时，命令必须明确失败（非零退出码），**不得标记为 skipped**。

### 14.4 禁止事项

- Smoke test 中不得使用 `test.skip`、`describe.skip`、`it.skip`。
- 不得在 CI 中默认执行。
- 不得输出 Prompt 全文、模型原始响应或 API Key 到 stdout/stderr。
- 不得将真实 API 响应写入测试快照。

### 14.5 测试范围

Smoke test 仅验证：
- 真实 DeepSeek API 可连通
- 请求格式被接受（200 响应）
- 响应 JSON 结构符合 Zod Schema
- 不评估内容质量或准确性

---

## 15. 图片 URL 安全规则

1. 公共 API 优先接收 `propertyMediaIds`，服务端生成短期签名 URL。
2. Provider 内部接口可以使用 `imageUrls` 数组，但 URL MUST 由服务端生成且经过：
   - 域名白名单校验
   - SSRF 防护（拒绝 `file://`、环回地址、云元数据地址、内网地址）
3. MUST NOT 将永久公开 URL 发送给视觉端点。
4. MUST NOT 允许客户端传入任意 URL。
5. 发送前移除不必要 EXIF 元数据。
6. 单次视觉分析默认最多 8 张图片（`DEEPSEEK_VISION_MAX_IMAGES`）。

---

## 16. AI 请求 10 步顺序

每次 AI 请求 MUST 按以下顺序执行：

1. 身份验证 -- 确认 auth.uid()
2. 功能授权 -- has_feature() 检查
3. 原子配额与成本预占 -- reserve_ai_quota()
4. 资源访问权限 -- 验证房源/客户/媒体的 workspace 归属
5. 隐私预处理 -- 移除禁止字段
6. 模型调用 -- DeepSeek Text / Vision Provider
7. Structured Output + Zod -- JSON Schema 校验
8. 事实与图文交叉校验 -- 视觉事实 vs 文字事实
9. 合规扫描 -- Compliance Shield
10. 用量与纠错日志 -- 结算 cost + Diff 记录

---

## 17. Prompt 版本管理

- 每个 AI 能力的 Prompt 模板必须版本化。
- `prompt_version` 记录在 `ai_usage_logs` 和 `content_versions` 中。
- Prompt 变化必须更新版本号。
- Prompt 模板由 `src/lib/ai/prompts/` 下的 `ai-deepseek-engineer` 拥有。

---

## 18. 依赖与归属

- 所有 Provider 接口实现由 **ai-deepseek-engineer** 拥有。
- Zod Schema 由 **ai-deepseek-engineer** 拥有（`src/lib/ai/schemas/`）。
- Prompt 模板由 **ai-deepseek-engineer** 拥有（`src/lib/ai/prompts/`）。
- 隐私预处理模块由 **ai-deepseek-engineer** 拥有（`src/lib/privacy/`）。
- 合规扫描模块由 **ai-deepseek-engineer** 拥有（`src/lib/compliance/`）。
- `reserve_ai_quota` 数据库函数由 **data-security-engineer** 实现，接口与 **ai-deepseek-engineer** 协商。
- 此契约冻结后，任何修改 MUST 通过 ADR 流程。

---

## 19. Provider Error Contract (Frozen for P3-AI-001)

### 19.1 Error Type Union

Provider 返回类型化错误对象，NOT `{ data, error }` HTTP envelopes（HTTP envelope 是 Route Handler 的职责）。

```ts
// Owner: ai-deepseek-engineer
// Location: src/lib/ai/types.ts

type DeepSeekProviderErrorCode =
  | "AI_NOT_CONFIGURED"    // Missing DEEPSEEK_API_KEY / DEEPSEEK_BASE_URL
  | "AI_TIMEOUT"           // Request exceeded DEEPSEEK_REQUEST_TIMEOUT_MS
  | "AI_RATE_LIMITED"      // DeepSeek returned HTTP 429
  | "AI_UPSTREAM_ERROR"    // DeepSeek 5xx / connection failure / DNS error
  | "AI_INVALID_RESPONSE"  // JSON parse failure or Zod validation failure
  | "AI_REQUEST_ABORTED";  // Client AbortError

interface DeepSeekProviderError {
  code: DeepSeekProviderErrorCode;
  message: string;            // Human-readable Chinese description
  requestId: string;
  upstreamStatus?: number;    // Raw HTTP status from DeepSeek (if applicable)
  retryable: boolean;
  suggestedHttpStatus?: number; // Recommended HTTP mapping for Route Handler
}
```

### 19.2 Error Semantics

| Code | Trigger | Retryable? | suggestedHttpStatus |
|---|---|---|---|
| `AI_NOT_CONFIGURED` | `getServerEnv()` 无有效 DEEPSEEK_API_KEY 或 DEEPSEEK_BASE_URL | No | 503 |
| `AI_TIMEOUT` | `fetch` 在 `DEEPSEEK_REQUEST_TIMEOUT_MS` 内未完成 | Yes (1×) | 504 |
| `AI_RATE_LIMITED` | DeepSeek 返回 HTTP 429 | Yes (1×, per §10.2) | **502** (NOT 429 — 429 reserved for user-level rate limiting) |
| `AI_UPSTREAM_ERROR` | DeepSeek 5xx / connection reset / DNS failure | Yes (1×, per §10.2) | 502 |
| `AI_INVALID_RESPONSE` | JSON 不可 parse OR Zod Schema 失败 | Depends (§10.2): JSON parse fail→retry; Zod fail→no retry | 502 |
| `AI_REQUEST_ABORTED` | `AbortError` from fetch | **No** | N/A (connection closed) |

### 19.3 Error-to-HTTP Mapping (for P3-AI-004)

Route Handler（P3-AI-004）拥有 HTTP envelope 的最终决定权。Provider 仅通过 `suggestedHttpStatus` 提供建议映射：

| Provider Error | Suggested HTTP | Error Code in Envelope | Notes |
|---|---|---|---|
| `AI_NOT_CONFIGURED` | 503 | `AI_NOT_CONFIGURED` | Service unavailable |
| `AI_TIMEOUT` | 504 | `AI_TIMEOUT` | Gateway timeout |
| `AI_RATE_LIMITED` | 502 | `AI_RATE_LIMITED` | DeepSeek 侧限流；**NOT 429** |
| `AI_UPSTREAM_ERROR` | 502 | `AI_UPSTREAM_ERROR` | Bad gateway |
| `AI_INVALID_RESPONSE` | 502 | `AI_INVALID_RESPONSE` | 区别于 `INVALID_AI_OUTPUT`（内容合规） |
| `AI_REQUEST_ABORTED` | N/A | N/A | 无法发送 HTTP 响应；仅日志；不计入 Circuit Breaker |

### 19.4 Upstream Key Error 的特殊处理

若 DeepSeek 返回 HTTP 401（上游 API Key 无效）：
- Provider MUST 返回 `AI_UPSTREAM_ERROR`（NOT `AI_NOT_CONFIGURED` — 配置存在但无效）。
- `suggestedHttpStatus` = 502（NOT 401 — 上游 401 不是用户未认证）。
- 不得将上游 401 映射为用户 `UNAUTHENTICATED`。

### 19.5 HTTP 402 (Payment Required)

若 DeepSeek 返回 HTTP 402（余额不足）：
- Provider MUST 返回 `AI_UPSTREAM_ERROR`。
- `message` MUST 包含 "AI 服务账户余额不足，请联系管理员"。
- `suggestedHttpStatus` = 502。

### 19.6 错误对象字段

Provider Error 对象（返回给调用方 Route Handler 的 typed result）MUST 仅包含以下字段：

```ts
interface DeepSeekProviderError {
  code: DeepSeekProviderErrorCode;     // 机器可读错误码
  message: string;                     // 人类可读中文描述（safeMessage）
  requestId: string;                   // 关联 ID
  retryable: boolean;                  // 是否允许重试
  suggestedHttpStatus?: number;        // 建议 HTTP 映射
  upstreamStatus?: number;             // DeepSeek 原始 HTTP 状态码（可选，非敏感）
}
```

### 19.7 结构化日志上下文（与 Error 对象分离）

Provider 内部可记录结构化日志上下文。以下字段属于**日志上下文**，不属于 Error 对象必需属性：

```ts
interface StructuredLogContext {
  requestId: string;       // 关联 ID
  provider: string;        // "deepseek"
  modelName: string;       // 实际使用的模型名
  durationMs: number;      // 请求耗时
  retryCount: number;      // 重试次数
  errorCode?: string;      // 若失败，错误码
  inputTokens?: number;    // Usage
  outputTokens?: number;   // Usage
}
```

### 19.8 安全约束（Error + Log 共同遵守）

Error 对象和日志上下文 MUST NOT 包含：
- `DEEPSEEK_API_KEY`（全文或部分）
- 完整 Prompt 文本
- 用户 query 全文
- 模型原始响应 body
- `Authorization` header 值
- Cookie、Token 或任何认证凭据

Error 对象 MAY 包含脱敏后的错误上下文（如 `"response was not valid JSON"` 而非 response 内容）。

日志上下文仅记录 `requestId`、`durationMs`、`modelName`、`retryCount`、`errorCode`、`inputTokens`/`outputTokens`。不记录 Prompt、query、原始响应或 Authorization Header。

---

## 20. Open Questions

无。所有影响 Phase 1 的问题均已在 HouseVibe Phase 0 v1.0 中冻结。
