# P3-AI-001 Handoff — integration-engineer

| 属性 | 值 |
|---|---|
| Task ID | P3-AI-001-SCOPE-CLOSE-061 |
| Agent | integration-engineer |
| Status | SCOPE FROZEN — awaiting implementation; independent review complete |
| Date | 2026-08-03 |
| Contract | ai-contract.md v2.0 |
| Terminal Close | P3-AI-001-TERMINAL-CLOSE-066 |

## Contract Freeze Summary

P3-AI-001 (DeepSeek Text Provider) contracts are frozen as of 2026-08-03.

### Model Name Superseding

Phase 1 contracts referenced deprecated model names. These are now superseded:

| Old Name | New Name | Env Var |
|---|---|---|
| `deepseek-chat` | `deepseek-v4-flash` | `DEEPSEEK_MODEL` |
| `deepseek-reasoner` | `deepseek-v4-pro` | `DEEPSEEK_FALLBACK_MODEL` |
| `DEEPSEEK_TEXT_MODEL_PRIMARY` | `DEEPSEEK_MODEL` | (renamed) |
| `DEEPSEEK_TEXT_MODEL_FALLBACK` | `DEEPSEEK_FALLBACK_MODEL` | (renamed) |

### Key Contract Decisions

- API: Chat Completions (`POST /v1/chat/completions`, OpenAI-compatible)
- Response format: `json_object` with Zod `strict()` validation
- Env: All AI variables optional in global schema; Provider validates at call time
- Retry: Max 2 attempts (1 primary + max 1 retry); rules per ai-contract §10.2
- Circuit Breaker: Deferred (P3-AI-016)
- Smoke tests: Separate file, dual-gated, excluded from default vitest
- Thinking: Disabled by default for structured extraction

### Commit Split

The scope is split into two commits:

**Commit A** (Contract Freeze):
- `docs/contracts/ai-contract.md`
- `docs/contracts/api-contract.md`
- `docs/contracts/error-and-env-conventions.md`
- `docs/plans/implementation-plan.md`
- `docs/handoffs/P3-AI-001-integration-engineer.md` (this file)

**Commit B** (Optional AI Environment Readiness):
- `.env.example`
- `src/config/env.ts`
- `src/config/env.test.ts`
- `vitest.config.ts`

Neither commit contains Provider implementation, API routes, or business logic changes.

### What Is NOT In Scope

- No `src/lib/ai/` directory
- No `DeepSeekTextProvider` implementation
- No `/api/ai/` routes
- No DeepSeek API calls
- No real `DEEPSEEK_API_KEY` usage
- No database changes
- No PRD modifications

### Terminal Close Resolutions (2026-08-03)

- **HTTPS-only**：`DEEPSEEK_BASE_URL`、`DEEPSEEK_VISION_BASE_URL_PRIMARY`、`DEEPSEEK_VISION_BASE_URL_FALLBACK` 已实现 HTTPS-only 校验（localhost HTTP 仅允许 dev/test）。
- **Provider Error 字段统一**：`ai-contract.md` §19 全文统一为 `upstreamStatus`（已移除 `statusCode`）。
- **AI ErrorCode 同步**：`AI_NOT_CONFIGURED`、`AI_TIMEOUT`、`AI_RATE_LIMITED`、`AI_UPSTREAM_ERROR`、`AI_INVALID_RESPONSE` 已同步到 `api-contract.md` §1.3、`error-and-env-conventions.md` §2.1/§2.2 和 `src/lib/types/api.ts` ErrorCode 类型。`AI_REQUEST_ABORTED` 保持 Provider 内部错误。
- **Smoke Test**：联网 Smoke Test 为后续独立任务，Owner 为 `integration-engineer`。Smoke 文件与 `package.json` 脚本必须同一任务交付。当前 P3-AI-001 Provider 门禁只使用 Mock。
- **Service Role**：`SUPABASE_SERVICE_ROLE_KEY` 不属于应用运行时 `serverEnvSchema`。Route Handler、AI Provider 和应用代码禁止读取。
- **PRD 旧引用**：`ai-contract.md` v2.0 模型合同 supersede PRD 中旧模型引用。PRD 全文重写登记为 Deferred 文档清理。
