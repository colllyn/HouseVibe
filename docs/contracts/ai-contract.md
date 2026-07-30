# HouseVibe AI Contract

| 属性 | 值 |
|---|---|
| 文档名称 | ai-contract |
| 版本 | 1.0 |
| 状态 | FROZEN FOR PHASE 1 |
| Owner | solution-architect |
| 依赖 | PRD v1.3, domain-model v1.0 |
| 最后更新 | 2026-07-30 |

---

## 1. Provider 边界

### 1.1 核心约束
- 所有 LLM/VLM 统一使用 DeepSeek。MUST NOT 配置 OpenAI、Anthropic、Gemini 等其他 LLM API Key 或回退路径。
- STT 是独立子系统，不属于 LLM/VLM。不得复用 DeepSeek 文本接口伪造语音识别。
- DeepSeek 文本与视觉 Provider 分离。视觉推理 MUST NOT 在 Vercel Function 内加载模型权重。
- 视觉端点必须是部署了 DeepSeek-VL 权重的独立 GPU 推理服务。

### 1.2 模型指定
- 文本 Primary：`deepseek-chat`（可通过 `DEEPSEEK_TEXT_MODEL_PRIMARY` 覆盖）
- 文本 Fallback：`deepseek-reasoner`（可通过 `DEEPSEEK_TEXT_MODEL_FALLBACK` 覆盖）
- 视觉：通过 `DEEPSEEK_VISION_MODEL` 指定，由独立 DeepSeek-VL endpoint 提供服务

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
interface PropertyExtractionInput extends AIRequestContext {
  text: string;
  sourceType: 'text' | 'speech' | 'wechat';
  workspaceId: string;
  userId: string;
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

## 10. 重试策略

| 场景 | 策略 |
|---|---|
| DeepSeek 超时 | 最多重试 1 次，使用备用 DeepSeek 模型 |
| DeepSeek 5xx | 最多重试 1 次，使用备用 DeepSeek 模型 |
| JSON 格式错误 | 使用 DeepSeek 备用模型进行 1 次结构修复 |
| 4xx / 权限拒绝 | 不重试 |
| Schema 校验失败 | 不重试 |
| 合规拒绝 | 不重试 |
| 连续 3 次 5xx/超时/连接失败 | 打开 circuit breaker，自动切换备用模型 |

**超时策略**：
- 文本模型：45 秒（`DEEPSEEK_REQUEST_TIMEOUT_MS`）
- 视觉模型：60 秒
- STT：30 秒

---

## 11. 图片 URL 安全规则

1. 公共 API 优先接收 `propertyMediaIds`，服务端生成短期签名 URL。
2. Provider 内部接口可以使用 `imageUrls` 数组，但 URL MUST 由服务端生成且经过：
   - 域名白名单校验
   - SSRF 防护（拒绝 `file://`、环回地址、云元数据地址、内网地址）
3. MUST NOT 将永久公开 URL 发送给视觉端点。
4. MUST NOT 允许客户端传入任意 URL。
5. 发送前移除不必要 EXIF 元数据。
6. 单次视觉分析默认最多 8 张图片（`DEEPSEEK_VISION_MAX_IMAGES`）。

---

## 12. AI 请求 10 步顺序

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

## 13. Prompt 版本管理

- 每个 AI 能力的 Prompt 模板必须版本化。
- `prompt_version` 记录在 `ai_usage_logs` 和 `content_versions` 中。
- Prompt 变化必须更新版本号。
- Prompt 模板由 `src/lib/ai/prompts/` 下的 `ai-deepseek-engineer` 拥有。

---

## 14. 依赖与归属

- 所有 Provider 接口实现由 **ai-deepseek-engineer** 拥有。
- Zod Schema 由 **ai-deepseek-engineer** 拥有（`src/lib/ai/schemas/`）。
- Prompt 模板由 **ai-deepseek-engineer** 拥有（`src/lib/ai/prompts/`）。
- 隐私预处理模块由 **ai-deepseek-engineer** 拥有（`src/lib/privacy/`）。
- 合规扫描模块由 **ai-deepseek-engineer** 拥有（`src/lib/compliance/`）。
- `reserve_ai_quota` 数据库函数由 **data-security-engineer** 实现，接口与 **ai-deepseek-engineer** 协商。
- 此契约冻结后，任何修改 MUST 通过 ADR 流程。

---

## 15. Open Questions

无。所有影响 Phase 1 的问题均已在 HouseVibe Phase 0 v1.0 中冻结。
