# ADR-004: Foundation Security Module Ownership

| 属性 | 值 |
|---|---|
| 文档名称 | ADR-004-foundation-security-module-ownership |
| 版本 | 1.0 |
| 状态 | accepted |
| Owner | solution-architect |
| 依赖 | PRD v1.3, OWNERSHIP.md, Phase 1-A Bootstrap |
| 最后更新 | 2026-07-30 |

---

## 1. 背景

Phase 1-A bootstrap (`PHASE1A-BOOTSTRAP-001`) 在实现期间，两个安全关键模块因所有权边界定义不清被放置到了 `src/lib/supabase/` 目录下：

1. **环境变量 Schema 模块**（`src/lib/supabase/env.ts`）。该文件提供 `getPublicEnv()` 和 `getServerEnv()` 函数，对 Public/Server 环境变量进行 Zod 校验，并为 `getServerEnv()` 实现了浏览器上下文运行时守卫。此模块不依赖 Supabase 客户端或 Supabase 相关逻辑，属于通用安全基础设施。

2. **隐私脱敏模块**（`src/lib/supabase/redaction.ts`）。该文件提供 `redactSensitiveFields()`、`isSensitiveField()` 和 `getSensitiveFieldNames()` 三个函数，对 11 个敏感字段进行删除级脱敏。此模块不依赖 Supabase 客户端，属于通用隐私工具。

这两个模块被放入 `src/lib/supabase/` 的原因：

- 当前的 OWNERSHIP.md 中，`integration-engineer` 拥有 `src/config/**` 和 `src/lib/env/**`。但此处的 `env.ts` 与 `error-and-env-conventions.md` 中冻结的 `src/lib/env/schema.ts` 设计不同（后者是单一 `validateEnv()` 函数，前者是分离的 Public/Server 模式带运行时守卫），且环境变量安全分类属于数据安全而非构建配置范畴。
- `src/lib/privacy/` 在 OWNERSHIP.md 中完全没有分配 Owner。PRD 第 10.6 节定义了 11 个隐私字段清单，第 10.9 节定义了配额原子预占的安全要求，第 10.11 节要求敏感日志脱敏——这些都属于数据安全工程师的职责范围，但当前所有权矩阵遗漏了隐私工具目录。
- `data-security-engineer` 拥有 `src/lib/supabase/**`，被用作上述两个模块的临时落脚点。

这是一个所有权缺陷，必须在 Phase 1-A 中修正，否则后续实现将产生以下风险：

- 环境变量安全分类逻辑被错误关联到 Supabase 命名空间，导致其他 Agent 在查找环境配置时绕过该模块。
- 隐私脱敏逻辑无明确 Owner，`ai-deepseek-engineer` 或其他 Agent 可能在不经过安全审查的情况下修改隐私字段清单。
- OWNERSHIP.md 和 Hook 中的所有权矩阵与实际模块位置不一致，导致 Hook 边界校验失效。

---

## 2. 决策

### 2.1 环境变量配置模块

- **正式路径**：`src/config/env.ts`
- **Owner**：`data-security-engineer`
- **职责**：环境变量 Schema 定义、安全分类（Public vs Server Secret vs Optional Config）、Server/Public 隔离、运行时客户端调用守卫
- **与 integration-engineer 的边界**：
  - `integration-engineer` 继续拥有 `.env.example`、构建配置（`next.config.*`）、部署配置（`vercel.json`）
  - `integration-engineer` 保留 `src/lib/env/schema.ts` 的所有权（该文件为 `error-and-env-conventions.md` 冻结的契约参考实现）
  - `data-security-engineer` 拥有的 `src/config/env.ts` 是运行时环境验证实现，包含分离的 Public/Server 模式
- **新增环境变量的约束**：
  - 任何新增环境变量必须更新 `src/config/env.ts` 中的 Zod Schema 和契约注释
  - 新增 `NEXT_PUBLIC_*` 变量必须同时更新 `.env.example`
  - 新增 Server Secret 变量不得提供默认值，且必须在 Schema 中标记 `MUST NOT 暴露给浏览器`
  - 破坏现有 Schema 形状的变更（如重命名、删除必填字段）需要新的 ADR
- **客户端调用约束**：
  - 客户端代码 MUST NOT 直接 import `getServerEnv()`
  - 任何 `src/config/env.ts` 的 Server Secret 方法调用必须位于 `typeof window === 'undefined'` 守卫之后或服务端专属运行上下文（Server Components、Route Handlers、Server Actions）
  - 运行时 `window` 守卫作为最后防线，但不能替代静态分析（ESLint 规则可在后续 ADR 中讨论）

### 2.2 隐私脱敏模块

