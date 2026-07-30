# HouseVibe Error & Environment Conventions

| 属性 | 值 |
|---|---|
| 文档名称 | error-and-env-conventions |
| 版本 | 1.0 |
| 状态 | FROZEN FOR PHASE 1 |
| Owner | solution-architect |
| 依赖 | PRD v1.3, api-contract v1.0 |
| 最后更新 | 2026-07-30 |

---

## 1. 统一响应 Envelope

### 1.1 成功响应

```json
{
  "data": {},
  "error": null
}
```

### 1.2 错误响应

```json
{
  "data": null,
  "error": {
    "code": "ERROR_CODE",
    "message": "人类可读中文描述",
    "details": {}
  }
}
```

### 1.3 TypeScript 类型

```ts
// Owner: integration-engineer
// Location: src/lib/types/api.ts

type ApiResponse<T> =
  | { data: T; error: null }
  | { data: null; error: ApiError };

interface ApiError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}
```

---

## 2. 全部错误码

### 2.1 错误码到 HTTP 状态码映射

| 错误码 | HTTP 状态码 | 说明 | 客户端建议 |
|---|---|---|---|
| `UNAUTHENTICATED` | 401 | 未登录或 Session 过期 | 跳转登录页 |
| `FORBIDDEN` | 403 | 无权执行此操作 | 显示无权限提示 |
| `WORKSPACE_ACCESS_DENIED` | 403 | 不属于目标 workspace | 返回首页 |
| `FEATURE_NOT_ALLOWED` | 403 | 缺少所需功能授权 | 联系管理员 |
| `CONTENT_FACTORY_NOT_ALLOWED` | 403 | 缺少 content_factory 授权 | 联系管理员 |
| `PROPERTY_NOT_MARKETING_REUSABLE` | 403 | 房源未授权营销复用 | 提示不可用于内容生成 |
| `QUOTA_EXCEEDED` | 429 | AI 每日次数配额已用完 | 等待次日重置 |
| `COST_LIMIT_EXCEEDED` | 429 | AI 每日成本熔断 | 联系管理员 |
| `RATE_LIMITED` | 429 | 请求频率限制 | 等待后重试 |
| `RESOURCE_NOT_FOUND` | 404 | 资源不存在或无权访问 | 返回列表页 |
| `VALIDATION_FAILED` | 400 | 请求参数校验失败 | 显示校验错误 |
| `TRANSCRIPTION_DURATION_EXCEEDED` | 422 | 录音时长超过上限 | 缩短录音后重试 |
| `COMPLIANCE_BLOCKED` | 422 | 合规输入阶段拒绝（内容完全未生成） | 修改输入内容中的风险词后重试 |
| `INVALID_AI_OUTPUT` | 502 | AI 输出格式不符合 Schema | 重试 |
| `TRANSCRIPTION_TOO_LARGE` | 413 | 音频文件超过大小上限 (10MB) | 缩短录音或压缩 |
| `TRANSCRIPTION_UNSUPPORTED_MEDIA` | 415 | 音频格式不支持 | 使用支持的格式 |
| `TRANSCRIPTION_TIMEOUT` | 504 | STT 服务超时 | 重试 |
| `CONFLICT` | 409 | 资源冲突（如已存在） | 显示冲突信息 |
| `INTERNAL_ERROR` | 500 | 服务端内部错误 | 重试或联系支持 |

### 2.2 错误码 TypeScript 类型

```ts
type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'WORKSPACE_ACCESS_DENIED'
  | 'FEATURE_NOT_ALLOWED'
  | 'CONTENT_FACTORY_NOT_ALLOWED'
  | 'PROPERTY_NOT_MARKETING_REUSABLE'
  | 'QUOTA_EXCEEDED'
  | 'COST_LIMIT_EXCEEDED'
  | 'RATE_LIMITED'
  | 'RESOURCE_NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'COMPLIANCE_BLOCKED'
  | 'INVALID_AI_OUTPUT'
  | 'TRANSCRIPTION_TOO_LARGE'
  | 'TRANSCRIPTION_DURATION_EXCEEDED'
  | 'TRANSCRIPTION_UNSUPPORTED_MEDIA'
  | 'TRANSCRIPTION_TIMEOUT'
  | 'CONFLICT'
  | 'INTERNAL_ERROR';
```

