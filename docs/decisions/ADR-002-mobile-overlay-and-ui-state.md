# ADR-002: Mobile Overlay and UI State Conventions

| 属性 | 值 |
|---|---|
| 文档名称 | ADR-002-mobile-overlay-and-ui-state |
| 版本 | 1.0 |
| 状态 | accepted |
| Owner | solution-architect |
| 依赖 | PRD v1.3, mobile-ui.md rule |
| 最后更新 | 2026-07-30 |

---

## 背景

HouseVibe 是 mobile-first 产品，核心路径必须在 375px 宽度下可用。PRD 和 `.claude/rules/mobile-ui.md` 已经确立了移动端使用 Vaul/shadcn Drawer（底部抽屉）、桌面端使用 shadcn Dialog（居中弹窗）的基本策略，并要求统一封装 `ResponsiveOverlay` 组件。

但在多 Agent 并行开发中，需要冻结以下规范以避免各 Agent 自行解释，导致：
1. 不同页面的 Overlay 行为不一致。
2. 移动端和桌面端的断点标准不统一。
3. UI 状态（loading/empty/error/retry）的归属不明确。
4. iOS Safari 软键盘适配被遗漏。

---

## 决策

### 1. ResponsiveOverlay 行为规范

| 场景 | 移动端 (< 768px) | 桌面端 (>= 768px) |
|---|---|---|
| 组件 | Vaul/shadcn `Drawer` | shadcn `Dialog` |
| 位置 | 底部弹出 | 居中 |
| 最大高度 | `92dvh` | 无限制（内容自适应） |
| 内部滚动 | 独立滚动区域 | 无限制 |
| Safe Area | `padding-bottom: env(safe-area-inset-bottom)` | 无 |
| 背景锁定 | 打开时锁定背景滚动 | 打开时锁定背景滚动 |
| 关闭恢复 | 恢复原滚动位置 | 恢复原滚动位置 |

### 2. ResponsiveOverlay 使用场景

**必须使用 ResponsiveOverlay 的场景：**
- 房源筛选条件
- 客户筛选条件
- AI 智能录入确认卡片
- 共享房源脱敏预览
- 删除/发布确认（二次确认）
- 简短状态更新表单

**必须使用独立页面的场景：**
- 完整房源新增/编辑（超过约 8 个主要字段）
- 完整客户编辑
- 内容生成工作台

**不得将完整房源表单（超过约 8 个主要字段）塞入普通 Dialog。**

### 3. 断点标准

| 断点 | 宽度 | 用途 |
|---|---|---|
| Mobile | < 768px | 底部导航，卡片布局，Drawer |
| Desktop | >= 768px | 侧栏导航，可选表格布局，Dialog |

使用 Tailwind 默认断点 `md:` (768px) 作为移动/桌面切换点。

### 4. 页面高度单位

- 页面容器使用 `100dvh`（动态视口高度），不使用 `100vh`。
- Drawer 内容区使用 `max-h-[92dvh]`。
- 底部导航固定，使用 `h-[env(safe-area-inset-bottom,0px)]` 作为底部 safe area padding。

### 5. iOS 软键盘适配

- 输入框 `focus` 时滚动到可视区域（使用 `scrollIntoView({ block: 'center' })` 或 `element.focus({ preventScroll: false })`）。
- 键盘不遮挡表单底部操作区。
- 测试场景：iOS Safari 下 Drawer 内表单的最后一项输入框和提交按钮在键盘弹出后仍可操作。

---

## UI 状态规范

### 通用 UI Primitive（mobile-ui-engineer 负责）

这些是跨业务复用的通用 UI 状态组件，MUST 由 `mobile-ui-engineer` 在 `src/components/ui/` 下实现：

| 状态 | 组件名 | 说明 |
|---|---|---|
| 页面级 Loading | `PageLoading` | 全页面加载骨架 |
| 区块级 Loading | `SectionSkeleton` | 卡片/列表加载骨架 |
| 空状态 | `EmptyState` | 图标 + 标题 + 描述 + 可选操作按钮 |
| 错误状态 | `ErrorState` | 错误图标 + 消息 + 重试按钮 |
| 提交中 | `SubmittingOverlay` | 表单提交遮罩 |
| 成功 Toast | 使用 shadcn `Sonner` / `Toast` | 成功反馈 |
| 禁用状态 | 通过 Tailwind `disabled:` variant | 按钮/输入禁用 |
| 破坏性操作确认 | `DestructiveConfirm` | 包装 ResponsiveOverlay 的确认对话框 |

### 通用 UI Primitive 接口

```ts
// Owner: mobile-ui-engineer
// Location: src/components/ui/

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  error?: Error;
}

interface SectionSkeletonProps {
  count?: number;     // 骨架项数
  height?: string;    // 每项高度
  className?: string;
}

interface DestructiveConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
}
```

### 业务 Feature 负责的内容

以下由具体的业务 feature Agent 负责：

| 内容 | 负责 Agent |
|---|---|
| 具体 Empty 文案 | 各业务 Agent（如 "暂无房源" vs "暂无客户"） |
| 具体 Error 消息 | 各业务 Agent（根据 API error code 映射） |
| 表单校验错误 | 各业务 Agent（Zod + React Hook Form） |
| 表单保存反馈 | 各业务 Agent（成功/失败 Toast） |

### 语音流程专属状态

语音录入流程有独立的状态机，由 `ai-deepseek-engineer` 负责实现 UI 状态：

```
recording → recorded → uploading → transcribing → transcribed → confirmed
任意阶段 → failed / cancelled
```

语音 UI 状态 MUST 包含：录音时长、波形显示、实时状态文本、剩余时间倒计时。

---

## 影响

### 对 mobile-ui-engineer 的影响

- 负责实现 `ResponsiveOverlay` 组件（或基于 Vaul/shadcn 的封装）。
- 负责实现 `PageLoading`, `SectionSkeleton`, `EmptyState`, `ErrorState`, `DestructiveConfirm` 等通用 UI Primitives。
- 负责 `src/app/(dashboard)/layout.tsx`（底部导航 + 桌面侧栏）。
- 负责 Safe Area 适配和软键盘行为测试。

### 对 property-crm-engineer 的影响

- 房源/客户/任务的 Empty, Error, Loading 状态使用 mobile-ui-engineer 提供的通用组件。
- 筛选、确认等短流程使用 `ResponsiveOverlay`。
- 完整表单页面使用独立路由页面。
- 不负责实现 Overlay 或通用状态组件。

### 对 ai-deepseek-engineer 的影响

- AI 录入确认卡片使用 `ResponsiveOverlay`。
- 语音流程 UI 状态由自己实现（因状态机复杂且业务特定）。
- 内容生成结果展示页面的 loading/error 状态使用通用组件。
- 筛选和确认使用 `ResponsiveOverlay`。

### 对 data-security-engineer 的影响

- 设置/Profile 页面使用通用 `EmptyState` 和 `ErrorState`。
- 管理员页面主要为桌面端，可使用 Dialog（由 ResponsiveOverlay 自动适配）。

---

## 状态

**accepted** -- 此规范已冻结，所有 UI 相关 Agent 必须遵守。

---

## 测试要求

- `ResponsiveOverlay` 在移动端和桌面端的切换行为必须通过单元测试验证（`test-engineer` 负责）。
- 语音流程各状态必须有集成测试覆盖（`test-engineer` 负责）。
- iOS Safari 软键盘场景纳入 E2E 测试用例（PRD 第 16.3 节，用例 19）。