- **正式路径**：`src/lib/privacy/`（基础实现：`src/lib/privacy/redaction.ts`）
- **Owner**：`data-security-engineer`
- **职责**：敏感字段清单维护、脱敏算法实现、字段级隐私分类判断
- **与其他 Agent 的边界**：
  - `ai-deepseek-engineer` 可以调用此模块进行 AI 请求前的隐私预处理（如 PRD 第 10.6 节要求），但 MUST NOT 修改隐私字段清单或脱敏逻辑
  - `property-crm-engineer` 可以调用此模块在共享房源视图和 API 响应中进行脱敏，但 MUST NOT 修改脱敏规则
  - 任何 Agent 调用 `redactSensitiveFields()` 时，不得拦截或缓存返回值中的敏感数据
- **隐私字段清单变更约束**：
  - 敏感字段清单（当前 11 个字段）是冻结的安全决策
  - 新增、删除或重命名敏感字段必须通过 ADR 变更
  - 字段清单必须与 PRD 第 10.6 节保持一致
  - 每次修改必须附带影响分析：评估哪些 API、视图和 AI Prompt 会受影响
- **模块隔离约束**：
  - `src/lib/privacy/` MUST NOT 依赖 Supabase Client（`@supabase/supabase-js`）
  - `src/lib/privacy/` MUST NOT 依赖任何 AI/LLM 库
  - `src/lib/privacy/` 可以是纯函数模块，仅依赖 TypeScript 类型

### 2.3 Supabase 模块边界

- **`src/lib/supabase/` 的明确范围**：仅包含 Supabase 直接相关代码
  - 浏览器客户端（`browser.ts`）
  - 服务端客户端（`server.ts`）
  - 未来管理员客户端（`admin.ts`）
  - Supabase 类型推导（`database.types.ts` 引用）
  - 查询辅助函数（条件构建器、分页等）
- **`src/lib/supabase/` MUST NOT 包含**：
  - 通用环境变量 Schema（已移至 `src/config/env.ts`）
  - 通用隐私工具（已移至 `src/lib/privacy/redaction.ts`）
  - 非 Supabase 的 AI 或业务工具
  - 通用合规扫描逻辑（属于 `src/lib/compliance/`，由 `ai-deepseek-engineer` 拥有）
  - 通用错误类或 HTTP 工具（属于 `src/lib/errors.ts`，由 `integration-engineer` 拥有）

### 2.4 所有权矩阵变更

在 OWNERSHIP.md 的 `data-security-engineer` 行中，精确新增以下路径：

```
src/config/env.ts
src/config/**/*.test.ts
src/lib/privacy/**
```

**不得扩展为**：
```
src/config/**          （过于宽泛，会捕获 admin-navigation.ts 等 integration-engineer 拥有的文件）
src/lib/**             （过于宽泛，会捕获 AI、compliance、errors 等）
src/config/*.ts        （过于宽泛，会捕获 admin-navigation.ts）
```

具体变更（在 OWNERSHIP.md 的 `data-security-engineer` 路径列表中追加）：

| 新增路径 | 匹配内容 | 不匹配 |
|---|---|---|
| `src/config/env.ts` | 环境变量 Schema 模块 | 不匹配 `src/config/admin-navigation.ts` |
| `src/config/**/*.test.ts` | 环境配置相关测试 | 不匹配非测试文件 |
| `src/lib/privacy/**` | 隐私脱敏模块及子文件 | 不匹配 `src/lib/supabase/`、`src/lib/ai/` 等 |

同步更新 `.claude/hooks/enforce-agent-boundaries.mjs` 中 `data-security-engineer` 的路径数组，追加相同的三个路径条目。

**从 `src/lib/supabase/` 中移除的内容**：
- `src/lib/supabase/env.ts` 将被移动到 `src/config/env.ts`
- `src/lib/supabase/redaction.ts` 将被移动到 `src/lib/privacy/redaction.ts`

**`integration-engineer` 不受影响**：
- 保留 `src/config/**` 的所有权（admin-navigation.ts 等）
- 保留 `src/lib/env/**` 的所有权（schema.ts 契约参考实现）
- 保留 `.env.example`、构建配置、部署配置的所有权

### 2.5 Hook 边界更新

`.claude/hooks/enforce-agent-boundaries.mjs` 中 `data-security-engineer` 的路径数组需追加以下三个条目（与 OWNERSHIP.md 保持一致）：

```js
"src/config/env.ts",
"src/lib/privacy/",
```

其中 `src/config/**/*.test.ts` 的匹配已被 `test-engineer` 的测试文件后缀逻辑覆盖，不需要在 `data-security-engineer` 中显式添加（`test-engineer` 拥有 `src/**` 下所有 `.test.ts` 文件的跨目录写权限）。

实际上，`src/config/**/*.test.ts` 文件的写入遵循以下逻辑：
- `data-security-engineer` 拥有 `src/config/env.ts`（源文件）
- `test-engineer` 拥有所有 `src/**/*.test.ts` 文件（跨目录测试权限）
- 因此 `src/config/env.test.ts` 由 `test-engineer` 编写，不需要额外的所有权分配