### 2.3 AppError 类

```ts
// Owner: integration-engineer
// Location: src/lib/errors.ts

class AppError extends Error {
  constructor(
    public code: ErrorCode,
    public statusCode: number,
    public message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }

  toResponse(): Response {
    return Response.json(
      {
        data: null,
        error: {
          code: this.code,
          message: this.message,
          details: this.details,
        },
      },
      { status: this.statusCode }
    );
  }
}
```

---

## 3. 环境变量

### 3.1 分组

#### Public (NEXT_PUBLIC_*) -- 可暴露给浏览器

| 变量 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL | YES | - | Supabase 项目 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | string | YES | - | Supabase Anon Key (安全暴露给客户端) |
| `NEXT_PUBLIC_APP_URL` | URL | YES | - | 应用公开 URL |

#### Server Secret -- MUST NOT 暴露给浏览器，不得有默认值

| 变量 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | string | YES | - | 仅服务端使用，绕过 RLS |
| `DEEPSEEK_API_KEY` | string | YES | - | DeepSeek 文本模型 API Key |
| `DEEPSEEK_BASE_URL` | URL | YES | https://api.deepseek.com | DeepSeek API 端点 |
| `DEEPSEEK_VISION_BASE_URL_PRIMARY` | URL | YES | - | DeepSeek-VL 主端点 |
| `DEEPSEEK_VISION_BASE_URL_FALLBACK` | URL | YES | - | DeepSeek-VL 备用端点 |
| `DEEPSEEK_VISION_API_KEY` | string | YES | - | 视觉服务 API Key |
| `STT_BASE_URL` | URL | COND* | - | STT 服务端点 (*转写功能启用时必填) |
| `STT_API_KEY` | string | COND* | - | STT API Key |
| `CRON_SECRET` | string | NO | - | Cron Job 认证密钥 |
| `INVITE_TOKEN_SECRET` | string | YES | - | 邀请 Token 加密密钥 |

#### Optional Server Config -- 有合理默认值

| 变量 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `DEEPSEEK_TEXT_MODEL_PRIMARY` | string | NO | `deepseek-chat` | 文本主模型 |
| `DEEPSEEK_TEXT_MODEL_FALLBACK` | string | NO | `deepseek-reasoner` | 文本备用模型 |
| `DEEPSEEK_VISION_MODEL` | string | NO | `deepseek-vl2` | 视觉模型名 |
| `DEEPSEEK_VISION_MAX_IMAGES` | integer | NO | `8` | 单次最多分析图片数 |
| `DEEPSEEK_REQUEST_TIMEOUT_MS` | integer | NO | `45000` | 请求超时 (ms) |
| `TRANSCRIPTION_PROVIDER` | string | NO | - | STT Provider 类型 |
| `MAX_AUDIO_DURATION_SECONDS` | integer | NO | `60` | 最大录音时长 |
| `MAX_AUDIO_UPLOAD_BYTES` | integer | NO | `10485760` | 最大上传大小 (10MB) |
| `AI_DAILY_CONTENT_LIMIT` | integer | NO | `10` | 每日内容生成次数 |
| `AI_DAILY_COST_LIMIT_USD` | number | NO | `10.00` | 每日成本熔断线 (USD) |
| `AI_PREFERENCE_MIN_EVIDENCE` | integer | NO | `3` | 偏好学习最低证据数 |
| `AI_FAILURE_THRESHOLD` | integer | NO | `3` | Circuit breaker 阈值 |
| `AI_FAILURE_WINDOW_SECONDS` | integer | NO | `300` | 故障窗口 (秒) |
| `AI_QUOTA_TIMEZONE` | string | NO | `Asia/Shanghai` | 配额日期时区 |
| `COMPLIANCE_BLOCK_COPY` | boolean | NO | `true` | 合规 block 是否禁止复制 |
| `INITIAL_SYSTEM_ADMIN_EMAIL` | string | NO | - | 初始管理员邮箱（仅首次部署时使用） |