---

## 3. 影响分析

### 3.1 不影响的领域

- **API 契约**：本 ADR 不改变任何 API 端点、请求/响应格式或错误码
- **数据库 Schema**：本 ADR 不改变任何表结构、RLS 策略或索引
- **RLS 策略**：本 ADR 不改变任何 RLS 函数的实现或授权逻辑
- **业务需求**：本 ADR 不影响房源管理、客户管理、内容生成、匹配等任何业务功能
- **Supabase 存储**：本 ADR 不改变存储 Bucket 策略或文件访问规则
- **冻结契约**：已冻结的 domain-model、api-contract、rls-contract、ai-contract、entitlement-authorization-matrix、compliance-and-audit-contract、error-and-env-conventions 均无需修改

### 3.2 影响的领域

| 影响 | 范围 | 程度 |
|---|---|---|
| 文件移动 | `src/lib/supabase/env.ts` → `src/config/env.ts` | 低（纯路径变更，不影响功能） |
| 文件移动 | `src/lib/supabase/redaction.ts` → `src/lib/privacy/redaction.ts` | 低（纯路径变更，不影响功能） |
| OWNERSHIP.md 更新 | `data-security-engineer` 行追加 3 个路径 | 低（精确追加，不覆盖现有路径） |
| Hook 更新 | `data-security-engineer` 数组追加 2 个路径 | 低（精确追加，不覆盖现有路径） |
| Import 路径更新 | 任何引用 `@/lib/supabase/env` 或 `@/lib/supabase/redaction` 的代码 | 低（路径别名更新，TypeScript 编译时捕获） |

### 3.3 对并行 Agent 的影响

- **`data-security-engineer`**：承担新模块的 owner 职责。需要将两个文件移动到新路径，更新 import 引用，并在未来的安全需求中维护隐私字段清单和环境变量 Schema。这是 Phase 1-A 的剩余工作。
- **`integration-engineer`**：不受影响。贡献 `/src/config/` 和 `/src/lib/env/` 的现有所有权不变。
- **`ai-deepseek-engineer`**：可以继续调用隐私脱敏模块（现在通过 `@/lib/privacy/redaction` 导入）。不获得隐私模块的修改权限。这是预期行为。
- **`property-crm-engineer`**：不受影响。
- **`mobile-ui-engineer`**：不受影响。
- **`test-engineer`**：可以跨目录编写 `src/config/env.test.ts` 和 `src/lib/privacy/redaction.test.ts`。不受所有权变更影响。

### 3.4 执行顺序

1. 本 ADR 被接受后立即生效
2. 后续 task 将执行实际的文件移动、OWNERSHIP.md 更新和 Hook 更新
3. 所有 import 路径必须在文件移动时同步更新
4. 移动后必须通过 `npm run typecheck` 和 `npm run lint` 验证

---

## 4. 替代方案（已拒绝）

### 方案 A：env.ts 保留在 src/config/ 但 Owner 改为 integration-engineer

- **拒绝理由**：`integration-engineer` 的职责是集成、构建和部署配置；环境变量的安全分类、Server/Public 隔离和运行时守卫属于数据安全领域。将安全关键模块交给集成工程师会造成职责不清，且 `integration-engineer` 不在安全审查流程中。

### 方案 B：redaction.ts 放入 src/lib/supabase/ 由 data-security-engineer 维护

- **拒绝理由**：隐私脱敏逻辑与 Supabase 没有任何依赖关系。将其放在 Supabase 目录下会造成命名空间污染，且其他 Agent（尤其是 `ai-deepseek-engineer`）在寻找隐私工具时会误导到 Supabase 上下文。

### 方案 C：使用更宽泛的通配符（如 src/config/**）给 data-security-engineer

- **拒绝理由**：`src/config/admin-navigation.ts` 由 `integration-engineer` 拥有（见 ADR-001），授予 `data-security-engineer` 对 `src/config/**` 的完整权限会破坏 ADR-001 的所有权决策并造成两个 Agent 的写权限冲突。精确路径匹配是必须的。

### 方案 D：完全删除 src/lib/env/schema.ts 的 integration-engineer 所有权，由 data-security-engineer 统一拥有

- **拒绝理由**：`error-and-env-conventions.md` 的 `src/lib/env/schema.ts` 是 Phase 0 冻结的契约参考实现，与 `src/config/env.ts` 的设计不同（前者是单一验证函数，后者是分离的 Public/Server 模式）。两者可以共存，且 `src/lib/env/schema.ts` 属于契约文档的代码引用，由 `integration-engineer` 维护是合理的。

---

## 5. 状态

**accepted** -- 本 ADR 在 Phase 1-A 中被立即接受并生效。文件移动、所有权更新和 Hook 更新在后续 task 中执行。