### 3.2 环境变量 Schema 校验

```ts
// Owner: integration-engineer
// Location: src/lib/env/schema.ts

import { z } from 'zod';

const envSchema = z.object({
  // Public
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),

  // Server Secret
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DEEPSEEK_API_KEY: z.string().min(1),
  DEEPSEEK_BASE_URL: z.string().url().default('https://api.deepseek.com'),
  DEEPSEEK_VISION_BASE_URL_PRIMARY: z.string().url(),
  DEEPSEEK_VISION_BASE_URL_FALLBACK: z.string().url(),
  DEEPSEEK_VISION_API_KEY: z.string().min(1),
  STT_BASE_URL: z.string().url().optional(),
  STT_API_KEY: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  INVITE_TOKEN_SECRET: z.string().min(32),

  // Optional Server Config
  DEEPSEEK_TEXT_MODEL_PRIMARY: z.string().default('deepseek-chat'),
  DEEPSEEK_TEXT_MODEL_FALLBACK: z.string().default('deepseek-reasoner'),
  DEEPSEEK_VISION_MODEL: z.string().default('deepseek-vl2'),
  DEEPSEEK_VISION_MAX_IMAGES: z.coerce.number().int().default(8),
  DEEPSEEK_REQUEST_TIMEOUT_MS: z.coerce.number().int().default(45000),
  TRANSCRIPTION_PROVIDER: z.string().optional(),
  MAX_AUDIO_DURATION_SECONDS: z.coerce.number().int().default(60),
  MAX_AUDIO_UPLOAD_BYTES: z.coerce.number().int().default(10485760),
  AI_DAILY_CONTENT_LIMIT: z.coerce.number().int().default(10),
  AI_DAILY_COST_LIMIT_USD: z.coerce.number().default(10.00),
  AI_PREFERENCE_MIN_EVIDENCE: z.coerce.number().int().default(3),
  AI_FAILURE_THRESHOLD: z.coerce.number().int().default(3),
  AI_FAILURE_WINDOW_SECONDS: z.coerce.number().int().default(300),
  AI_QUOTA_TIMEZONE: z.string().default('Asia/Shanghai'),
  COMPLIANCE_BLOCK_COPY: z.coerce.boolean().default(true),
  INITIAL_SYSTEM_ADMIN_EMAIL: z.string().email().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Environment validation failed:', result.error.format());
    throw new Error('Invalid environment configuration. Check server logs.');
  }
  return result.data;
}
```

### 3.3 DeepSeek 模型环境变量默认策略

1. MUST NOT 在代码中硬编码 API Key。
2. 模型名称允许通过环境变量覆盖。
3. `DEEPSEEK_TEXT_MODEL_PRIMARY` 缺失时默认 `deepseek-chat`。
4. `DEEPSEEK_TEXT_MODEL_FALLBACK` 缺失时默认 `deepseek-reasoner`。
5. `DEEPSEEK_API_KEY`、视觉服务 Endpoint MUST NOT 提供危险默认值；缺少时应用启动产生清晰错误。
6. 视觉模型由独立 DeepSeek-VL 推理服务提供，MUST NOT 在 Vercel Serverless 内加载模型。
7. STT 是独立子系统，不属于 LLM。
8. MUST NOT 重新引入 OpenAI、Anthropic 或 Gemini 的 API Key 或回退路径。

---

## 4. 依赖与归属

- 错误响应 Envelope 和 `AppError` 类：**integration-engineer** (`src/lib/errors.ts`)
- 环境变量 Schema：**integration-engineer** (`src/lib/env/schema.ts`)
- 环境变量 `.env.example`：**integration-engineer**
- 错误码和 HTTP 映射：本契约冻结，各 Agent 在实现时引用
- AI 相关环境变量消费：**ai-deepseek-engineer**
- Supabase 相关环境变量消费：**data-security-engineer**
- Next.js 公共环境变量消费：**mobile-ui-engineer**, **integration-engineer**

---

## 5. Open Questions

无。所有影响 Phase 1 的问题均已在 HouseVibe Phase 0 v1.0 中冻结。
